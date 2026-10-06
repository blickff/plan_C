/* Electron shell: a small widget that sits on the desktop, and the full
   panel behind it.

   The pages are served from a scheme of the app's own, app://panel,
   rather than loaded with file://, and that is not incidental:

   1. Storage. Pages opened as file:// get an opaque origin, and two
      windows would not reliably share one localStorage — the widget and
      the panel would each keep their own separate habits.
   2. Network. The weather call is blocked from a file:// page in some
      browsers.
   3. The origin never changes. It was an http server on a port the
      system picked, and a new port every launch meant a new origin and
      an empty panel every launch. See serve().

   The same files are served that a browser would open by hand. Nothing
   in the panel knows it is running inside Electron. */

const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu,
        nativeImage, nativeTheme, Notification, protocol, shell, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const vault = require('./vault');
const updates = require('./updates');

const ROOT = path.join(__dirname, '..');

/* On Linux a window carries its own icon, for the dock and the window
   switcher; Windows and macOS take it from the installed app. */
const WINDOW_ICON = process.platform === 'linux' ? { icon: path.join(__dirname, 'icon.png') } : {};

/* Pinned rather than left to Electron.

   Electron names this folder after the product, so every rename of the
   product would move where it looks for the data. The app started as
   "Day Panel" and is now "Daybook"; left to Electron, 1.1.0 would have
   opened onto an empty profile while everyone's history sat untouched
   in the old folder, with nothing on screen to say so. The folder keeps
   its first name for good, whatever the app is called. Must run before
   the app is ready. */
/* DAYBOOK_PROFILE=name in the environment gives the app a folder of its
   own — and with it its own single-instance lock — so a build can be
   tried beside the copy somebody is actually using, without touching its
   data or being turned away as a second instance. Nothing sets it in
   normal use. */
const PROFILE = process.env.DAYBOOK_PROFILE
  ? 'day-panel-' + String(process.env.DAYBOOK_PROFILE).replace(/[^a-z0-9-]/gi, '')
  : 'day-panel';
app.setPath('userData', path.join(app.getPath('appData'), PROFILE));
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

/* Registered before the app is ready, which is the only time Chromium
   will accept it. 'standard' gives the scheme a host and working
   relative paths; 'secure' makes it a secure context, which the
   clipboard and fetch both want. */
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

let widget = null;
let panel = null;
let origin = null;
let tray = null;
/* The page's colours, as last reported, so a window opened later starts
   in them instead of flashing the wrong ones. */
let lastTheme = null;

/* Where the widget was left, and how it was set to behave. Kept in
   Electron's own data folder rather than in the page's storage: it is
   about the window, not about the habits. */
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveState(patch) {
  const next = Object.assign(loadState(), patch);
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save window state.', err);
  }
}

/* Starting at login ------------------------------------------------------

   Windows and macOS keep the list of programs that start at login
   themselves, and Electron asks them (setLoginItemSettings). Linux has no
   such list to ask: the desktops — GNOME, KDE and the rest — read
   ~/.config/autostart, where a small .desktop file is the entry. So on
   Linux the app writes that file, or removes it. */
function autostartFile() {
  const suffix = PROFILE === 'day-panel' ? '' : PROFILE.replace(/^day-panel/, '');
  return path.join(app.getPath('appData'), 'autostart', 'daybook' + suffix + '.desktop');
}

/* A path in a .desktop file's Exec line, quoted as that format wants. */
function execQuote(text) {
  return '"' + String(text).replace(/(["`$\\])/g, '\\$1') + '"';
}

function autostartOn() {
  if (process.platform !== 'linux') return app.getLoginItemSettings().openAtLogin;
  return fs.existsSync(autostartFile());
}

function setAutostart(on) {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: on });
    return autostartOn();
  }
  const file = autostartFile();
  try {
    if (!on) {
      fs.rmSync(file, { force: true });
    } else {
      /* An AppImage is started through the file itself (APPIMAGE), not
         the copy it unpacks to a temporary folder each time. */
      const exec = [process.env.APPIMAGE || process.execPath]
        .concat(app.isPackaged ? [] : [app.getAppPath()])
        .map(execQuote);
      if (process.env.DAYBOOK_PROFILE) exec.unshift('env', 'DAYBOOK_PROFILE=' + PROFILE.replace(/^day-panel-/, ''));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Daybook',
        'Comment=Your day, your habits, your notes and your spending',
        'Exec=' + exec.join(' '),
        'Icon=daybook',
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        ''
      ].join('\n'), 'utf8');
    }
  } catch (err) {
    console.warn('autostart: could not ' + (on ? 'write ' : 'remove ') + file + ': ' + err.message);
  }
  return autostartOn();
}

