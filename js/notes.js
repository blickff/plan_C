/* Every note you have written, newest first, with a search box.

   The day view answers "what was that day like" when you know the day.
   This answers the other half — "I wrote something about this once, but
   I have no idea when". Without that, notes are written and never read
   again, which makes writing them pointless.

   It sits in History rather than on the dashboard: the dashboard is
   today, and looking back is what History is for. */

var Notes = (function () {
  var query = '';

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pretty(key) {
    var parts = key.split('-');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }).format(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  }

  /* The matched words are lit up in the result, so it is obvious why a
     note came back — scanning a list of dates for the reason is work the
     panel can do instead.

     Searched by plain index rather than a regular expression: the text
     is whatever somebody typed, and turning that into a pattern means
     escaping it correctly every time or breaking on a stray bracket. */
  function highlight(text, needle) {
    var safe = escapeHtml(text);
    if (!needle) return safe;

    var find = escapeHtml(needle).toLowerCase();
    if (!find) return safe;

    var haystack = safe.toLowerCase();
    var out = '';
    var at = 0;
    var hit;

    while ((hit = haystack.indexOf(find, at)) !== -1) {
      out += safe.slice(at, hit) + '<mark>' + safe.slice(hit, hit + find.length) + '</mark>';
      at = hit + find.length;
    }

    return out + safe.slice(at);
  }

  function all() {
    var notes = Storage.load().notes;
    return Object.keys(notes)
      .filter(function (key) { return notes[key] && notes[key].trim(); })
      .sort()
      .reverse()
      .map(function (key) { return { date: key, text: notes[key] }; });
  }

  function matching() {
    var needle = query.trim().toLowerCase();
    if (!needle) return all();
    return all().filter(function (note) {
      return note.text.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function render() {
    var box = document.getElementById('notes-list');
    if (!box) return;

    var everything = all();
    var found = matching();

    var counter = document.getElementById('notes-count');
    if (counter) {
      counter.textContent = everything.length
        ? (query.trim()
            ? found.length + ' of ' + everything.length
            : everything.length + (everything.length === 1 ? ' note' : ' notes'))
        : '';
    }

    if (!everything.length) {
      box.innerHTML = '<p class="muted dv__empty">' +
        'Nothing written yet. The note box is at the bottom of the dashboard.</p>';
      return;
    }

    if (!found.length) {
      box.innerHTML = '<p class="muted dv__empty">No note mentions that.</p>';
      return;
    }

    box.innerHTML = found.map(function (note) {
      return '' +
        '<button class="note-row" type="button" data-note-date="' + note.date + '">' +
          '<span class="note-row__date">' + pretty(note.date) + '</span>' +
          '<span class="note-row__text">' + highlight(note.text, query.trim()) + '</span>' +
        '</button>';
    }).join('');
  }

  function start() {
    var search = document.getElementById('notes-search');
    if (!search) return;

    render();

    search.addEventListener('input', function () {
      query = this.value;
      render();
    });

    /* Pressing a note opens that whole day, not just the text: what was
       written usually only makes sense next to what was happening. */
    document.getElementById('notes-list').addEventListener('click', function (event) {
      var row = event.target.closest('[data-note-date]');
      if (!row || typeof DayView === 'undefined') return;
      showView('dashboard');
      DayView.open(row.getAttribute('data-note-date'));
    });
  }

  return { start: start, render: render };
})();
