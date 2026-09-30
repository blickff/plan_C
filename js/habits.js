/* Habits: the stored set, today's values, and the two pieces of UI that go
   with them (the tiles and the picker). Logic and rendering sit together
   while the file is this small. */

var Habits = (function () {

  /* Names typed by the person end up inside innerHTML, so they get escaped
     on the way out. */
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function all() {
    return Storage.load().habits;
  }

  function active() {
    return all().filter(function (h) { return !h.archived; });
  }

  function find(id) {
    var list = all();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* Dates ------------------------------------------------------------
     Date keys are 'YYYY-MM-DD', which compares correctly as plain text,
     so no Date objects are needed to put two days in order. */

  function shiftDate(key, days) {
    var parts = key.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    return Storage.dateKey(date);
  }

  /* Monday is 0. The week starts on Monday everywhere in this project;
     getDay() calling Sunday 0 is a fact about JavaScript, not about weeks. */
  function weekdayOf(key) {
    var parts = key.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return (date.getDay() + 6) % 7;
  }

  function mondayOf(key) {
    return shiftDate(key, -weekdayOf(key));
  }

  /* Schedules ---------------------------------------------------------

     A habit used to be daily and only daily, and that made the whole
     scoreboard wrong for anyone whose habits are not. Three gym sessions
     in a week is a perfect week; under the old model it read as 43% and
     painted four days of the calendar as failures.

     Three shapes cover nearly everything:
       nothing / {type:'daily'}          every day
       {type:'days', days:[0,2,4]}       certain weekdays, Monday is 0
       {type:'week', times:3}            that many times a week, any days */

  function schedOf(habit) {
    var s = habit && habit.sched;
    if (!s || !s.type || s.type === 'daily') return { type: 'daily' };
    if (s.type === 'days') {
      var days = (s.days || []).filter(function (d) { return d >= 0 && d <= 6; });
      return days.length ? { type: 'days', days: days } : { type: 'daily' };
    }
    if (s.type === 'week') {
      var times = Math.max(1, Math.min(7, parseInt(s.times, 10) || 1));
      return { type: 'week', times: times };
    }
    return { type: 'daily' };
  }

  var DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function scheduleLabel(habit) {
    var s = schedOf(habit);
    if (s.type === 'daily') return 'Every day';
    if (s.type === 'week') return s.times + '× a week';
    return s.days.slice().sort().map(function (d) { return DAY_SHORT[d]; }).join(', ');
  }

  /* How many times the habit was met in the week containing `key`,
     counting only the days strictly before it. */
  function metEarlierInWeek(log, habit, key) {
    var cursor = mondayOf(key);
    var done = 0;
    var guard = 0;
    while (cursor < key && guard++ < 10) {
      if (metOn(log, habit, cursor)) done++;
      cursor = shiftDate(cursor, 1);
    }
    return done;
  }

  /* Is this a day the habit is actually asked for?

     For the weekly kind the answer is the interesting one. Three times a
     week does not mean Monday; it means the week is not lost yet. So a
     weekly habit is only "due" on a day once there are no spare days
     left — do it today or the week cannot be made. Any earlier day it is
     optional, and skipping an optional day is not a miss. */
  function dueOn(log, habit, key) {
    var s = schedOf(habit);
    if (s.type === 'daily') return true;
    if (s.type === 'days') return s.days.indexOf(weekdayOf(key)) !== -1;

    var remaining = s.times - metEarlierInWeek(log, habit, key);
    if (remaining <= 0) return false;
    var daysLeft = 7 - weekdayOf(key);
    return remaining >= daysLeft;
  }

  function dueToday(habit) {
    return dueOn(Storage.load().log, habit, Storage.today());
  }

  /* The values of the day on screen ------------------------------------

     Which is today unless a day was picked off the calendar. The
     default is Storage.viewingDay() rather than today so that one set
     of controls works for any day — the widget never picks a day, so
     for it the two are always the same. */

  function valueOf(id, key) {
    var log = Storage.load().log;
    return Storage.valuesOn(log, key || Storage.viewingDay())[id] || 0;
  }

  function setValue(id, value, key) {
    key = key || Storage.viewingDay();
    var day = Storage.day(key, true);

    if (value > 0) {
      day.values[id] = value;
      /* The clock is only meaningful for something happening now.
         Filling in last Tuesday from memory does not tell you when last
         Tuesday's run happened, and inventing a time would poison the
         one insight that depends on it. */
      if (key === Storage.today()) {
        if (!day.at) day.at = {};
        if (!day.at[id]) day.at[id] = Storage.clock();
      }
    } else {
      /* Zero is the default, so storing it would only pad the file. */
      delete day.values[id];
      if (day.at) {
        delete day.at[id];
        if (!Object.keys(day.at).length) delete day.at;
      }
      /* Zeroing the last habit would make the day look untouched again,
         which is a different claim from "nothing got done". */
      if (!Object.keys(day.values).length) day.closed = true;
    }

    Storage.save();
  }

  /* A goal of 1 is the tick-box case: clicking flips it rather than
     counting past the goal. Everything else moves by its step. */
  function bump(id, direction, key) {
    var habit = find(id);
    if (!habit) return;

    key = key || Storage.viewingDay();
    /* A day that has not arrived cannot have been done. Nothing stops
       you writing a note or a task on it — those are plans — but a
       habit value is a record of something that happened. */
    if (key > Storage.today()) return;

    var current = valueOf(id, key);
    var next;

    if (habit.goal === 1) {
      next = current >= 1 ? 0 : 1;
    } else {
      next = current + habit.step * direction;
    }

    setValue(id, Math.max(0, next), key);
    renderTiles();
    /* Today's cell and the streak numbers move with every tick. */
    if (typeof repaint === 'function') repaint();
  }

  /* Re-adding a preset that was removed earlier revives the same habit
     instead of making a second one — a duplicate would leave the old
     history stranded under an id nothing renders. */
  function addPreset(presetId) {
    var existing = find(presetId);
    if (existing) {
      existing.archived = false;
    } else {
      var preset = null;
      PRESETS.forEach(function (group) {
        group.items.forEach(function (item) {
          if (item.id === presetId) preset = item;
        });
      });
      if (!preset) return;

      all().push({
        id: preset.id,
        name: preset.name,
        goal: preset.goal,
        unit: preset.unit,
        step: preset.step,
        custom: false,
        createdAt: Storage.today(),
        archived: false
      });
    }
    Storage.save();
    render();
  }

  function addCustom(name, goal, unit) {
    name = String(name || '').trim();
    goal = parseInt(goal, 10);
    unit = String(unit || '').trim() || 'times';

    if (!name) return 'Give the habit a name.';
    if (!goal || goal < 1) return 'The goal has to be a whole number, 1 or more.';

    all().push({
      id: 'custom-' + Date.now(),
      name: name,
      goal: goal,
      unit: unit,
      /* A big goal would be unusable at one per click, so pick a step that
         needs about ten clicks to finish. */
      step: goal > 10 ? Math.max(1, Math.round(goal / 10)) : 1,
      custom: true,
      createdAt: Storage.today(),
      archived: false
    });

    Storage.save();
    render();
    return null;
  }

  /* A goal is the one thing everybody sets differently — twenty pages is
     someone else's number. Presets ship with a starting value, not a
     rule, so any of them can be retuned after it has been added.

     Note the history is not rewritten: the log stores what was actually
     done each day, not a percentage. Raise the goal and past days score
     lower against it. That is the honest reading — the days did not
     change, the bar did. */
  function retune(id, goal, unit) {
    var habit = find(id);
    if (!habit) return 'That habit is gone.';

    goal = parseInt(goal, 10);
    if (!goal || goal < 1) return 'The goal has to be a whole number, 1 or more.';

    habit.goal = goal;
    habit.unit = String(unit || '').trim() || habit.unit;
    /* Recomputed, not kept: a step of 5 was fine for 20 minutes and
       absurd for 120. About ten presses to finish, as everywhere else. */
    habit.step = goal > 10 ? Math.max(1, Math.round(goal / 10)) : 1;

    Storage.save();
    render();
    return null;
  }

  function setSchedule(id, sched) {
    var habit = find(id);
    if (!habit) return;
    var clean = schedOf({ sched: sched });
    if (clean.type === 'daily') delete habit.sched;
    else habit.sched = clean;
    Storage.save();
    render();
  }

  /* Archived, never deleted: the log is keyed by habit id, and dropping the
     habit would orphan every day it was ever ticked. */
  function remove(id) {
    var habit = find(id);
    if (!habit) return;
    habit.archived = true;
    Storage.save();
    render();
  }

  /* Streaks and rates -------------------------------------------------
     The functions below are pure: everything they need arrives as an
     argument, nothing is read from the DOM or storage. That makes them
     easy to try out on made-up data. */

  function metOn(log, habit, key) {
    return (Storage.valuesOn(log, key)[habit.id] || 0) >= habit.goal;
  }

  /* Every point at which the habit could have been met, oldest first.
     For a daily or weekday habit that is a day; for a weekly one it is a
     whole week, because three-times-a-week is kept or broken by the week
     and not by any single Tuesday. */
  function occurrences(log, habit, todayKey) {
    var s = schedOf(habit);
    var out = [];
    var guard = 0;
    var start = habit.createdAt && habit.createdAt < todayKey ? habit.createdAt : todayKey;

    if (s.type === 'week') {
      var week = mondayOf(start);
      var thisWeek = mondayOf(todayKey);
      while (week <= thisWeek && guard++ < 600) {
        var done = 0;
        for (var i = 0; i < 7; i++) {
          var d = shiftDate(week, i);
          if (d > todayKey) break;
          if (metOn(log, habit, d)) done++;
        }
        out.push({ key: week, met: done >= s.times });
        week = shiftDate(week, 7);
      }
      return out;
    }

    var key = start;
    while (key <= todayKey && guard++ < 4000) {
      if (s.type === 'daily' || s.days.indexOf(weekdayOf(key)) !== -1) {
        out.push({ key: key, met: metOn(log, habit, key) });
      }
      key = shiftDate(key, 1);
    }
    return out;
  }

  function streaks(log, habit, todayKey) {
    var list = occurrences(log, habit, todayKey);
    var best = 0;
    var run = 0;

    list.forEach(function (point) {
      if (point.met) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    });

    /* The one still in progress only counts once it is actually done. An
       unfinished today must not read as a break, or every morning would
       announce that the streak is over before the day has begun. */
    var last = list.length - 1;
    if (last >= 0 && !list[last].met) last--;

    var current = 0;
    while (last >= 0 && list[last].met) {
      current++;
      last--;
    }

    return {
      current: current,
      best: best,
      unit: schedOf(habit).type === 'week' ? 'week' : 'day'
    };
  }

  /* Met how often out of how many chances, over the last N days. This is
     what a streak cannot say: a streak of nought and a streak of nought
     look identical whether the last month was perfect but for yesterday,
     or empty throughout. */
  function rate(log, habit, todayKey, windowDays) {
    var from = shiftDate(todayKey, -(windowDays - 1));
    var list = occurrences(log, habit, todayKey).filter(function (point) {
      return point.key >= from;
    });
    var met = list.filter(function (point) { return point.met; }).length;
    return { met: met, total: list.length, unit: schedOf(habit).type === 'week' ? 'week' : 'day' };
  }

  /* The habit doing worst lately, when there is one worth naming. The
     dashboard averages everything into a single ring, and an average is
     exactly the thing that hides one habit failing while the rest carry
     the number. */
  function laggard(log, habits, todayKey) {
    var worst = null;

    habits.forEach(function (habit) {
      var r = rate(log, habit, todayKey, 30);
      if (r.total < 7) return;
      var share = r.met / r.total;
      if (share > 0.4) return;
      if (!worst || share < worst.share) {
        worst = { habit: habit, share: share, met: r.met, total: r.total, unit: r.unit };
      }
    });

    return worst;
  }

  /* Which habits a given day is actually judged on.

     A habit counts on a day if it was asked for that day, or if it was
     done that day anyway. The second half matters: going to the gym on a
     day it was not required should never make the day look worse. */
  function countingOn(log, habits, key) {
    return habits.filter(function (h) {
      if (h.archived) return false;
      if (h.createdAt && h.createdAt > key) return false;
      if ((Storage.valuesOn(log, key)[h.id] || 0) > 0) return true;
      return dueOn(log, h, key);
    });
  }

  /* How much of that day got done, from 0 to 1, or null when nothing was
     being asked of it.

     Habits are measured in different units — 20 minutes and 20 pages are
     the same number and nothing alike — so nothing raw can be added up.
     What compares is each habit's progress against its own goal: a share
     with no unit attached. Those shares average cleanly.

     Each one is capped at 1 so that overshooting one habit cannot paper
     over skipping another: drinking sixteen glasses does not make up for
     not reading. */
  function completionFor(log, habits, key) {
    var eligible = countingOn(log, habits, key);
    if (!eligible.length) return null;

    var values = Storage.valuesOn(log, key);
    var total = 0;

    eligible.forEach(function (habit) {
      total += Math.min(1, (values[habit.id] || 0) / habit.goal);
    });

    return total / eligible.length;
  }

  /* Three colours: red under 15%, yellow to 65%, green from there. One
     definition, used by the month calendar and the history grid alike —
     two copies would drift and the same day would end up a different
     colour in two places.

     Nothing done and 10% done are both red on purpose: at that point the
     day did not happen, and splitting hairs between them would need a
     shade nobody can read off a small square.

     -1 is "no score", and it covers two cases that must not be painted
     red. One is a day before any habit existed. The other, and this was
     a real lie the calendar used to tell, is a day nobody ever accounted
     for: the app not being open on Sunday is not the same as failing on
     Sunday, and colouring it red said it was. */
  function levelOn(log, habits, key) {
    if (!Storage.known(log, key)) return -1;
    var score = completionFor(log, habits, key);
    if (score === null) return -1;
    if (score < 0.15) return 0;
    if (score < 0.65) return 1;
    return 2;
  }

  function streaksFor(habit) {
    return streaks(Storage.load().log, habit, Storage.today());
  }

  /* Rendering ------------------------------------------------------- */

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function tileHtml(habit, key, ahead) {
    var value = valueOf(habit.id, key);
    var done = value >= habit.goal;
    var percent = Math.min(100, Math.round((value / habit.goal) * 100));
    var due = dueOn(Storage.load().log, habit, key);
    var here = key === Storage.today();

    var readout = habit.goal === 1
      /* A dash, not "Not yet": an empty bar under the name already says
         it, and the words were one more line of text to read past. */
      ? (done ? 'Done' : '—')
      : '<strong>' + value + '</strong> / ' + habit.goal + ' ' + escapeHtml(habit.unit);

    /* A streak is a fact about now, so it only belongs on the tile
       while the tile is showing now. On a day in the past it would
       describe something that has not happened yet from that day's
       point of view. */
    var foot;
    if (!due) {
      foot = 'Not on this day — ' + scheduleLabel(habit).toLowerCase();
    } else if (here) {
      var run = streaksFor(habit);
      foot = run.current >= 2 ? plural(run.current, run.unit) + ' in a row' : '';
    } else {
      foot = '';
    }

    var hint = ahead
      ? 'Still to come — nothing to record yet'
      : escapeHtml(scheduleLabel(habit)) + ' · click to add, right-click to take away';

    return '' +
      '<button class="tile' + (done ? ' is-done' : '') + (due ? '' : ' is-off') +
        (ahead ? ' is-ahead' : '') +
        '" data-id="' + escapeHtml(habit.id) + '"' + (ahead ? ' disabled' : '') +
      ' title="' + hint + '">' +
        '<span class="tile__name">' + escapeHtml(habit.name) + '</span>' +
        '<span class="tile__value">' + readout + '</span>' +
        '<span class="tile__bar"><span style="width:' + percent + '%"></span></span>' +
        (foot ? '<span class="tile__streak">' + escapeHtml(foot) + '</span>' : '') +
      '</button>';
  }

  /* Due first. What is being asked of you on that day belongs above
     what is not; the rest stay visible because doing one early is
     allowed. Habits younger than the day are left out entirely — a
     habit started last week has nothing to say about last month. */
  function orderFor(key) {
    var log = Storage.load().log;
    var due = [];
    var off = [];

    active().forEach(function (habit) {
      if (habit.createdAt && habit.createdAt > key) return;
      (dueOn(log, habit, key) ? due : off).push(habit);
    });

    return due.concat(off);
  }

  function renderTiles() {
    var el = document.getElementById('tiles');
    /* The desktop widget loads this file for the logic but draws its own
       compact layout, so the full panel's containers are not there. */
    if (!el) return;

    var key = Storage.viewingDay();
    var ahead = key > Storage.today();
    var list = orderFor(key);

    if (!list.length) {
      el.innerHTML = Storage.viewingToday()
        ? '<p class="empty">No habits yet — press “Edit habits” to pick some.</p>'
        : '<p class="empty">No habits existed yet on that day.</p>';
      return;
    }

    /* What each tile showed before the redraw, so its bar can grow from
       there and a tile that has just been finished can say so. */
    var before = {};
    el.querySelectorAll('.tile').forEach(function (t) {
      var bar = t.querySelector('.tile__bar > span');
      before[t.getAttribute('data-id')] = { width: bar ? bar.style.width : '', done: t.classList.contains('is-done') };
    });

    el.innerHTML = list.map(function (habit) { return tileHtml(habit, key, ahead); }).join('');

    if (typeof Motion !== 'undefined' && Motion.on()) {
      el.querySelectorAll('.tile').forEach(function (t) {
        var was = before[t.getAttribute('data-id')];
        if (!was) return;
        var bar = t.querySelector('.tile__bar > span');
        if (bar && was.width && was.width !== bar.style.width) {
          var to = bar.style.width;
          bar.style.transition = 'none';
          bar.style.width = was.width;
          bar.getBoundingClientRect();
          bar.style.transition = '';
          bar.style.width = to;
        }
        if (!was.done && t.classList.contains('is-done')) Motion.play(t, 'just-done');
      });
    }

    /* In edit mode the tiles are for arranging, not for ticking: each
       one can be dragged to a new place. Outside it they stay what they
       are for — something to press. */
    if (editingNow()) {
      el.querySelectorAll('.tile').forEach(function (t) { t.setAttribute('draggable', 'true'); });
    }
  }

  function editingNow() {
    return document.body.classList.contains('is-editing');
  }

  /* The tiles on screen, in their new order, written back to the stored
     list. The tiles are only the habits that exist on the day on show,
     so each one goes into a slot that one of them held before, and the
     rest keep their places. The editor and the widget follow. */
  function saveTileOrder(ids) {
    var list = all();
    var shown = {};
    ids.forEach(function (id) { shown[id] = true; });
    var byId = {};
    list.forEach(function (h) { byId[h.id] = h; });
    var next = 0;
    for (var i = 0; i < list.length; i++) {
      if (shown[list[i].id]) list[i] = byId[ids[next++]];
    }
    Storage.save();
    render();
  }

  /* Things that change places glide there instead of jumping: each one's
     position is read before the change and after it, and it is shown
     starting from where it was (FLIP). Used by the tiles and by the
     dashboard's blocks. */
  function glide(container, change) {
    var items = Array.prototype.slice.call(container.children);
    var before = items.map(function (el) { return el.getBoundingClientRect(); });
    change();
    items.forEach(function (el, i) {
      var after = el.getBoundingClientRect();
      var dx = before[i].left - after.left;
      var dy = before[i].top - after.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      el.getBoundingClientRect();
      el.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
      el.addEventListener('transitionend', function done() {
        el.style.transition = '';
        el.removeEventListener('transitionend', done);
      });
    });
  }

  function presetHtml(item) {
    var existing = find(item.id);
    var added = existing && !existing.archived;

    /* Once added, the catalogue shows the goal you actually set, not the
       one it shipped with — otherwise a habit tuned to 60 pages would
       still be advertised as 20 right underneath. */
    var shown = added ? existing : item;
    var goalText = shown.goal === 1 ? 'yes / no' : shown.goal + ' ' + shown.unit;

    return '' +
      '<button class="preset' + (added ? ' is-added' : '') + '" data-preset="' + item.id + '">' +
        '<span class="preset__name">' + escapeHtml(item.name) + '</span>' +
        '<span class="preset__goal">' + escapeHtml(goalText) + '</span>' +
      '</button>';
  }

  function schedulerHtml(habit) {
    var s = schedOf(habit);

    var modes = [
      ['daily', 'Every day'],
      ['days', 'Certain days'],
      ['week', 'Times a week']
    ].map(function (pair) {
      return '<option value="' + pair[0] + '"' +
        (s.type === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');

    var dayToggles = DAY_LETTERS.map(function (letter, i) {
      var on = s.type === 'days' && s.days.indexOf(i) !== -1;
      return '<button class="daypick' + (on ? ' is-on' : '') + '" type="button"' +
        ' data-day-toggle="' + i + '" aria-label="' + DAY_SHORT[i] + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + letter + '</button>';
    }).join('');

    return '' +
      '<div class="sched">' +
        '<select class="input input--mode" data-sched-mode aria-label="How often">' + modes + '</select>' +
        '<div class="dayrow"' + (s.type === 'days' ? '' : ' hidden') + '>' + dayToggles + '</div>' +
        '<input class="input input--tiny" type="number" min="1" max="7" step="1"' +
          ' value="' + (s.type === 'week' ? s.times : 3) + '" data-sched-times' +
          ' aria-label="Times a week"' + (s.type === 'week' ? '' : ' hidden') + '>' +
      '</div>';
  }

  /* Whether every suggestion is on show, or only the first row. Kept for
     as long as the page is open, not saved. */
  var showAllPresets = false;

  function renderPicker() {
    var body = document.getElementById('picker-body');
    if (!body) return;

    /* The catalogue folded to one row. All thirty suggestions at once
       pushed the habits you actually have — and the Done button — a long
       way down; most visits to the editor are to add one thing or change
       one goal, not to browse. */
    var groups;
    if (showAllPresets) {
      groups = PRESETS.map(function (group) {
        return '' +
          '<div class="picker__group">' +
            '<h3 class="picker__heading">' + escapeHtml(group.category) + '</h3>' +
            '<div class="picker__items">' + group.items.map(presetHtml).join('') + '</div>' +
          '</div>';
      }).join('');
    } else {
      var first = PRESETS[0];
      groups = '' +
        '<div class="picker__group">' +
          '<h3 class="picker__heading">Suggestions</h3>' +
          '<div class="picker__items picker__items--one">' +
            first.items.slice(0, 4).map(presetHtml).join('') +
          '</div>' +
        '</div>';
    }
    groups += '<button class="picker__more" type="button" id="picker-more" aria-expanded="' + showAllPresets + '">' +
      (showAllPresets ? 'Fewer suggestions' : 'All suggestions') + '</button>';

    /* Everything currently picked, with its goal open for editing. This
       goes first: tuning what you already track matters more than
       browsing the catalogue again. */
    var live = active();
    var mineHtml = '';

    if (live.length) {
      mineHtml = '' +
        '<div class="picker__group">' +
          '<h3 class="picker__heading">Your habits</h3>' +
          '<div class="tuner">' +
            live.map(function (h) {
              return '' +
                '<div class="tune" data-tune="' + escapeHtml(h.id) + '">' +
                  '<span class="tune__name">' + escapeHtml(h.name) + '</span>' +
                  '<button class="task__drop" type="button" data-remove="' +
                    escapeHtml(h.id) + '" aria-label="Remove">&#215;</button>' +
                  '<div class="tune__row">' +
                    '<input class="input input--tiny" type="number" min="1" step="1"' +
                      ' value="' + h.goal + '" data-goal aria-label="Goal">' +
                    '<input class="input input--unit" type="text" placeholder="unit"' +
                      ' value="' + escapeHtml(h.unit) + '" data-unit aria-label="Unit">' +
                    schedulerHtml(h) +
                  '</div>' +
                '</div>';
            }).join('') +
          '</div>' +
          '<p class="custom__hint muted">A goal of 1 means yes / no. ' +
            '“Times a week” only counts against you once the week cannot be made.</p>' +
          '<p class="custom__error" id="tune-error"></p>' +
        '</div>';
    }

    body.innerHTML = mineHtml + groups;
  }

  function render() {
    renderTiles();
    renderPicker();
    /* Adding or removing a habit changes the cards and the grid too.
       Guarded because habits.js loads before main.js defines repaint. */
    if (typeof repaint === 'function') repaint();
  }

  /* Wiring ---------------------------------------------------------- */

  function readSchedule(row) {
    var mode = row.querySelector('[data-sched-mode]').value;
    if (mode === 'week') {
      return { type: 'week', times: row.querySelector('[data-sched-times]').value };
    }
    if (mode === 'days') {
      var days = [];
      row.querySelectorAll('[data-day-toggle]').forEach(function (button) {
        if (button.classList.contains('is-on')) days.push(Number(button.getAttribute('data-day-toggle')));
      });
      /* Certain days with no day chosen is not a schedule, it is a habit
         that can never come up. Treated as daily until one is picked. */
      return days.length ? { type: 'days', days: days } : { type: 'daily' };
    }
    return { type: 'daily' };
  }

  /* Shown and hidden in place rather than by redrawing. The mode is
     being chosen; redrawing mid-choice would throw away the half of it
     that has been made. */
  function syncModeUI(row) {
    var mode = row.querySelector('[data-sched-mode]').value;
    var dayrow = row.querySelector('.dayrow');
    var times = row.querySelector('[data-sched-times]');

    if (mode === 'days') {
      dayrow.removeAttribute('hidden');
      times.setAttribute('hidden', '');
    } else if (mode === 'week') {
      dayrow.setAttribute('hidden', '');
      times.removeAttribute('hidden');
    } else {
      dayrow.setAttribute('hidden', '');
      times.setAttribute('hidden', '');
    }
  }

  function start() {
    render();

    var tiles = document.getElementById('tiles');

    tiles.addEventListener('click', function (event) {
      /* No ticking while arranging: a tile that is picked up and set down
         would otherwise count as a press. */
      if (editingNow()) return;
      var tile = event.target.closest('.tile');
      if (tile) bump(tile.getAttribute('data-id'), 1);
    });

    var carrying = null;

    tiles.addEventListener('dragstart', function (event) {
      var tile = event.target.closest('.tile');
      if (!tile || !editingNow()) return;
      carrying = tile.getAttribute('data-id');
      /* Marked a moment later: the browser takes its picture of the tile
         to carry under the pointer once this handler returns, and it
         should be of the tile, not of the empty gap it leaves. */
      setTimeout(function () { tile.classList.add('is-moving'); }, 0);
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', carrying); } catch (err) {}
      /* Kept inside the habits: the blocks of the page have their own
         dragging, and this must not start it. */
      event.stopPropagation();
    });

    /* The tiles make room as the one being carried passes over them, so
       where it will land is plain to see — it is already there, as an
       outlined gap. Passing a tile moves the carried one to its other
       side: after it when going forward, before it when going back. */
    tiles.addEventListener('dragover', function (event) {
      if (!carrying) return;
      event.preventDefault();
      event.stopPropagation();
      var tile = event.target.closest('.tile');
      var moving = tiles.querySelector('.tile.is-moving');
      if (!tile || !moving || tile === moving) return;
      var list = Array.prototype.slice.call(tiles.querySelectorAll('.tile'));
      var forward = list.indexOf(moving) < list.indexOf(tile);
      glide(tiles, function () {
        tiles.insertBefore(moving, forward ? tile.nextSibling : tile);
      });
    });

    tiles.addEventListener('drop', function (event) {
      if (!carrying) return;
      event.preventDefault();
      event.stopPropagation();
    });

    tiles.addEventListener('dragend', function () {
      if (!carrying) return;
      carrying = null;
      var ids = Array.prototype.map.call(tiles.querySelectorAll('.tile'), function (t) {
        return t.getAttribute('data-id');
      });
      tiles.querySelectorAll('.is-moving').forEach(function (t) { t.classList.remove('is-moving'); });
      saveTileOrder(ids);
    });

    /* Undo matters: without it a stray click leaves the day's number wrong
       for good, and wrong data is worse than no data. */
    tiles.addEventListener('contextmenu', function (event) {
      var tile = event.target.closest('.tile');
      if (!tile || editingNow()) return;
      event.preventDefault();
      bump(tile.getAttribute('data-id'), -1);
    });

    var body = document.getElementById('picker-body');

    /* 'change', not 'input': saving redraws the picker, and redrawing on
       every keystroke would tear the field out from under the cursor. */
    body.addEventListener('change', function (event) {
      var row = event.target.closest('[data-tune]');
      if (!row) return;
      var id = row.getAttribute('data-tune');

      if (event.target.matches('[data-sched-mode]')) {
        syncModeUI(row);
        var picked = readSchedule(row);
        /* "Certain days" with no day ticked yet is the start of a
           choice, not a choice. Saving it would read as daily, redraw
           the row, and snap the menu straight back to Every day — which
           is exactly what it did. */
        if (picked.type === 'daily' && row.querySelector('[data-sched-mode]').value === 'days') return;
        return setSchedule(id, picked);
      }

      if (event.target.matches('[data-sched-times]')) {
        return setSchedule(id, readSchedule(row));
      }

      var error = retune(
        id,
        row.querySelector('[data-goal]').value,
        row.querySelector('[data-unit]').value
      );

      if (error) {
        /* The redraw did not happen, so the box is still on screen. */
        var box = document.getElementById('tune-error');
        if (box) box.textContent = error;
      }
    });

    body.addEventListener('click', function (event) {
      /* Weekday buttons are toggled in place and only saved once the
         pointer leaves the row — picking Mon, Wed and Fri would
         otherwise redraw three times and lose the second two clicks. */
      var dayBtn = event.target.closest('[data-day-toggle]');
      if (dayBtn) {
        dayBtn.classList.toggle('is-on');
        dayBtn.setAttribute('aria-pressed', dayBtn.classList.contains('is-on') ? 'true' : 'false');
        var tuneRow = dayBtn.closest('[data-tune]');
        clearTimeout(tuneRow._timer);
        /* Nothing ticked is not yet an answer either — wait rather than
           saving a schedule that means every day. */
        if (readSchedule(tuneRow).type === 'daily') return;
        tuneRow._timer = setTimeout(function () {
          setSchedule(tuneRow.getAttribute('data-tune'), readSchedule(tuneRow));
        }, 600);
        return;
      }

      var preset = event.target.closest('[data-preset]');
      if (preset) {
        var id = preset.getAttribute('data-preset');
        var existing = find(id);
        if (existing && !existing.archived) {
          remove(id);
        } else {
          addPreset(id);
        }
        return;
      }

      var own = event.target.closest('[data-remove]');
      if (own) return remove(own.getAttribute('data-remove'));

      if (event.target.closest('#picker-more')) {
        showAllPresets = !showAllPresets;
        renderPicker();
      }
    });

    /* Edit mode: the habit editor opens, and the blocks of the dashboard
       can be dragged into a new order. One switch for both, in the top bar
       and again at the bottom of the editor — so finishing never means
       scrolling back up to where it started. */
    var picker = document.getElementById('picker');
    var toggle = document.getElementById('habits-toggle');

    function setEditing(on) {
      if (on) picker.removeAttribute('hidden');
      else picker.setAttribute('hidden', '');
      toggle.textContent = on ? 'Done' : 'Edit';
      document.body.classList.toggle('is-editing', on);
      renderTiles();
      if (typeof onEditMode === 'function') onEditMode(on);
    }

    toggle.addEventListener('click', function () {
      setEditing(picker.hasAttribute('hidden'));
    });

    document.getElementById('picker-done').addEventListener('click', function () {
      setEditing(false);
    });

    document.getElementById('custom-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var error = addCustom(
        document.getElementById('custom-name').value,
        document.getElementById('custom-goal').value,
        document.getElementById('custom-unit').value
      );

      var box = document.getElementById('custom-error');
      box.textContent = error || '';
      if (!error) this.reset();
    });
  }

  return {
    start: start,
    render: render,
    renderTiles: renderTiles,
    glide: glide,
    bump: bump,
    setValue: setValue,
    retune: retune,
    setSchedule: setSchedule,
    valueOf: valueOf,
    all: all,
    active: active,
    find: find,
    streaks: streaks,
    streaksFor: streaksFor,
    occurrences: occurrences,
    rate: rate,
    laggard: laggard,
    completionFor: completionFor,
    countingOn: countingOn,
    levelOn: levelOn,
    metOn: metOn,
    dueOn: dueOn,
    dueToday: dueToday,
    scheduleLabel: scheduleLabel,
    plural: plural,
    shiftDate: shiftDate,
    weekdayOf: weekdayOf,
    mondayOf: mondayOf
  };
})();