/* One fixed origin, app://panel, for the whole life of the app.

   This used to be an http server on whatever port the system handed
   out, and that was quietly the worst bug in the project. localStorage
   belongs to an origin, and an origin includes the port — so every
   launch got a different port, a different origin, and an empty panel.
   Ten ports' worth of half-finished data were sitting in the profile,
   each abandoned by the next restart.

   A fixed port would have fixed it too, until the day something else
   was already using that port and the data vanished again. A scheme of
   our own cannot collide with anything. */
function serve() {
  protocol.handle('app', async (request) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(request.url).pathname);
    } catch (err) {
      return new Response('bad request', { status: 400 });
    }
    if (!rel || rel === '/') rel = '/index.html';

    const file = path.join(ROOT, rel);
    /* Nothing outside the project folder, whatever the URL asks for.
       path.join has already resolved any .. by this point. */
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });

    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, {
        headers: {
          'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store'
        }
      });
    } catch (err) {
      return new Response('not found', { status: 404 });
    }
  });

  return 'app://panel';
}

function createWidget() {
  const saved = loadState();

  /* First run has no saved state, and the first run is exactly when a
     window is easiest to lose. So it starts centred, above other
     windows, and with an entry in the taskbar. All three can be turned
     off afterwards; none of them can be discovered if the window was
     never found in the first place. */
  const firstRun = saved.x === undefined;

  widget = new BrowserWindow({
    width: saved.width || 340,
    height: saved.height || 440,
    minWidth: 100,
    minHeight: 80,
    x: saved.x,
    y: saved.y,
    center: firstRun,
    ...WINDOW_ICON,
    frame: false,
    /* Not transparent. A frameless transparent window on Windows very
       often renders as nothing at all, and an invisible window is
       indistinguishable from an app that failed to start. Windows 11
       rounds the corners by itself. */
    transparent: false,
    backgroundColor: '#0b0b0b',
    resizable: true,
    /* A double-click on a frameless window's drag area would otherwise
       blow the widget up to fill the screen. */
    maximizable: false,
    fullscreenable: false,
    /* Pinned to the desktop: out of the taskbar and out of Alt+Tab, and
       never held above other windows, so it sits on the desktop rather
       than in the way.

       Deliberately still focusable. Making it unfocusable would stop it
       ever taking the focus, which sounds better, but on Windows that
       flag also tends to break dragging a frameless window by its
       body — and a widget you cannot move is worse than one that
       briefly takes the focus when you click it. */
    skipTaskbar: !!saved.pinned,
    alwaysOnTop: firstRun ? true : (!saved.pinned && !!saved.onTop),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      /* The widget is the thing that keeps time. Chromium slows timers
         in a hidden window to once a minute or less, which is exactly
         when the reminder would need to fire. */
      backgroundThrottling: false
    }
  });

  if (firstRun) saveState({ onTop: true });

  watch(widget, 'widget');
  widget.loadURL(origin + '/widget.html');

  /* Shown only once the page has painted, so it never flashes empty. */
  widget.once('ready-to-show', () => {
    applyWidgetMode();
    if (loadState().pinned) widget.showInactive();
    else { widget.show(); widget.focus(); }
    dropBorder();
  });
  widget.webContents.on('did-finish-load', applyWidgetMode);

  /* "Show desktop" minimises every top-level window, and a thing that
     is meant to live on the desktop should survive being shown it.
     Only while pinned: otherwise this would fight a person who
     minimised it on purpose. */
  widget.on('minimize', () => {
    if (!loadState().pinned) return;
    setTimeout(() => {
      if (!widget || widget.isDestroyed()) return;
      widget.restore();
      widget.showInactive();
    }, 50);
  });

  const remember = () => {
    if (!widget || widget.isDestroyed()) return;
    const [x, y] = widget.getPosition();
    const [width, height] = widget.getSize();
    saveState({ x, y, width, height });
  };

  widget.on('moved', remember);
  widget.on('resized', remember);

  /* From source only: what Windows does to the widget, as it happens —
     the only way to see why a pinned widget went missing. */
  if (!app.isPackaged) {
    ['show', 'hide', 'minimize', 'restore', 'focus', 'blur'].forEach((name) => {
      widget.on(name, () => console.log('widget event: ' + name));
    });
  }
  /* A window owned by the desktop goes when the desktop's own window
     does — Explorer restarting. It was not closed by anyone, so it comes
     back, and is tied again. */
  widget.on('closed', () => {
    widget = null;
    tiedToDesktop = false;
    if (!app.isQuitting && loadState().pinned) setTimeout(() => { if (!widget) createWidget(); }, 2500);
  });
}

