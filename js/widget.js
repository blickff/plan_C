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

    Habits.active().forEach(function (habit) {
      var run = Habits.streaks(log, habit, todayKey).current;
      if (run > best) {
        best = run;
        lead = habit;
      }
    });

    return lead ? { habit: lead, run: best } : null;
  }

  function render() {
    document.getElementById('wg-date').textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }).format(new Date());

    var state = Storage.load();
    var score = Habits.completionFor(state.log, state.habits, Storage.today());
    var percent = score === null ? 0 : Math.round(score * 100);

    document.getElementById('wg-ring').style.setProperty('--p', percent);
    document.getElementById('wg-ring-text').innerHTML = percent + '<i>%</i>';

    var lead = leadHabit();
    if (lead && lead.run > 0) {
      document.getElementById('wg-streak-label').textContent = 'Streak · ' + lead.habit.name;
      document.getElementById('wg-streak').innerHTML =
        lead.run + ' <span>' + (lead.run === 1 ? 'day' : 'days') + '</span>';
    } else {
      document.getElementById('wg-streak-label').textContent = 'Today';
      document.getElementById('wg-streak').innerHTML = percent + ' <span>per cent</span>';
    }

    var habits = Habits.active();
    var box = document.getElementById('wg-habits');

    if (!habits.length) {
      box.innerHTML = '<p class="wg__empty">No habits yet — open the panel to pick some.</p>';
      return;
    }

    box.innerHTML = habits.map(function (habit) {
      var value = Habits.valueOf(habit.id);
      var done = value >= habit.goal;
      var width = Math.min(100, Math.round((value / habit.goal) * 100));
      var readout = habit.goal === 1
        ? (done ? 'done' : '—')
        : value + '/' + habit.goal;

      return '' +
        '<button class="wgh' + (done ? ' is-done' : '') + '" data-id="' + escapeHtml(habit.id) + '"' +
        ' title="Click to add, right-click to take away">' +
          '<span class="wgh__name">' + escapeHtml(habit.name) + '</span>' +
          '<span class="wgh__value">' + escapeHtml(readout) + '</span>' +
          '<span class="wgh__bar"><span style="width:' + width + '%"></span></span>' +
        '</button>';
    }).join('');
  }

  /* habits.js calls repaint() after a tick; on the panel that redraws the
     cards, here it redraws the widget. */
  window.repaint = render;

  function start() {
    render();

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

    /* Rolls the widget over at midnight without a restart. */
    setInterval(render, 60 * 1000);

    if (!window.desktop) return;

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
