/* Electron shell: a small widget that sits on the desktop, and the full
   panel behind it.

   The pages are served over http from a tiny local server rather than
   loaded with file://, and that is not incidental. Two reasons:

   1. Storage. Pages opened as file:// get an opaque origin, and two
      windows would not reliably share one localStorage — the widget and
      the panel would each keep their own separate habits.
   2. Network. The weather call is blocked from a file:// page in some
      browsers. Over http it simply works.

   The same files are served that a browser would open by hand. Nothing
   in the panel knows it is running inside Electron. */

const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu,
        nativeImage, Notification, shell, Tray } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vault = require('./vault');

const ROOT = path.join(__dirname, '..');
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

let widget = null;
let panel = null;
let origin = null;
let tray = null;

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

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';

      const file = path.join(ROOT, rel);
      /* Nothing outside the project folder, whatever the URL asks for. */
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store'
        });
        res.end(data);
      });
    });

    /* Port 0 lets the system pick a free one — a fixed port would clash
       with whatever else the person happens to be running. */
    server.listen(0, '127.0.0.1', () => {
      resolve('http://127.0.0.1:' + server.address().port);
    });
  });
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
    skipTaskbar: false,
    alwaysOnTop: firstRun ? true : !!saved.onTop,
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

  widget.loadURL(origin + '/widget.html');

  /* Shown only once the page has painted, so it never flashes empty. */
  widget.once('ready-to-show', () => {
    widget.show();
    widget.focus();
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

function openPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return;
  }

  panel = new BrowserWindow({
    width: 1100,
    height: 820,
    title: 'Day Panel',
    backgroundColor: '#08080a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  panel.loadURL(origin + '/index.html');
  panel.on('closed', () => { panel = null; });
}

function showWidget() {
  if (!widget || widget.isDestroyed()) return createWidget();
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
  tray.setToolTip('Day Panel');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show the widget', click: showWidget },
    { label: 'Open the panel', click: openPanel },
    { type: 'separator' },
    { label: 'Quit Day Panel', click: () => { app.isQuitting = true; app.quit(); } }
  ]));

  tray.on('click', () => {
    if (widget && !widget.isDestroyed() && widget.isVisible()) widget.hide();
    else showWidget();
  });
}

function wireMessages() {
  ipcMain.handle('open-panel', openPanel);

  ipcMain.handle('toggle-on-top', () => {
    const next = !loadState().onTop;
    saveState({ onTop: next });
    if (widget) widget.setAlwaysOnTop(next);
    return next;
  });

  ipcMain.handle('get-window-settings', () => {
    const saved = loadState();
    return {
      onTop: !!saved.onTop,
      openAtLogin: app.getLoginItemSettings().openAtLogin
    };
  });

  ipcMain.handle('toggle-autostart', () => {
    const next = !app.getLoginItemSettings().openAtLogin;
    app.setLoginItemSettings({ openAtLogin: next });
    return next;
  });

  ipcMain.handle('hide-widget', () => {
    if (widget) widget.hide();
  });

  ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));

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
      title: 'Choose a folder for your Day Panel data',
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

app.whenReady().then(async () => {
  /* Windows needs this before a notification will show the app's name
     rather than "electron.app.Electron". */
  if (process.platform === 'win32') app.setAppUserModelId('com.dayPanel.app');

  origin = await serve();
  wireMessages();
  createTray();
  createWidget();

  /* Brings the widget back when it is hidden or buried. Registration can
     fail if another program already owns the combination — not worth
     stopping the app over. */
  const ok = globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (widget && !widget.isDestroyed() && widget.isVisible()) widget.hide();
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