/* Tying the widget to the desktop (Windows) ------------------------------

   "Show desktop" (Win+D, the corner of the taskbar) does not minimise a
   window like this one: it lifts the desktop over it, and the widget is
   simply gone — under the wallpaper, with nothing to say so. That is what
   a pinned widget did, and why it could not be found again.

   The cure Windows offers is ownership: a window owned by the desktop
   is lifted together with it, so it stays in view on the desktop, and it
   still lets every other window go in front of it. Electron has no call
   for giving a window an owner that is not one of its own, so this asks
   Windows directly through PowerShell, once, when the widget is pinned
   (and takes it back when it is unpinned). If PowerShell is not there or
   refuses, nothing breaks — the widget is just not tied, as before.

   The same call marks the window as one a click does not activate, so
   ticking a habit on a pinned widget does not pull it in front of the
   windows being worked in. This is asked of Windows and not of Electron
   (setFocusable(false)) on purpose: Electron's way also throws away every
   click made while the widget is not the active window — with the panel
   open, the pin on a pinned widget did nothing at all.

   The handle is this app's own window; nothing else is touched. */
const DESKTOP_TIE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DaybookDesktop {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  const long NOACTIVATE = 0x08000000L;
  public static string Tie(long handle, bool on) {
    IntPtr h = new IntPtr(handle);
    IntPtr desktop = on ? FindWindow("Progman", null) : IntPtr.Zero;
    if (on && desktop == IntPtr.Zero) return "no desktop window";
    SetWindowLongPtr(h, -8, desktop);
    long style = GetWindowLongPtr(h, -20).ToInt64();
    style = on ? (style | NOACTIVATE) : (style & ~NOACTIVATE);
    SetWindowLongPtr(h, -20, new IntPtr(style));
    return GetWindowLongPtr(h, -8) == desktop ? (on ? "tied" : "released") : "refused";
  }
}
"@
[DaybookDesktop]::Tie(HANDLE, ON)
`;

let tiedToDesktop = false;

function widgetHandle() {
  const buf = widget.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigInt64LE(0).toString() : String(buf.readInt32LE(0));
}

function runPowerShell(script, done) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 20000 },
    (err, stdout) => done(err, String(stdout || '').trim().split(/\r?\n/).pop() || ''));
}

/* No outline. Windows 11 draws a thin light border round every window,
   this frameless one included, and on a dark widget it reads as a white
   line round the edge. Windows lets a window ask for no border colour at
   all (DWMWA_BORDER_COLOR, 34, set to DWMWA_COLOR_NONE); Electron has no
   call for it, so it is asked through PowerShell, as the desktop tie is.
   Windows 10 has no such border and answers with an error: nothing to do
   there. The rounded corners stay. */
const NO_BORDER = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DaybookBorder {
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref uint value, int size);
  public static string Drop(long handle) {
    uint none = 0xFFFFFFFE;
    return DwmSetWindowAttribute(new IntPtr(handle), 34, ref none, 4) == 0 ? "no border" : "kept";
  }
}
"@
[DaybookBorder]::Drop(HANDLE)
`;

function dropBorder() {
  if (process.platform !== 'win32' || !widget || widget.isDestroyed()) return;
  runPowerShell(NO_BORDER.replace('HANDLE', widgetHandle()), (err, said) => {
    console.log('widget border: ' + (err ? 'failed, ' + err.message.split('\n')[0] : said));
  });
}

function tieToDesktop(on) {
  if (process.platform !== 'win32' || !widget || widget.isDestroyed()) return;
  if (on === tiedToDesktop) return;
  const script = DESKTOP_TIE.replace('HANDLE', widgetHandle()).replace('ON', on ? '$true' : '$false');
  tiedToDesktop = on;
  runPowerShell(script, (err, said) => {
    if (err || (said !== 'tied' && said !== 'released')) {
      tiedToDesktop = false;
      console.warn('widget desktop tie failed: ' + (err ? err.message.split('\n')[0] : said || 'no answer'));
      return;
    }
    console.log('widget desktop tie: ' + said);
  });
}

