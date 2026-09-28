/* The whole panel keeps its state in one localStorage key, written out as a
   single object. At this size that is faster than juggling several keys and
   there is no way for two parts of the state to fall out of step. */

var Storage = (function () {
  var KEY = 'dayPanel';
  var state = null;

  function blank() {
    return {
      version: 1,
      habits: [],
      log: {},
      tasks: [],
      countdowns: [],
      notes: {},
      settings: {}
    };
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
      console.warn('Day Panel: stored data could not be read, starting fresh.', err);
      stored = null;
    }

    state = stored && typeof stored === 'object' ? stored : blank();

    /* Anything added to the shape in a later version is missing from data
       written by an earlier one, so fill the gaps instead of assuming. */
    var shape = blank();
    for (var key in shape) {
      if (!(key in state)) state[key] = shape[key];
    }

    return state;
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(load()));
    } catch (err) {
      console.warn('Day Panel: could not save.', err);
    }
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

  /* Backup ----------------------------------------------------------
     localStorage is wiped by a browser clean-up, and none of this exists
     anywhere else. Two buttons are the whole safety net. */

  function exportToFile() {
    var text = JSON.stringify(load(), null, 2);
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));

    var link = document.createElement('a');
    link.href = url;
    link.download = 'day-panel-' + today() + '.json';
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
      return 'That does not look like a Day Panel backup.';
    }

    var shape = blank();
    for (var key in shape) {
      if (!(key in incoming)) incoming[key] = shape[key];
    }

    state = incoming;
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

  return {
    load: load,
    save: save,
    reload: reload,
    today: today,
    dateKey: dateKey,
    exportToFile: exportToFile,
    importFromText: importFromText
  };
})();
