/* One day, opened from the calendar — and, since it is the only place a
   day other than today can be reached, the place where a day gets put
   right.

   Being able to fill in yesterday is not a convenience. Without it the
   record is not "what I did", it is "what I did on the days I remembered
   to open this". Every streak, every colour on the calendar and every
   pattern on the History page was drawn from that, and none of them said
   so. */

var DayView = (function () {
  var openKey = null;
  var noteTimer = null;

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
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }).format(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  }

  function close() {
    var box = document.getElementById('dayview');
    if (box) box.setAttribute('hidden', '');
    openKey = null;
  }

  /* Everything a change to a past day touches. The calendar cell, the
     card above it, the tiles if the day happens to be today, and the
     notes archive if the writing changed. */
  function refresh() {
    if (typeof Dashboard !== 'undefined') Dashboard.render();
    if (typeof Notes !== 'undefined') Notes.render();
    if (typeof HistoryView !== 'undefined') HistoryView.render();
    if (typeof Insights !== 'undefined') Insights.render();
    if (openKey === Storage.today()) Habits.renderTiles();
  }

  function habitRow(habit, key, values, due) {
    var value = values[habit.id] || 0;
    var done = value >= habit.goal;

    var readout = habit.goal === 1
      ? (done ? 'done' : 'not done')
      : value + ' / ' + habit.goal + ' ' + escapeHtml(habit.unit);

    var controls = habit.goal === 1
      ? '<button class="dv__step dv__step--wide" type="button" data-set="' +
          escapeHtml(habit.id) + '" data-to="' + (done ? 0 : 1) + '">' +
          (done ? 'Undo' : 'Mark done') + '</button>'
      : '<button class="dv__step" type="button" data-less="' + escapeHtml(habit.id) +
          '" aria-label="Less"' + (value ? '' : ' disabled') + '>&#8722;</button>' +
        '<button class="dv__step" type="button" data-more="' + escapeHtml(habit.id) +
          '" aria-label="More">+</button>';

    return '<li class="dv__habit' + (done ? ' is-done' : '') + (due ? '' : ' is-off') + '">' +
      '<span class="dv__hname">' + escapeHtml(habit.name) +
        (due ? '' : '<span class="dv__off"> · not asked for</span>') + '</span>' +
      '<span class="dv__value">' + readout + '</span>' +
      '<span class="dv__steps">' + controls + '</span>' +
    '</li>';
  }

  function open(key) {
    var box = document.getElementById('dayview');
    if (!box) return;

    openKey = key;

    var state = Storage.load();
    var values = Storage.valuesOn(state.log, key);
    var todayKey = Storage.today();
    var ahead = key > todayKey;

    /* Only habits that existed then — showing a habit against a day
       before it was created would read as a miss that never happened. */
    var habits = state.habits.filter(function (h) {
      return !h.archived && (!h.createdAt || h.createdAt <= key);
    });

    var score = Habits.completionFor(state.log, state.habits, key);
    var percent = score === null ? null : Math.round(score * 100);
    var accounted = Storage.known(state.log, key);

    var habitRows = habits.length
      ? habits.map(function (habit) {
          return habitRow(habit, key, values, Habits.dueOn(state.log, habit, key));
        }).join('')
      : '<li class="dv__habit"><span class="muted">No habits yet on that day.</span></li>';

    /* The tasks that stood on that day, as they stood then. A task
       carried forward keeps its original entry here rather than
       vanishing, so a day that had three really shows three. */
    var tasks = state.tasks.filter(function (t) { return t.date === key; });
    var doneCount = tasks.filter(function (t) { return t.done; }).length;
    var movedCount = tasks.filter(function (t) { return t.movedTo; }).length;

    var taskRows = tasks.length
      ? '<ul class="dv__list">' + tasks.map(function (t) {
          var mark = t.done ? ' is-done' : (t.movedTo ? ' is-moved' : '');
          var tail = t.done ? 'done'
            : t.movedTo ? 'moved on'
            : t.from ? 'carried over' : 'not done';
          return '<li class="dv__task' + mark + '">' +
            '<span>' + escapeHtml(t.text) + '</span>' +
            '<span class="dv__value">' + tail + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted dv__empty">Nothing was planned.</p>';

    var taskTally = tasks.length
      ? doneCount + ' of ' + tasks.length + ' done' +
        (movedCount ? ' · ' + movedCount + ' moved on' : '')
      : '';

    var due = state.countdowns.filter(function (c) { return c.date === key; });
    var dueRows = due.length
      ? '<ul class="dv__list">' + due.map(function (c) {
          return '<li class="dv__task">' + escapeHtml(c.title) + '</li>';
        }).join('') + '</ul>'
      : '';

    var summary = ahead ? 'Still ahead'
      : !accounted ? 'This day was never filled in'
      : percent === null ? 'Nothing was being tracked yet'
      : percent + '% of that day done' + (key === todayKey ? ' · today' : '');

    /* The difference between an empty day and an absent one has to be
       something a person can state, or the app has to guess — and its
       guess was to call every absence a failure. */
    var accountBtn = ahead ? '' :
      (accounted
        ? (Object.keys(values).length
            ? ''
            : '<button class="pill dv__mark" type="button" id="dv-unmark">' +
              'Counted as a day with nothing done — undo</button>')
        : '<button class="pill dv__mark" type="button" id="dv-mark">' +
          'Nothing got done that day — count it</button>');

    box.innerHTML = '' +
      '<div class="dv__head">' +
        '<div>' +
          '<p class="card__title">' + pretty(key) + '</p>' +
          '<p class="card__note muted">' + summary + '</p>' +
        '</div>' +
        '<button class="pill" type="button" id="dv-close">Close</button>' +
      '</div>' +

      (dueRows ? '<p class="label">On this date</p>' + dueRows : '') +

      /* Tasks before the note. What was on the day is the thing you
         came to see; writing about it is what you do afterwards, and a
         text box at the top pushed the day's actual contents below the
         fold. */
      '<p class="label">Tasks' +
        (taskTally ? ' <span class="dv__tally">' + taskTally + '</span>' : '') +
      '</p>' + taskRows +

      '<p class="label">Note</p>' +
      '<textarea class="note dv__write" id="dv-note" rows="3" placeholder="' +
        (ahead ? 'Anything to remember for that day?' : 'What happened that day?') +
        '">' + escapeHtml(state.notes[key] || '') + '</textarea>' +

      /* Habits are a record of what was done, so a day in the future has
         none to show — a row of zeroes there would read as failure. */
      (ahead ? '' :
        '<p class="label">Habits</p><ul class="dv__list dv__habits">' + habitRows + '</ul>' +
        accountBtn);

    box.removeAttribute('hidden');
    wire(key);
    box.scrollIntoView({ block: 'nearest' });
  }

  function wire(key) {
    var box = document.getElementById('dayview');

    document.getElementById('dv-close').addEventListener('click', close);

    var mark = document.getElementById('dv-mark');
    if (mark) {
      mark.addEventListener('click', function () {
        Storage.closeDay(key, true);
        open(key);
        refresh();
      });
    }

    var unmark = document.getElementById('dv-unmark');
    if (unmark) {
      unmark.addEventListener('click', function () {
        Storage.closeDay(key, false);
        open(key);
        refresh();
      });
    }

    /* onclick, not addEventListener: open() runs again after every
       change and the card element itself survives, so listeners would
       stack and one press would count the habit three times. */
    box.onclick = function (event) {
      var more = event.target.closest('[data-more]');
      if (more) return change(key, more.getAttribute('data-more'), 1);

      var less = event.target.closest('[data-less]');
      if (less) return change(key, less.getAttribute('data-less'), -1);

      var set = event.target.closest('[data-set]');
      if (set) {
        Habits.setValue(set.getAttribute('data-set'), Number(set.getAttribute('data-to')), key);
        open(key);
        refresh();
      }
    };

    var note = document.getElementById('dv-note');

    /* Saved a beat after typing stops. Re-opening the card on every
       keystroke would take the caret with it. */
    note.addEventListener('input', function () {
      var text = this.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { saveNote(key, text); }, 500);
    });

    note.addEventListener('blur', function () {
      clearTimeout(noteTimer);
      saveNote(key, this.value);
    });
  }

  function change(key, id, direction) {
    var habit = Habits.find(id);
    if (!habit) return;

    var current = Habits.valueOf(id, key);
    var next = habit.goal === 1
      ? (current >= 1 ? 0 : 1)
      : Math.max(0, current + habit.step * direction);

    Habits.setValue(id, next, key);
    open(key);
    refresh();
  }

  function saveNote(key, text) {
    var notes = Storage.load().notes;
    if (text.trim()) notes[key] = text;
    else delete notes[key];
    Storage.save();
    refresh();
    /* Today's note box sits on the dashboard as well, and the two must
       not disagree about what is written. */
    if (key === Storage.today() && typeof Panel !== 'undefined') Panel.render();
  }

  function isOpen(key) {
    return openKey === key;
  }

  return { open: open, close: close, isOpen: isOpen };
})();
