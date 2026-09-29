/* The whole panel keeps its state in one localStorage key, written out as a
   single object. At this size that is faster than juggling several keys and
   there is no way for two parts of the state to fall out of step. */

var Storage = (function () {
  var KEY = 'dayPanel';
  var BACKUP_KEY = 'dayPanel-before-v2';
  var VERSION = 2;
  var state = null;
  var replaced = null;
  var preMigration = null;

  function blank() {
    return {
      version: VERSION,
      habits: [],
      log: {},
      tasks: [],
      countdowns: [],
      notes: {},
      /* Spending: { currency, categories, entries }. Filled in by
         money.js the first time it is opened. */
      money: {},
      settings: {}
    };
  }

  /* Version 1 kept a day as a flat map of habit id to number, with the
     weather code sitting in the same object under the key 'weather'. Two
     different kinds of thing in one namespace: a habit whose id happened
     to be 'weather' would have overwritten the sky, and any code walking
     a day's entries had to know to skip that one key.

     Version 2 gives each its own place, and adds room for two things the
     flat shape had nowhere to put: the time a habit was first ticked, and
     whether a day has been accounted for at all.

     That last one matters more than it sounds. Under version 1 there was
     no way to tell "I did nothing that day" from "the app was not open
     that day", so every day nobody logged counted as a failure — and the
     patterns on the History page were drawn from that. */
  function migrate(data) {
    if (!data || typeof data !== 'object') return data;
    if ((data.version || 1) >= 2) return data;

    var log = data.log || {};
    Object.keys(log).forEach(function (key) {
      var old = log[key];
      if (!old || typeof old !== 'object' || old.values) return;

      var values = {};
      Object.keys(old).forEach(function (field) {
        if (field === 'weather') return;
        var n = Number(old[field]);
        if (n > 0) values[field] = n;
      });

      var day = { values: values };
      if (old.weather !== undefined) day.weather = old.weather;
      /* Anything already in there was logged by hand, so it counts as a
         day the person accounted for. */
      if (Object.keys(values).length) day.closed = true;
      log[key] = day;
    });

    data.version = 2;
    return data;
  }

  /* Anything added to the shape in a later version is missing from data
     written by an earlier one, so fill the gaps instead of assuming. */
  function normalise(data) {
    var shape = blank();
    for (var key in shape) {
      if (!(key in data)) data[key] = shape[key];
    }
    return migrate(data);
  }

  function load() {
    if (state) return state;

    var stored = null;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (err) {
      /* Corrupt or unreadable storage must not take the page down with it —
         a blank panel beats a blank screen. */
      console.warn('Daybook: stored data could not be read, starting fresh.', err);
      stored = null;
    }

    var wasV1 = stored && typeof stored === 'object' && (stored.version || 1) < VERSION;
    /* Kept verbatim before anything rewrites it. A migration that goes
       wrong on somebody's only copy of two years of history is not a
       bug you can apologise your way out of, and the copy costs one
       string. */
    if (wasV1) {
      try {
        preMigration = JSON.stringify(stored);
        /* Also kept right here, under its own key. The copy beside the
           data file only exists once a folder has been chosen, and the
           people most likely to be hurt by a bad migration are exactly
           the ones who have not got round to choosing one. Written once
           and never overwritten, so a later run cannot replace the
           original with already-migrated data. */
        if (!window.localStorage.getItem(BACKUP_KEY)) {
          window.localStorage.setItem(BACKUP_KEY, preMigration);
        }
      } catch (err) {
        preMigration = null;
      }
    }

    state = normalise(stored && typeof stored === 'object' ? stored : blank());
    return state;
  }

  /* A day's record, made on demand. Everything that reads or writes a
     day goes through here so the shape lives in one place. */
  function day(key, make) {
    var log = load().log;
    if (!log[key]) {
      if (!make) return null;
      log[key] = { values: {} };
    }
    if (!log[key].values) log[key].values = {};
    return log[key];
  }

  /* What was done on a day, as a plain map of habit id to number. Safe
     to call for a day that was never touched. */
  function valuesOn(log, key) {
    var d = log[key];
    return (d && d.values) || {};
  }

  /* Whether anybody has actually accounted for this day, as opposed to
     the app simply never having been open. Everything statistical hangs
     off this distinction. */
  function known(log, key) {
    var d = log[key];
    if (!d) return false;
    if (d.closed) return true;
    return Object.keys(d.values || {}).length > 0;
  }

  /* Says "yes, this day is accounted for", even when the answer is that
     nothing at all got done. Without it an honest zero is indistinguishable
     from an absence. */
  function closeDay(key, yes) {
    var d = day(key, true);
    if (yes) d.closed = true;
    else delete d.closed;
    save();
  }

  function save() {
    /* Stamped on every write so the copy in the vault file and the copy
       in this browser can be told apart by age. Without it there is no
       way to know which of two versions is the later one. */
    load().updatedAt = Date.now();

    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Daybook: could not save.', err);
    }

    mirror();
  }

  /* The vault ------------------------------------------------------
     localStorage disappears with the browser profile, and a reinstalled
     Windows takes it with it. So the desktop app also keeps the data as
     a file in a folder the person chooses — put that folder inside
     something that already syncs and the history outlives the machine.

     The file is the copy that travels; localStorage stays the one this
     page reads and writes, so nothing else in the app has to change. */

  var vaultTimer = null;

  function hasVault() {
    return typeof window !== 'undefined' && window.desktop && window.desktop.vault;
  }

  /* Batched: ticking a habit five times in a row should write the file
     once, not five times. */
  function mirror() {
    if (!hasVault()) return;
    clearTimeout(vaultTimer);
    vaultTimer = setTimeout(function () {
      window.desktop.vault.write(JSON.stringify(state, null, 2)).catch(function (err) {
        console.warn('Daybook: could not write to the vault.', err);
      });
    }, 400);
  }

  function hasContent(data) {
    if (!data) return false;
    return (data.habits && data.habits.length) ||
      (data.log && Object.keys(data.log).length) ||
      (data.tasks && data.tasks.length) ||
      (data.notes && Object.keys(data.notes).length);
  }

  /* What the last adoptVault threw away, if anything, so the panel can
     say so instead of letting it happen in silence. */
  function replacedCopy() {
    return replaced;
  }

  /* Written out once, next to the data file, the first time the older
     shape is read. Returns the path it landed at, or null. */
  function keepPreMigrationCopy() {
    if (!preMigration || !hasVault()) return Promise.resolve(null);
    var text = preMigration;
    preMigration = null;
    return window.desktop.vault.stash(text).catch(function () { return null; });
  }

  function clearReplaced() {
    replaced = null;
  }

  /* Run once at startup. If the file holds a later version than this
     browser does — another machine wrote it, or Windows was reinstalled
     and localStorage is empty — the file wins and the page redraws.

     Comparing timestamps rather than merging is deliberate: merging two
     divergent histories without asking would invent days that never
     happened. Whichever side was written last is the one kept.

     But "kept" used to mean the other side was gone. Two machines, one
     of them offline for a day, and a day's work vanished without a word.
     Now the losing side is written out as its own file next to the data
     first, and the panel is told, so the choice can be undone by hand. */
  function adoptVault(done) {
    if (!hasVault()) return done(false);

    window.desktop.vault.read().then(function (text) {
      if (!text) {
        /* Nothing there yet — seed the file from what is here. */
        mirror();
        return done(false);
      }

      var incoming;
      try {
        incoming = JSON.parse(text);
      } catch (err) {
        console.warn('Daybook: the vault file is not readable JSON.', err);
        return done(false);
      }

      var here = load().updatedAt || 0;
      var there = incoming.updatedAt || 0;

      if (there > here) {
        var losing = hasContent(state) && here > 0 ? JSON.stringify(state, null, 2) : null;

        state = normalise(incoming);
        try {
          window.localStorage.setItem(KEY, JSON.stringify(state));
        } catch (err) {}

        if (!losing) return done(true);

        /* Stashed before anything else touches the folder. If the stash
           fails the adoption still stands — the file on disk is the one
           the person's other machine wrote, and refusing it would be
           worse than losing the copy. */
        return window.desktop.vault.stash(losing).then(function (where) {
          replaced = { at: here, file: where || null };
          done(true);
        }).catch(function () {
          replaced = { at: here, file: null };
          done(true);
        });
      }

      if (here > there) mirror();
      done(false);
    }).catch(function (err) {
      console.warn('Daybook: could not read the vault.', err);
      done(false);
    });
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* The one source of "today" in the whole project. Built from local parts
     on purpose: toISOString() reports UTC, which after ~21:00 local time
     would hand back tomorrow's date and log entries under the wrong day. */
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function today() {
    return dateKey(new Date());
  }

  function clock() {
    var now = new Date();
    return pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  /* Which day the panel is showing ------------------------------------

     Today, unless a day was picked off the calendar. The habit tiles,
     the task list and the note all read from here, which is what lets
     a day be filled in the same way today is — with the same controls,
     in the same place, rather than in a second card that repeated the
     first one.

     Deliberately not saved. Coming back to the app tomorrow and finding
     it still sitting on last Tuesday would be a trap: you would tick
     today's habits into the wrong day and not notice. */
  var viewing = null;

  function viewingDay() {
    /* Re-checked against the clock, not just stored, so a panel left
       open overnight rolls to the new day instead of quietly editing
       yesterday. */
    if (viewing && viewing === today()) viewing = null;
    return viewing || today();
  }

  function setViewingDay(key) {
    viewing = key && key !== today() ? key : null;
  }

  function viewingToday() {
    return viewingDay() === today();
  }

  /* Backup ----------------------------------------------------------
     localStorage is wiped by a browser clean-up, and none of this exists
     anywhere else. Two buttons are the whole safety net. */

  function exportToFile() {
    var text = JSON.stringify(load(), null, 2);
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));

    var link = document.createElement('a');
    link.href = url;
    link.download = 'daybook-' + today() + '.json';
    link.click();

    /* Revoking straight away can cancel the download in some browsers. */
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* Returns an error string, or null when the import went through. */
  function importFromText(text) {
    var incoming;
    try {
      incoming = JSON.parse(text);
    } catch (err) {
      return 'That file is not valid JSON.';
    }

    if (!incoming || typeof incoming !== 'object' ||
        !Array.isArray(incoming.habits) || typeof incoming.log !== 'object') {
      return 'That does not look like a Daybook backup.';
    }

    state = normalise(incoming);
    save();
    return null;
  }

  /* Drops the cached copy so the next read comes from storage. Needed
     when another window of the same origin has written — the desktop
     widget and the full panel share one localStorage and would
     otherwise each keep working from their own stale snapshot. */
  function reload() {
    state = null;
    return load();
  }

  /* The untouched copy from before the version-2 rewrite, if there is
     one. Nothing calls this automatically — it is there so the data can
     be put back by hand if the migration turns out to have been wrong. */
  function backupBeforeV2() {
    try {
      return window.localStorage.getItem(BACKUP_KEY);
    } catch (err) {
      return null;
    }
  }

  return {
    load: load,
    save: save,
    reload: reload,
    day: day,
    valuesOn: valuesOn,
    known: known,
    closeDay: closeDay,
    adoptVault: adoptVault,
    hasVault: hasVault,
    replacedCopy: replacedCopy,
    clearReplaced: clearReplaced,
    keepPreMigrationCopy: keepPreMigrationCopy,
    backupBeforeV2: backupBeforeV2,
    today: today,
    clock: clock,
    dateKey: dateKey,
    viewingDay: viewingDay,
    setViewingDay: setViewingDay,
    viewingToday: viewingToday,
    exportToFile: exportToFile,
    importFromText: importFromText
  };
})();
