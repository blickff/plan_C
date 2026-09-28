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

const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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
    width: saved.width || 330,
    height: saved.height || 400,
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
    backgroundColor: '#0b0b0d',
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: firstRun ? true : !!saved.onTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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
}

app.whenReady().then(async () => {
  origin = await serve();
  wireMessages();
  createWidget();

  /* Brings the widget back when it is hidden or buried. Registration can
     fail if another program already owns the combination — not worth
     stopping the app over. */
  const ok = globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (!widget || widget.isDestroyed()) return createWidget();
    if (widget.isVisible()) widget.hide();
    else { widget.show(); widget.focus(); }
  });
  if (!ok) console.warn('Could not register the Ctrl+Shift+D shortcut.');

  app.on('activate', () => {
    if (!widget) createWidget();
  });
});

/* Closing the panel window leaves the widget running — that is the point
   of the thing. Quitting happens from the widget's own menu. */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