/* Pinned and always-on-top are opposite answers to the same question,
   so turning either on turns the other off.

   Pinned is fastened to the desktop: it cannot be moved or resized, not
   even by dragging; it is out of the taskbar and Alt+Tab; and it is tied
   to the desktop (above), so it is there whenever the desktop is, "show
   desktop" included, behind everything else, and a click on it — ticking
   a habit — does not lift it above the windows in front. It is unpinned from its own button, the tray menu or
   Settings. The page is told too, so it drops its drag area and its hide
   button. */
function applyWidgetMode() {
  if (!widget || widget.isDestroyed()) return;
  const saved = loadState();
  const pinned = !!saved.pinned;
  widget.setAlwaysOnTop(!pinned && !!saved.onTop);
  widget.setSkipTaskbar(pinned);
  widget.setMovable(!pinned);
  /* Never resized by hand, pinned or not: the page sets the size. */
  widget.setResizable(false);
  tieToDesktop(pinned);
  /* The widget and the panel both show the state; either may not have
     been the one that changed it. */
  [widget, panel].forEach((win) => {
    if (win && !win.isDestroyed()) win.webContents.send('widget-mode', { pinned, onTop: !pinned && !!saved.onTop });
  });
  buildTrayMenu();
  console.log('widget mode: ' + (pinned ? 'pinned' : 'free') +
    ' movable=' + widget.isMovable() + ' resizable=' + widget.isResizable() +
    ' size=' + widget.getSize().join('x'));
}

function openPanel() {
  if (panel && !panel.isDestroyed()) {
    /* Minimised to the taskbar, show() alone leaves it there. */
    if (panel.isMinimized()) panel.restore();
    panel.show();
    panel.focus();
    return;
  }

  const theme = lastTheme || { bg: '#0b0b0b', text: '#ededed' };

  panel = new BrowserWindow({
    width: 1100,
    height: 820,
    /* Below this the two-column layout folds into one and the controls
       start to crowd; below that again it simply broke. A floor, not a
       size anyone has to use. */
    minWidth: 760,
    minHeight: 560,
    title: 'Daybook',
    ...WINDOW_ICON,
    backgroundColor: theme.bg,
    /* On Windows the title bar is drawn by the page, in the page's own
       colours, with Windows' buttons laid over it — a white bar above a
       dark page, or the reverse, is what the person asked to get rid of.
       On a Mac the system bar stays and simply follows light or dark. */
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: theme.bg, symbolColor: theme.text, height: 36 }
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  watch(panel, 'panel');
  panel.loadURL(origin + '/index.html');
  /* Opening the panel is when a person would want to hear of a newer
     version, so it asks — unless it asked a moment ago. */
  updates.checkIfStale(10 * 60 * 1000);
  panel.on('closed', () => { panel = null; });
}

/* Asked for by name — the tray, the shortcut, starting the app again.
   It has to end up in front of whatever is open, or it looks as if
   nothing happened. Windows does not let a program that is not in use
   push a window to the front by asking nicely; being "always on top" for
   an instant and then not is what does get there. A pinned widget is
   shown without taking the focus, and goes back behind the other windows
   as soon as one of them is used. */
function showWidget() {
  if (!widget || widget.isDestroyed()) return createWidget();
  const saved = loadState();
  const pinned = !!saved.pinned;
  if (widget.isMinimized()) widget.restore();
  widget.setAlwaysOnTop(true);
  if (pinned) {
    widget.showInactive();
  } else {
    widget.show();
    widget.focus();
  }
  widget.setAlwaysOnTop(!pinned && !!saved.onTop);
}

function setPinned(next) {
  saveState({ pinned: next, onTop: next ? false : loadState().onTop });
  applyWidgetMode();
  /* Either way it should be in plain view straight after: pinned, to see
     where it now sits; unpinned, because it may have been buried. */
  showWidget();
  return next;
}

/* An icon by the clock, because until now the only way back to a hidden
   widget was a keyboard shortcut you had to already know about. It also
   carries the day's figure in its tooltip, which is the cheapest glance
   there is. */
function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show the widget', click: showWidget },
    { label: 'Open the panel', click: openPanel },
    { type: 'separator' },
    {
      label: 'Pin the widget to the desktop',
      type: 'checkbox',
      checked: !!loadState().pinned,
      click: () => setPinned(!loadState().pinned)
    },
    { label: 'Check for updates', click: checkForUpdatesAloud },
    { type: 'separator' },
    { label: 'Quit Daybook', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

/* Asked for from the tray, so the answer has to be said out loud: there
   is no window open to show it in. */
function checkForUpdatesAloud() {
  updates.check().then((state) => {
    if (state.status === 'available' || state.status === 'ready') {
      openPanel();
      return;
    }
    if (!Notification.isSupported()) return;
    const text = state.status === 'latest' ? 'Version ' + app.getVersion() + ' is the newest.'
      : state.status === 'dev' ? 'Running from the source folder; updates are for the installed app.'
      : 'Could not reach the update server. It will try again later.';
    new Notification({ title: 'Daybook', body: text }).show();
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  if (icon.isEmpty()) return;

  tray = new Tray(icon);
  tray.setToolTip('Daybook');
  buildTrayMenu();

  /* One click brings the widget (or hides it, when it is free to be
     hidden); a double-click opens the panel. Pinned, the icon only ever
     brings the widget to the front. */
  /* Windows reports a click and then a double-click for the same two
     presses, so the single one waits a moment to see whether a second
     is coming — otherwise a double-click would first hide the widget. */
  let clickTimer = null;
  tray.on('click', () => {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      const pinned = !!loadState().pinned;
      if (!pinned && widget && !widget.isDestroyed() && widget.isVisible()) widget.hide();
      else showWidget();
    }, 260);
  });
  tray.on('double-click', () => {
    clearTimeout(clickTimer);
    openPanel();
  });
}

/* A window that fails to load shows a blank rectangle and says
   nothing, and a script error inside it is invisible unless DevTools
   happen to be open. Both end up in the terminal instead. */
function watch(win, name) {
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(name + ' failed to load: ' + code + ' ' + description + ' ' + url);
  });
  win.webContents.on('did-finish-load', () => {
    console.log(name + ' loaded ' + win.webContents.getURL());
  });
  win.webContents.on('console-message', (_event, level, message, line, source) => {
    if (level >= 2) console.error(name + ' [' + source + ':' + line + '] ' + message);
  });
}

