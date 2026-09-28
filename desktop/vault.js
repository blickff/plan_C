/* The vault: the panel's data as a plain file in a folder the person
   picks.

   The point is surviving a reinstall without a server. Pick a folder
   that something already syncs — OneDrive, Google Drive, Dropbox,
   Yandex.Disk, a stick — and the file rides along. Reinstall Windows,
   install the panel, point it at the same folder, and the history is
   back. Two machines pointed at one synced folder stay in step for the
   same reason.

   The file is ordinary JSON. Nothing here is locked to this app: it can
   be opened, read, copied and backed up with anything. */

const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'day-panel.json';

function configPath(app) {
  return path.join(app.getPath('userData'), 'vault-config.json');
}

function readConfig(app) {
  try {
    return JSON.parse(fs.readFileSync(configPath(app), 'utf8'));
  } catch (err) {
    return {};
  }
}

function writeConfig(app, config) {
  fs.writeFileSync(configPath(app), JSON.stringify(config, null, 2), 'utf8');
}

function folderOf(app) {
  return readConfig(app).folder || null;
}

function fileOf(app) {
  const folder = folderOf(app);
  return folder ? path.join(folder, FILE_NAME) : null;
}

function info(app) {
  const folder = folderOf(app);
  const file = fileOf(app);
  let exists = false;
  let savedAt = null;
  let size = 0;

  if (file) {
    try {
      const stat = fs.statSync(file);
      exists = true;
      savedAt = stat.mtime.toISOString();
      size = stat.size;
    } catch (err) {
      exists = false;
    }
  }

  return { folder: folder, file: file, exists: exists, savedAt: savedAt, size: size };
}

function readable(candidate) {
  try {
    const text = fs.readFileSync(candidate, 'utf8');
    /* Parsed here, not just read. A cloud sync interrupted mid-copy
       leaves a file that opens fine and is still half a file — checking
       only that it exists would hand back the truncated half and lose
       everything. */
    JSON.parse(text);
    return text;
  } catch (err) {
    return null;
  }
}

function read(app) {
  const file = fileOf(app);
  if (!file) return null;

  /* Missing is normal — the folder was only just chosen. Damaged is not:
     fall back to the copy kept beside it. */
  return readable(file) || readable(file + '.prev');
}

/* Written through a temporary file and renamed into place. A rename is
   atomic, so a crash or a pulled plug mid-write leaves the previous file
   whole rather than half a file and no data. The copy at .prev is the
   second net, for the case where the JSON itself turns out unreadable. */
function write(app, text) {
  const file = fileOf(app);
  if (!file) return { ok: false, error: 'No folder chosen yet.' };

  const temp = file + '.tmp';

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, text, 'utf8');

    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, file + '.prev');
    } catch (err) {
      /* Losing the spare is not worth failing the save over. */
    }

    fs.renameSync(temp, file);
    return { ok: true };
  } catch (err) {
    try { fs.unlinkSync(temp); } catch (err2) {}
    return { ok: false, error: String(err.message || err) };
  }
}

/* The copy kept when a newer file from another machine replaces what
   was here. Losing a day's work to a sync race, silently, is the worst
   thing this design can do; writing the losing side out next to the
   winner costs nothing and makes it recoverable by hand. */
function stash(app, text) {
  const folder = folderOf(app);
  if (!folder) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(folder, 'day-panel-replaced-' + stamp + '.json');

  try {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    return target;
  } catch (err) {
    return null;
  }
}

function setFolder(app, folder) {
  const config = readConfig(app);
  config.folder = folder;
  writeConfig(app, config);
  return info(app);
}

function forget(app) {
  const config = readConfig(app);
  delete config.folder;
  writeConfig(app, config);
  return info(app);
}

module.exports = { info, read, write, stash, setFolder, forget, FILE_NAME };
