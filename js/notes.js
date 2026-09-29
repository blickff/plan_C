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

  /* A search can be a date as well as words: "29" finds every note from
     a 29th, "29.09" or "Sep 29" that day in any year, "September" or
     "сентябрь" the whole month, "2026" the year, "2026-09-29" one day.
     Month names in English and Russian, whole or cut short. A note comes
     back if its words match or its date does. */
  var MONTH_NAMES = [
    ['jan', 'янв'], ['feb', 'фев'], ['mar', 'мар'], ['apr', 'апр'],
    ['may', 'мая', 'май'], ['jun', 'июн'], ['jul', 'июл'], ['aug', 'авг'],
    ['sep', 'сен'], ['oct', 'окт'], ['nov', 'ноя'], ['dec', 'дек']
  ];

  function monthOf(word) {
    if (word.length < 3) return 0;
    for (var m = 0; m < 12; m++) {
      for (var i = 0; i < MONTH_NAMES[m].length; i++) {
        if (word.indexOf(MONTH_NAMES[m][i]) === 0) return m + 1;
      }
    }
    return 0;
  }

  function dateQuery(text) {
    var words = text.split(/[\s.,\/-]+/).filter(Boolean);
    if (!words.length || words.length > 3) return null;
    var want = {};
    var numbers = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (/^\d{4}$/.test(w)) {
        if (want.year) return null;
        want.year = +w;
      } else if (/^\d{1,2}$/.test(w)) {
        var n = +w;
        numbers += 1;
        /* After a year, as in 2026-09-29, the month comes first; else the
           day does, as in 29.09. */
        var monthFirst = want.year && !want.day && !want.month;
        if (monthFirst && n >= 1 && n <= 12) want.month = n;
        else if (!want.day && n >= 1 && n <= 31) want.day = n;
        else if (!want.month && n >= 1 && n <= 12) want.month = n;
        else return null;
      } else {
        var m = monthOf(w);
        if (!m || want.month) return null;
        want.month = m;
      }
    }
    if (numbers > 2) return null;
    return want;
  }

  function dateMatches(want, key) {
    if (!want) return false;
    var p = key.split('-');
    return (!want.year || +p[0] === want.year) &&
      (!want.month || +p[1] === want.month) &&
      (!want.day || +p[2] === want.day);
  }

  function matching() {
    var needle = query.trim().toLowerCase();
    if (!needle) return all();
    var want = dateQuery(needle);
    return all().filter(function (note) {
      return note.text.toLowerCase().indexOf(needle) !== -1 || dateMatches(want, note.date);
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
      box.innerHTML = '<p class="muted soft">' +
        'Nothing written yet. The note box is at the bottom of the dashboard.</p>';
      return;
    }

    if (!found.length) {
      box.innerHTML = '<p class="muted soft">No note mentions that, and none is from that date.</p>';
      return;
    }

    /* The date is lit up when it is the date that matched, as the words
       are when they did. */
    var want = dateQuery(query.trim().toLowerCase());
    box.innerHTML = found.map(function (note) {
      var date = escapeHtml(pretty(note.date));
      if (dateMatches(want, note.date)) date = '<mark>' + date + '</mark>';
      return '' +
        '<button class="note-row" type="button" data-note-date="' + note.date + '">' +
          '<span class="note-row__date">' + date + '</span>' +
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
      if (!row || typeof goToDay !== 'function') return;
      showView('dashboard');
      goToDay(row.getAttribute('data-note-date'));
    });
  }

  return { start: start, render: render };
})();