function wireMessages() {
  ipcMain.handle('open-panel', openPanel);

  /* The widget's page works out how big it needs to be — as wide as its
     face, as tall as what is in it — and at what scale (small, medium,
     large in Settings); the window follows. It grows and shrinks from its
     top-left corner, so it stays where it was put. Nobody drags its edge:
     the size belongs to the content. */
  ipcMain.handle('widget-size', (_event, width, height, zoom) => {
    if (!widget || widget.isDestroyed()) return;
    const z = [0.85, 1, 1.2].includes(zoom) ? zoom : 1;
    const w = Math.round(Math.max(120, Math.min(900, Number(width) || 0)) * z);
    const h = Math.round(Math.max(80, Math.min(900, Number(height) || 0)) * z);
    widget.webContents.setZoomFactor(z);
    const [cw, ch] = widget.getSize();
    if (cw === w && ch === h) return;
    widget.setResizable(true);
    widget.setMinimumSize(100, 80);
    widget.setSize(w, h);
    widget.setResizable(false);
    saveState({ width: w, height: h });
  });

  ipcMain.handle('toggle-on-top', () => {
    const next = !loadState().onTop;
    saveState({ onTop: next, pinned: next ? false : loadState().pinned });
    applyWidgetMode();
    return next;
  });

  ipcMain.handle('toggle-pinned', () => setPinned(!loadState().pinned));

  ipcMain.handle('get-window-settings', () => {
    const saved = loadState();
    return {
      onTop: !!saved.onTop,
      pinned: !!saved.pinned,
      openAtLogin: autostartOn()
    };
  });

  ipcMain.handle('toggle-autostart', () => setAutostart(!autostartOn()));

  /* Quitting from the panel. The icon by the clock has "Quit" too, but on
     Linux under GNOME that icon is not shown at all (it needs an
     extension), and closing the windows leaves the app running for the
     widget — so without this there would be no way out. */
  ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    app.quit();
  });

  /* A pinned widget is not hidden from itself: unpin it first. */
  ipcMain.handle('hide-widget', () => {
    if (widget && !loadState().pinned) widget.hide();
  });

  ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));

  ipcMain.handle('app-version', () => app.getVersion());

  /* The page's theme changed: repaint the window chrome to match. */
  ipcMain.handle('window-theme', (event, theme) => {
    if (!theme || typeof theme !== 'object') return;
    lastTheme = { bg: String(theme.bg || '#0b0b0b'), text: String(theme.text || '#ededed') };
    nativeTheme.themeSource = theme.theme === 'light' ? 'light' : 'dark';

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.setBackgroundColor(lastTheme.bg);
    if (process.platform === 'win32' && win === panel) {
      try {
        win.setTitleBarOverlay({ color: lastTheme.bg, symbolColor: lastTheme.text, height: 36 });
      } catch (err) { /* a window made without an overlay */ }
    }
  });
  ipcMain.handle('update-state', () => updates.current());
  ipcMain.handle('update-check', () => updates.check());
  ipcMain.handle('update-act', () => updates.act());

  /* The page decides when to send this, because the page is the only
     side that knows whether the day is finished. */
  ipcMain.handle('notify', (_event, title, body) => {
    if (!Notification.isSupported()) return false;
    const note = new Notification({ title: String(title), body: String(body) });
    note.on('click', showWidget);
    note.show();
    return true;
  });

  ipcMain.handle('tray-note', (_event, text) => {
    if (tray && !tray.isDestroyed()) tray.setToolTip(String(text).slice(0, 120));
  });

  /* The vault — the data as a file in a folder the person picks, so it
     can ride along with whatever already syncs that folder. */
  ipcMain.handle('vault-info', () => vault.info(app));
  ipcMain.handle('vault-read', () => vault.read(app));
  ipcMain.handle('vault-write', (_event, text) => vault.write(app, text));
  ipcMain.handle('vault-stash', (_event, text) => vault.stash(app, text));
  ipcMain.handle('vault-forget', () => vault.forget(app));

  ipcMain.handle('vault-pick', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Choose a folder for your Daybook data',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Keep data here'
    });
    if (picked.canceled || !picked.filePaths.length) return vault.info(app);
    return vault.setFolder(app, picked.filePaths[0]);
  });

  ipcMain.handle('vault-reveal', () => {
    const where = vault.info(app);
    if (where.file && where.exists) shell.showItemInFolder(where.file);
    else if (where.folder) shell.openPath(where.folder);
  });
}

