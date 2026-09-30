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
const vault = require('./vault');
const updates = require('./updates');

const ROOT = path.join(__dirname, '..');

/* Pinned rather than left to Electron.

   Electron names this folder after the product, so every rename of the
   product would move where it looks for the data. The app started as
   "Day Panel" and is now "Daybook"; left to Electron, 1.1.0 would have
   opened onto an empty profile while everyone's history sat untouched
   in the old folder, with nothing on screen to say so. The folder keeps
   its first name for good, whatever the app is called. Must run before
   the app is ready. */
/* Run from source (never in an installed copy), DAYBOOK_PROFILE=name gives
   the app a folder of its own — and with it its own single-instance lock —
   so a change can be tried beside the installed app without touching its
   data or being turned away as a second copy. */
const PROFILE = !app.isPackaged && process.env.DAYBOOK_PROFILE
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
    minWidth: 260,
    minHeight: 260,
    x: saved.x,
    y: saved.y,
    center: firstRun,
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
  widget.on('closed', () => { widget = null; });
}

/* Pinned and always-on-top are opposite answers to the same question,
   so turning either on turns the other off.

   Pinned is fastened to the desktop, as far as Windows allows without
   native code: it cannot be moved or resized, not even by dragging; it
   is out of the taskbar and Alt+Tab; it never takes the focus, so a
   click on it — ticking a habit — does not lift it above the windows in
   front; and it comes back after "show desktop". The only way to move
   or remove it is to unpin it in Settings. The page is told too, so it
   drops its own hide and move buttons. */
function applyWidgetMode() {
  if (!widget || widget.isDestroyed()) return;
  const saved = loadState();
  const pinned = !!saved.pinned;
  widget.setAlwaysOnTop(!pinned && !!saved.onTop);
  widget.setSkipTaskbar(pinned);
  widget.setMovable(!pinned);
  widget.setResizable(!pinned);
  widget.setFocusable(!pinned);
  widget.webContents.send('widget-mode', { pinned, onTop: !pinned && !!saved.onTop });
  console.log('widget mode: ' + (pinned ? 'pinned' : 'free') +
    ' movable=' + widget.isMovable() + ' resizable=' + widget.isResizable() +
    ' focusable=' + widget.isFocusable() + ' size=' + widget.getSize().join('x'));
}

/* Each face of the widget has the shape it was drawn for, and a smallest
   size it still works at: [width, height, min width, min height]. The
   clock's shape depends on its dial: a round one wants a square, a row
   of digits a wide strip, hours over minutes a tall one. */
const FACE_SIZES = {
  today: [340, 440, 260, 260],
  week: [410, 200, 330, 170],
  plans: [310, 330, 250, 220],
  note: [310, 230, 230, 160],
  money: [330, 260, 260, 210],
  'clock-round': [270, 270, 170, 170],
  'clock-digital': [390, 180, 260, 130],
  'clock-stack': [220, 280, 160, 210]
};

function openPanel() {
  if (panel && !panel.isDestroyed()) {
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
  panel.on('closed', () => { panel = null; });
}

function showWidget() {
  if (!widget || widget.isDestroyed()) return createWidget();
  if (loadState().pinned) { widget.showInactive(); return; }
  widget.show();
  widget.focus();
}

/* An icon by the clock, because until now the only way back to a hidden
   widget was a keyboard shortcut you had to already know about. It also
   carries the day's figure in its tooltip, which is the cheapest glance
   there is. */
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  if (icon.isEmpty()) return;

  tray = new Tray(icon);
  tray.setToolTip('Daybook');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show the widget', click: showWidget },
    { label: 'Open the panel', click: openPanel },
    { type: 'separator' },
    { label: 'Quit Daybook', click: () => { app.isQuitting = true; app.quit(); } }
  ]));

  /* Pinned, the icon only ever brings the widget back — hiding a pinned
     widget is done by unpinning it first. */
  tray.on('click', () => {
    const pinned = !!loadState().pinned;
    if (!pinned && widget && !widget.isDestroyed() && widget.isVisible()) widget.hide();
    else showWidget();
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

  /* A face chosen in Settings: set its smallest size, and — when it is a
     change rather than the widget starting up — its own size. */
  ipcMain.handle('widget-face', (_event, face, reset) => {
    const size = FACE_SIZES[face];
    if (!size || !widget || widget.isDestroyed()) return;
    widget.setMinimumSize(size[2], size[3]);
    if (!reset) return;
    const pinned = !!loadState().pinned;
    if (pinned) widget.setResizable(true);
    widget.setSize(size[0], size[1]);
    if (pinned) widget.setResizable(false);
    saveState({ width: size[0], height: size[1] });
  });

  ipcMain.handle('toggle-on-top', () => {
    const next = !loadState().onTop;
    saveState({ onTop: next, pinned: next ? false : loadState().pinned });
    applyWidgetMode();
    return next;
  });

  ipcMain.handle('toggle-pinned', () => {
    const next = !loadState().pinned;
    saveState({ pinned: next, onTop: next ? false : loadState().onTop });
    applyWidgetMode();
    /* Coming out of pinned mode, the window has been out of the
       taskbar and behind everything — it may be buried. Bring it back
       where it can be found. */
    if (!next && widget && !widget.isDestroyed()) {
      widget.show();
      widget.focus();
    }
    return next;
  });

  ipcMain.handle('get-window-settings', () => {
    const saved = loadState();
    return {
      onTop: !!saved.onTop,
      pinned: !!saved.pinned,
      openAtLogin: app.getLoginItemSettings().openAtLogin
    };
  });

  ipcMain.handle('toggle-autostart', () => {
    const next = !app.getLoginItemSettings().openAtLogin;
    app.setLoginItemSettings({ openAtLogin: next });
    return next;
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
  app.on('second-instance', () => {
    if (widget && !widget.isDestroyed()) {
      widget.show();
      widget.focus();
    } else {
      createWidget();
    }
  });
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
