/* The desktop widget. Same data and same logic as the panel — it loads
   storage.js and habits.js — but its own compact drawing.

   It runs in a second window over the same origin as the panel, so both
   read one localStorage. The browser fires a `storage` event in every
   other window of an origin when one of them writes, which is how the
   two stay in step without either knowing the other exists. */

var Widget = (function () {

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function leadHabit() {
    var log = Storage.load().log;
    var todayKey = Storage.today();
    var lead = null;
    var best = -1;

    var unit = 'day';
    Habits.active().forEach(function (habit) {
      var run = Habits.streaks(log, habit, todayKey);
      if (run.current > best) {
        best = run.current;
        unit = run.unit;
        lead = habit;
      }
    });

    return lead ? { habit: lead, run: best, unit: unit } : null;
  }

  /* The widget never asked which theme was chosen, so it was light in
     every case — including inside a window Electron paints black before
     the page arrives. Same rule as the panel: the setting, or the clock
     when the setting says to follow it. */
  function applyTheme() {
    var choice = Storage.load().settings.theme || 'auto';
    var hour = new Date().getHours();
    var theme = choice === 'auto'
      ? (hour >= 7 && hour < 19 ? 'light' : 'dark')
      : choice;
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* Header ------------------------------------------------------------ */

  function renderDate() {
    document.getElementById('wg-date').textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }).format(new Date());
  }

  function renderRing(percent) {
    var ring = document.getElementById('wg-ring');
    ring.style.setProperty('--p', percent);
    document.getElementById('wg-ring-text').innerHTML = percent + '<i>%</i>';
  }

  function renderStreak() {
    var lead = leadHabit();
    var label = document.getElementById('wg-streak-label');
    var value = document.getElementById('wg-streak');

    /* The longest run going, and which habit it belongs to. When
       nothing is running it still says so rather than swapping in a
       different measure — a widget whose big number changes meaning is
       a widget you have to read twice. */
    if (lead && lead.run > 0) {
      label.textContent = 'Streak · ' + lead.habit.name;
      value.innerHTML = lead.run + ' <span>' +
        lead.unit + (lead.run === 1 ? '' : 's') + '</span>';
    } else {
      label.textContent = 'Streak';
      value.innerHTML = '0 <span>days</span>';
    }
  }

  function renderChip(habits) {
    var chip = document.getElementById('wg-done');

    if (!habits.length) {
      chip.setAttribute('hidden', '');
      return;
    }

    /* Counted against what today actually asks for. A habit that is
       not on today has no business making the number look worse. */
    var due = habits.filter(function (habit) { return Habits.dueToday(habit); });
    if (!due.length) {
      chip.textContent = 'Nothing due today';
      chip.classList.remove('is-full');
      chip.removeAttribute('hidden');
      return;
    }

    var done = due.filter(function (habit) {
      return Habits.valueOf(habit.id) >= habit.goal;
    }).length;

    chip.textContent = done === due.length
      ? 'All ' + due.length + ' done'
      : done + ' of ' + due.length + ' done';
    chip.classList.toggle('is-full', done === due.length);
    chip.removeAttribute('hidden');
  }

  /* The last seven days, today last. Enough to see whether this week is
     going anywhere without opening the panel; the panel keeps the month
     and the year for when it matters. */
  function renderWeek() {
    var state = Storage.load();
    var todayKey = Storage.today();
    var narrow = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' });
    var html = '';

    for (var back = 6; back >= 0; back--) {
      var key = Habits.shiftDate(todayKey, -back);
      var parts = key.split('-');
      var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      var level = Habits.levelOn(state.log, state.habits, key);

      html += '' +
        '<div class="wgd' + (back === 0 ? ' is-today' : '') + '" title="' + key + '">' +
          '<span class="wgd__bar"' + (level < 0 ? '' : ' data-level="' + level + '"') + '></span>' +
          '<span class="wgd__day">' + escapeHtml(narrow.format(date)) + '</span>' +
        '</div>';
    }

    document.getElementById('wg-week').innerHTML = html;
  }

  /* Habits ------------------------------------------------------------- */

  function renderHabits(habits) {
    var box = document.getElementById('wg-habits');

    if (!habits.length) {
      box.classList.remove('is-scrollable');
      box.innerHTML = '<p class="wg__empty">No habits yet — open the panel to pick some.</p>';
      return;
    }

    box.innerHTML = habits.map(function (habit) {
      var value = Habits.valueOf(habit.id);
      var done = value >= habit.goal;
      var width = Math.min(100, Math.round((value / habit.goal) * 100));
      var readout = habit.goal === 1
        ? (done ? 'done' : '—')
        : value + '/' + habit.goal + (habit.unit ? ' ' + habit.unit : '');

      return '' +
        '<button class="wgh' + (done ? ' is-done' : '') +
          (Habits.dueToday(habit) ? '' : ' is-off') + '" data-id="' + escapeHtml(habit.id) + '"' +
        ' title="Click to add, right-click to take away">' +
          '<span class="wgh__name">' + escapeHtml(habit.name) + '</span>' +
          '<span class="wgh__value">' + escapeHtml(readout) + '</span>' +
          '<span class="wgh__bar"><span style="width:' + width + '%"></span></span>' +
        '</button>';
    }).join('');

    fade(box);
  }

  /* The list fades out at the bottom only when something is actually
     hidden below it — a permanent fade would leave the last row looking
     half-erased on a list that fits perfectly well. */
  function fade(box) {
    box.classList.toggle('is-scrollable', box.scrollHeight > box.clientHeight + 1);
  }

  function render() {
    applyTheme();
    renderDate();

    var state = Storage.load();
    var score = Habits.completionFor(state.log, state.habits, Storage.today());
    /* Due first, the rest below and dimmed: what today asks for should
       not be mixed in among what it does not. */
    var log = state.log;
    var key = Storage.today();
    var habits = Habits.active().sort(function (a, b) {
      return (Habits.dueOn(log, b, key) ? 1 : 0) - (Habits.dueOn(log, a, key) ? 1 : 0);
    });

    var percent = score === null ? 0 : Math.round(score * 100);
    renderRing(percent);
    tellTray(percent);
    renderStreak();
    renderChip(habits);
    renderWeek();
    renderHabits(habits);
  }

  /* The reminder ---------------------------------------------------

     The app was entirely passive: it sat there and waited to be looked
     at, which is the one thing a habit tracker cannot afford to do.
     One nudge a day, at an hour the person picks, and only if the day
     is actually unfinished when it comes.

     It lives in the widget because the widget is the window that stays
     open. The page has to be the one to decide, too — Electron's side
     has no idea what got done. */
  function checkReminder() {
    if (!window.desktop || !window.desktop.notify) return;

    var settings = Storage.load().settings;
    var plan = settings.reminder;
    if (!plan || !plan.on) return;

    var todayKey = Storage.today();
    if (plan.sent === todayKey) return;
    if (Storage.clock() < (plan.at || '21:00')) return;

    var due = Habits.active().filter(function (habit) { return Habits.dueToday(habit); });
    var left = due.filter(function (habit) {
      return Habits.valueOf(habit.id) < habit.goal;
    });

    /* Marked as sent either way. A finished day should not leave the
       check running every minute until midnight looking for a reason
       to interrupt. */
    plan.sent = todayKey;
    Storage.save();
    if (!left.length) return;

    var names = left.slice(0, 3).map(function (habit) { return habit.name; }).join(', ');
    if (left.length > 3) names += ' and ' + (left.length - 3) + ' more';

    window.desktop.notify(
      left.length === 1 ? 'One thing left today' : left.length + ' things left today',
      names
    );
  }

  function tellTray(percent) {
    if (!window.desktop || !window.desktop.setTrayNote) return;
    window.desktop.setTrayNote('Daybook — ' + percent + '% of today done');
  }

  /* habits.js calls repaint() after a tick; on the panel that redraws the
     cards, here it redraws the widget. */
  window.repaint = render;

  function start() {
    render();

    /* Same as the panel: the file may hold a later version than this
       window does. */
    Storage.adoptVault(function (adopted) {
      if (adopted) render();
    });

    /* Only once a city is known. Started blind, the weather line would
       read "set a city in Settings" — and the widget has no Settings,
       so that is a line of chrome telling you to go somewhere else. */
    if (Storage.load().settings.place) Weather.start();

    var box = document.getElementById('wg-habits');

    box.addEventListener('click', function (event) {
      var chip = event.target.closest('.wgh');
      if (chip) Habits.bump(chip.getAttribute('data-id'), 1);
    });

    box.addEventListener('contextmenu', function (event) {
      var chip = event.target.closest('.wgh');
      if (!chip) return;
      event.preventDefault();
      Habits.bump(chip.getAttribute('data-id'), -1);
    });

    /* Another window of this origin wrote to storage — most likely the
       full panel. Redraw rather than drift out of date. */
    window.addEventListener('storage', function (event) {
      if (event.key === 'dayPanel') {
        Storage.reload();
        render();
      }
    });

    /* Resizing changes what fits, so the bottom fade has to be worked
       out again. */
    window.addEventListener('resize', function () { fade(box); });

    /* Rolls the widget over at midnight without a restart, and is the
       heartbeat the reminder rides on. */
    setInterval(function () {
      render();
      checkReminder();
    }, 60 * 1000);

    checkReminder();

    if (!window.desktop) return;

    UpdateUI.start({ buttons: [document.getElementById('wg-update')] });

    document.getElementById('wg-open').addEventListener('click', function () {
      window.desktop.openPanel();
    });

    document.getElementById('wg-hide').addEventListener('click', function () {
      window.desktop.hideWidget();
    });

    var topBtn = document.getElementById('wg-top');
    window.desktop.getWindowSettings().then(function (settings) {
      topBtn.classList.toggle('is-on', settings.onTop);
    });

    topBtn.addEventListener('click', function () {
      window.desktop.toggleOnTop().then(function (onTop) {
        topBtn.classList.toggle('is-on', onTop);
      });
    });
  }

  return { start: start, render: render };
})();

Widget.start();