/* One copy at a time. Double-clicking the shortcut twice would
   otherwise start a second app with its own widget, its own tray icon
   and its own idea of the data — and the two would overwrite each
   other. The second one hands focus back to the first and exits. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  /* Starting the app again is a person looking for it: the widget comes
     to the front (pinned or not), rather than nothing happening. */
  app.on('second-instance', showWidget);
}

app.whenReady().then(async () => {
  /* Windows needs this before a notification will show the app's name
     rather than "electron.app.Electron". */
  if (process.platform === 'win32') app.setAppUserModelId('com.dayPanel.app');

  /* No File / Edit / View / Window / Help. Electron puts that bar on
     every window by default, and not one of its entries does anything
     this app needs — it is a strip of chrome announcing that this is a
     browser in a coat.

     Except on a Mac, where removing the menu would quietly break more
     than it tidies: there, Cmd+C, Cmd+V and Cmd+Q are not handled by the
     page but by the menu, and without one you cannot paste an amount into
     the money tab or quit with the keyboard. The Mac menu lives in the
     bar at the top of the screen rather than in the window, so keeping
     a minimal one costs the window nothing. */
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' }
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }

  origin = serve();
  wireMessages();
  if (process.platform === 'linux' && autostartOn()) setAutostart(true);

  /* Every open window hears about a new version as soon as the main
     process does, so the button can appear wherever the person is
     looking. */
  updates.onChange((state) => {
    [widget, panel].forEach((win) => {
      if (win && !win.isDestroyed()) win.webContents.send('update-state', state);
    });
  });
  updates.start();
  createTray();
  createWidget();

  /* Brings the widget back when it is hidden or buried. Registration can
     fail if another program already owns the combination — not worth
     stopping the app over. */
  const ok = globalShortcut.register('CommandOrControl+Shift+D', () => {
    const pinned = !!loadState().pinned;
    if (!pinned && widget && !widget.isDestroyed() && widget.isVisible()) widget.hide();
    else showWidget();
  });
  if (!ok) console.warn('Could not register the Ctrl+Shift+D shortcut.');

  app.on('activate', () => {
    if (!widget) createWidget();
  });
});

/* Closing the panel window leaves the widget running — that is the point
   of the thing. Quitting happens from the widget's own menu. */
app.on('window-all-closed', () => {
  /* With an icon by the clock there is somewhere to come back from, so
     closing every window is no longer the same as quitting. */
  if (tray && !tray.isDestroyed()) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
