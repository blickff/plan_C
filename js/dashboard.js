/* The two summary cards at the top of the dashboard: the dark streak card
   with this week's dots, and the year card. Both read from habits.js. */

var Dashboard = (function () {
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mondayOfThisWeek() {
    var now = new Date();
    var shift = (now.getDay() + 6) % 7;
    var monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - shift);
    return monday;
  }

  /* The habit with the longest run going right now. That is the one worth
     putting on the big card — it is the thing you would not want to break. */
  function leadHabit() {
    var log = Storage.load().log;
    var todayKey = Storage.today();
    var lead = null;
    var bestRun = -1;

    Habits.active().forEach(function (habit) {
      var run = Habits.streaks(log, habit, todayKey).current;
      if (run > bestRun) {
        bestRun = run;
        lead = habit;
      }
    });

    return lead ? { habit: lead, run: bestRun } : null;
  }

  function weekRow(habit) {
    var log = Storage.load().log;
    var todayKey = Storage.today();
    var cursor = mondayOfThisWeek();

    var cells = DAY_NAMES.map(function (name) {
      var key = Storage.dateKey(cursor);
      cursor.setDate(cursor.getDate() + 1);

      var state;
      var mark = '';

      if (Habits.metOn(log, habit, key)) {
        state = 'is-done';
        mark = '&#10003;';
      } else if (key === todayKey) {
        state = 'is-today';
      } else if (key > todayKey) {
        state = 'is-future';
      } else {
        state = 'is-missed';
      }

      return '' +
        '<div class="week__day">' +
          '<span class="dot ' + state + '" title="' + key + '">' + mark + '</span>' +
          '<span class="week__name">' + name + '</span>' +
        '</div>';
    });

    return '<div class="week">' + cells.join('') + '</div>';
  }

  function renderStreak() {
    var el = document.getElementById('streak-card');
    var lead = leadHabit();

    if (!lead) {
      el.innerHTML =
        '<p class="card__eyebrow">Streak</p>' +
        '<p class="card__big">No habits yet</p>' +
        '<p class="card__note">Press “Edit habits” to pick a few.</p>';
      return;
    }

    var word = lead.run === 1 ? 'day' : 'days';
    var state = Storage.load();
    var score = Habits.completionFor(state.log, state.habits, Storage.today());
    var percent = score === null ? 0 : Math.round(score * 100);

    /* The ring replaces what used to be a bare habit name: it answers
       "how is today going" across habits measured in different units. */
    var ring = '' +
      '<div class="ring" style="--p: ' + percent + '"' +
        ' title="Today: ' + percent + '% of your goals, averaged across habits">' +
        '<span class="ring__inner">' + percent + '<i>%</i></span>' +
      '</div>';

    el.innerHTML = '' +
      '<div class="card__head">' +
        '<div>' +
          '<p class="card__eyebrow">Streak · ' + escapeHtml(lead.habit.name) + '</p>' +
          '<p class="card__big">' + lead.run + ' <span>' + word + '</span></p>' +
        '</div>' +
        ring +
      '</div>' +
      weekRow(lead.habit);
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  var DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  /* Month is the default: on day one of using this, a whole year of empty
     squares says nothing. Year is there when there is a year to look at. */
  function scope() {
    return Storage.load().settings.periodScope === 'year' ? 'year' : 'month';
  }

  function setScope(next) {
    Storage.load().settings.periodScope = next;
    Storage.save();
    renderPeriod();
  }

  /* Which month is on screen, as 'YYYY-MM'. Kept separately from today
     so the calendar can be walked back through past months — otherwise
     tapping a month in the year view would have nowhere to go. */
  function viewKey() {
    var saved = Storage.load().settings.periodKey;
    return /^\d{4}-\d{2}$/.test(saved || '') ? saved : Storage.today().slice(0, 7);
  }

  function setViewKey(key, alsoScope) {
    var settings = Storage.load().settings;
    settings.periodKey = key;
    if (alsoScope) settings.periodScope = alsoScope;
    Storage.save();
    renderPeriod();
  }

  function shiftMonths(key, delta) {
    var year = Number(key.slice(0, 4));
    var month = Number(key.slice(5, 7)) - 1 + delta;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
    return year + '-' + pad2(month + 1);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* Average share of habits completed across a range of days, ignoring
     days before any habit existed. */
  function completionOver(firstKey, lastKey) {
    var state = Storage.load();
    var total = 0;
    var counted = 0;
    var key = firstKey;
    var guard = 0;

    while (key <= lastKey && guard++ < 400) {
      var ratio = Habits.completionFor(state.log, state.habits, key);
      if (ratio !== null) {
        total += ratio;
        counted++;
      }
      key = Habits.shiftDate(key, 1);
    }

    return counted ? Math.round((total / counted) * 100) : null;
  }

  function monthBody(year, month, todayKey) {
    var state = Storage.load();
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    /* Lead with blanks so the first of the month lands under its weekday. */
    var firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    var cells = [];
    for (var b = 0; b < firstWeekday; b++) {
      cells.push('<span class="day day--blank"></span>');
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var key = year + '-' + pad2(month + 1) + '-' + pad2(d);
      var extra = '';
      var level;

      if (key > todayKey) {
        level = -2;
      } else {
        level = Habits.levelOn(state.log, state.habits, key);
      }
      if (key === todayKey) extra = ' is-today';

      cells.push('<span class="day' + extra + '" data-level="' + level +
        '" title="' + key + '">' + d + '</span>');
    }

    var heads = DOW.map(function (name) {
      return '<span class="dow">' + name + '</span>';
    }).join('');

    return '<div class="days">' + heads + cells.join('') + '</div>';
  }

  /* Each month is a button into that month's calendar — looking at a
     year and not being able to open any of it was the obvious gap. */
  function yearBody(year, todayKey) {
    var thisYear = Number(todayKey.slice(0, 4));
    var thisMonth = Number(todayKey.slice(5, 7)) - 1;

    var cells = MONTHS.map(function (name, i) {
      var cls = '';
      if (year < thisYear || (year === thisYear && i < thisMonth)) cls = ' is-done';
      else if (year === thisYear && i === thisMonth) cls = ' is-now';

      return '<button class="month' + cls + '" type="button" data-month="' +
        year + '-' + pad2(i + 1) + '">' + name + '</button>';
    });

    return '<div class="months">' + cells.join('') + '</div>';
  }

  function lastDayOf(year, month) {
    return year + '-' + pad2(month + 1) + '-' + pad2(new Date(year, month + 1, 0).getDate());
  }

  function renderPeriod() {
    var todayKey = Storage.today();
    var key = viewKey();
    var year = Number(key.slice(0, 4));
    var month = Number(key.slice(5, 7)) - 1;
    var which = scope();

    var title;
    var percent;
    var body;
    var step;

    if (which === 'year') {
      title = String(year);
      /* A finished year is measured to its end; the current one only as
         far as today, or the months still to come would count as zero. */
      var yearEnd = year + '-12-31';
      percent = completionOver(year + '-01-01', yearEnd < todayKey ? yearEnd : todayKey);
      body = yearBody(year, todayKey);
      step = 12;
    } else {
      title = MONTH_NAMES[month] + ' ' + year;
      var monthEnd = lastDayOf(year, month);
      percent = completionOver(year + '-' + pad2(month + 1) + '-01',
        monthEnd < todayKey ? monthEnd : todayKey);
      body = monthBody(year, month, todayKey);
      step = 1;
    }

    /* Stops at the month containing today: there is nothing to look at
       in the future, and an arrow that leads nowhere is a dead control. */
    var atLatest = which === 'year'
      ? year >= Number(todayKey.slice(0, 4))
      : key >= todayKey.slice(0, 7);

    document.getElementById('year-card').innerHTML = '' +
      '<div class="card__head">' +
        '<div class="period">' +
          '<button class="period__arrow" type="button" data-step="-' + step + '" aria-label="Earlier">&#8249;</button>' +
          '<p class="card__title">' + title + '</p>' +
          '<button class="period__arrow" type="button" data-step="' + step + '"' +
            (atLatest ? ' disabled' : '') + ' aria-label="Later">&#8250;</button>' +
          /* The share sits on the title line: as its own big number it
             cost more height than the calendar underneath could spare. */
          '<span class="period__share">' +
            (percent === null ? '—' : percent + '% done') +
          '</span>' +
        '</div>' +
        '<div class="seg">' +
          '<button class="seg__btn' + (which === 'month' ? ' is-active' : '') +
            '" type="button" data-scope="month">Month</button>' +
          '<button class="seg__btn' + (which === 'year' ? ' is-active' : '') +
            '" type="button" data-scope="year">Year</button>' +
        '</div>' +
      '</div>' +
      body;

    /* onclick, not addEventListener: this runs on every redraw, and the
       card element itself survives them — addEventListener would stack a
       new handler each time, so one click on an arrow would jump as many
       months as the card had been drawn. Assigning onclick replaces. */
    document.getElementById('year-card').onclick = function (event) {
      var scopeBtn = event.target.closest('[data-scope]');
      if (scopeBtn) return setScope(scopeBtn.getAttribute('data-scope'));

      var arrow = event.target.closest('[data-step]');
      if (arrow && !arrow.disabled) {
        return setViewKey(shiftMonths(viewKey(), Number(arrow.getAttribute('data-step'))));
      }

      var monthBtn = event.target.closest('[data-month]');
      if (monthBtn) setViewKey(monthBtn.getAttribute('data-month'), 'month');
    };
  }

  function render() {
    renderStreak();
    renderPeriod();
  }

  return { render: render };
})();
