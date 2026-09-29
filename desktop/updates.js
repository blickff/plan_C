/* Updates: a new version appears as a button in the app, and pressing
   it is all it takes.

   The app asks GitHub's releases page whether there is anything newer
   than itself. It never downloads without being asked — a program that
   pulls tens of megabytes onto somebody's connection on its own is a
   program that gets uninstalled — and it never restarts without being
   asked either.

   What "installing" means depends on the system, and the difference is
   not ours to paper over:

   - Windows, installed with the setup file: downloads in the background,
     then one press restarts into the new version.
   - Windows portable, and macOS: the new version can be found but not
     swapped in by the app itself. The portable exe is a single file the
     app cannot overwrite while it is running; on a Mac, replacing an app
     from inside needs a paid Apple signing certificate this project does
     not have. For those the button opens the download page instead,
     and says so. */

const { app, net, shell } = require('electron');

const RELEASES = 'https://github.com/blickff/plan_C/releases/latest';
const LATEST_API = 'https://api.github.com/repos/blickff/plan_C/releases/latest';

let updater = null;
let state = { status: 'idle', version: app.getVersion() };
let listeners = [];

/* Only an installed Windows build can replace itself. The portable
   exe's own launcher sets PORTABLE_EXECUTABLE_DIR, which is how the
   portable one is told apart. And the installer writes app-update.yml
   beside the app, which is what tells the updater where to look — a
   build without it could only ever fail, so it takes the simpler path
   of asking the release page instead. */
function canInstallInPlace() {
  if (process.platform !== 'win32') return false;
  if (process.env.PORTABLE_EXECUTABLE_DIR) return false;
  try {
    return require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'app-update.yml'));
  } catch (err) {
    return false;
  }
}

function set(next) {
  state = Object.assign({ version: app.getVersion() }, next);
  /* One line per change, for anyone running it from a terminal to see
     why an update did or did not show up. */
  console.log('update: ' + state.status +
    (state.latest ? ' ' + state.latest : '') +
    (state.message ? ' (' + state.message + ')' : ''));
  listeners.forEach((fn) => {
    try { fn(state); } catch (err) { /* a closed window */ }
  });
}

function onChange(fn) {
  listeners.push(fn);
}

function current() {
  return state;
}

/* "1.10.0" is newer than "1.9.2"; comparing them as text says otherwise. */
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/* For the copies that cannot replace themselves — a Mac, the portable
   exe — all that is needed is whether a newer release exists. The
   release page's own record says so; the full updater would go looking
   for install files that such a copy could not use anyway, and report
   their absence as a failure. */
function checkByRelease() {
  set({ status: 'checking' });
  return net.fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => {
      if (!r.ok) throw new Error('GitHub answered ' + r.status);
      return r.json();
    })
    .then((release) => {
      const latest = String(release.tag_name || '').replace(/^v/, '');
      if (latest && newer(latest, app.getVersion())) {
        set({ status: 'available', latest: latest, inPlace: false });
      } else {
        set({ status: 'latest', checkedAt: Date.now() });
      }
      return state;
    })
    .catch((err) => {
      set({ status: 'error', message: String((err && err.message) || err).split('\n')[0] });
      return state;
    });
}

function start() {
  /* A development run from source is not an installed app, and asking
     GitHub on its behalf would only ever report a version it cannot
     install. */
  if (!app.isPackaged) {
    set({ status: 'dev' });
    return;
  }

  if (!canInstallInPlace()) {
    setTimeout(checkByRelease, 8000);
    setInterval(checkByRelease, 12 * 60 * 60 * 1000);
    return;
  }

  try {
    updater = require('electron-updater').autoUpdater;
  } catch (err) {
    set({ status: 'error', message: 'The updater could not be loaded.' });
    return;
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;

  updater.on('checking-for-update', () => set({ status: 'checking' }));

  updater.on('update-not-available', () => set({ status: 'latest', checkedAt: Date.now() }));

  updater.on('update-available', (info) => set({
    status: 'available',
    latest: info.version,
    inPlace: canInstallInPlace()
  }));

  updater.on('download-progress', (p) => set({
    status: 'downloading',
    latest: state.latest,
    percent: Math.round(p.percent || 0)
  }));

  updater.on('update-downloaded', (info) => set({ status: 'ready', latest: info.version }));

  updater.on('error', (err) => set({
    status: 'error',
    latest: state.latest,
    message: String((err && err.message) || err).split('\n')[0]
  }));

  /* Once a little after start, so the first thing the app does is show
     the widget rather than go to the network, and then twice a day for
     anyone who never closes it. */
  setTimeout(check, 8000);
  setInterval(check, 12 * 60 * 60 * 1000);
}

function check() {
  if (!app.isPackaged) return Promise.resolve(state);
  if (!canInstallInPlace()) return checkByRelease();
  if (!updater) return Promise.resolve(state);
  return updater.checkForUpdates()
    .then(() => state)
    .catch((err) => {
      set({ status: 'error', message: String((err && err.message) || err).split('\n')[0] });
      return state;
    });
}

/* The button. Download if it can be installed here, otherwise send the
   person to the page where the new file is. */
function act() {
  if (state.status === 'ready' && updater) {
    /* Silent, and relaunch afterwards: the installer already asked its
       questions the first time. */
    setImmediate(() => updater.quitAndInstall(true, true));
    return Promise.resolve(state);
  }

  if (state.status === 'available' || (state.status === 'error' && state.latest)) {
    if (!canInstallInPlace()) {
      shell.openExternal(RELEASES);
      return Promise.resolve(state);
    }
    set({ status: 'downloading', latest: state.latest, percent: 0 });
    return updater.downloadUpdate().then(() => state).catch((err) => {
      set({ status: 'error', latest: state.latest, message: String((err && err.message) || err).split('\n')[0] });
      return state;
    });
  }

  return Promise.resolve(state);
}

module.exports = { start, check, act, current, onChange, RELEASES };
