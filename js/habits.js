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

  function todayLog() {
    var log = Storage.load().log;
    var key = Storage.today();
    if (!log[key]) log[key] = {};
    return log[key];
  }

  function valueOf(id) {
    return todayLog()[id] || 0;
  }

  function setValue(id, value) {
    var log = todayLog();
    if (value > 0) {
      log[id] = value;
    } else {
      /* Zero is the default, so storing it would only pad the file. */
      delete log[id];
    }
    Storage.save();
  }

  /* A goal of 1 is the tick-box case: clicking flips it rather than
     counting past the goal. Everything else moves by its step. */
  function bump(id, direction) {
    var habit = find(id);
    if (!habit) return;

    var current = valueOf(id);
    var next;

    if (habit.goal === 1) {
      next = current >= 1 ? 0 : 1;
    } else {
      next = current + habit.step * direction;
    }

    setValue(id, Math.max(0, next));
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

  /* Archived, never deleted: the log is keyed by habit id, and dropping the
     habit would orphan every day it was ever ticked. */
  function remove(id) {
    var habit = find(id);
    if (!habit) return;
    habit.archived = true;
    Storage.save();
    render();
  }

  /* Dates and streaks ------------------------------------------------
     The functions below are pure: everything they need arrives as an
     argument, nothing is read from the DOM or storage. That makes them
     easy to try out on made-up data. Date keys are 'YYYY-MM-DD', which
     compares correctly as plain text, so no Date objects are needed to
     put two days in order. */

  function shiftDate(key, days) {
    var parts = key.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    return Storage.dateKey(date);
  }

  function metOn(log, habit, key) {
    var day = log[key];
    return !!day && (day[habit.id] || 0) >= habit.goal;
  }

  function streaks(log, habit, todayKey) {
    var best = 0;
    var run = 0;
    var guard = 0;

    var key = habit.createdAt && habit.createdAt < todayKey ? habit.createdAt : todayKey;
    while (key <= todayKey && guard++ < 4000) {
      if (metOn(log, habit, key)) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      key = shiftDate(key, 1);
    }

    /* Today only counts once it is actually done. An unfinished today must
       not read as a break, or every morning would announce that the streak
       is over before the day has even started. */
    var cursor = metOn(log, habit, todayKey) ? todayKey : shiftDate(todayKey, -1);
    var current = 0;
    guard = 0;
    while (metOn(log, habit, cursor) && guard++ < 4000) {
      current++;
      cursor = shiftDate(cursor, -1);
    }

    return { current: current, best: best };
  }

  /* How much of that day got done, from 0 to 1, or null when no habit
     existed yet.

     Habits are measured in different units — 20 minutes and 20 pages are
     the same number and nothing alike — so nothing raw can be added up.
     What compares is each habit's progress against its own goal: a share
     with no unit attached. Those shares average cleanly.

     Each one is capped at 1 so that overshooting one habit cannot paper
     over skipping another: drinking sixteen glasses does not make up for
     not reading.

     A habit only counts from the day it was created, so adding one today
     does not retroactively spoil last month. */
  function completionFor(log, habits, key) {
    var eligible = habits.filter(function (h) {
      return !h.archived && (!h.createdAt || h.createdAt <= key);
    });
    if (!eligible.length) return null;

    var day = log[key] || {};
    var total = 0;

    eligible.forEach(function (habit) {
      var value = day[habit.id] || 0;
      total += Math.min(1, value / habit.goal);
    });

    return total / eligible.length;
  }

  /* Three colours: red under 15%, yellow to 60%, green above. One
     definition, used by the month calendar and the history grid alike —
     two copies would drift and the same day would end up a different
     colour in two places.

     Nothing done and 10% done are both red on purpose: at that point the
     day did not happen, and splitting hairs between them would need a
     shade nobody can read off a small square.

     -1 means no habit existed yet, which is not a score at all. */
  function levelOn(log, habits, key) {
    var score = completionFor(log, habits, key);
    if (score === null) return -1;
    if (score < 0.15) return 0;
    if (score < 0.60) return 1;
    return 2;
  }

  function streaksFor(habit) {
    return streaks(Storage.load().log, habit, Storage.today());
  }

  /* Rendering ------------------------------------------------------- */

  function tileHtml(habit) {
    var value = valueOf(habit.id);
    var done = value >= habit.goal;
    var percent = Math.min(100, Math.round((value / habit.goal) * 100));

    var readout = habit.goal === 1
      ? (done ? 'Done' : 'Not yet')
      : '<strong>' + value + '</strong> / ' + habit.goal + ' ' + escapeHtml(habit.unit);

    /* A single day is not a streak worth announcing. */
    var run = streaksFor(habit).current;
    var streak = run >= 2
      ? '<span class="tile__streak">' + run + ' days in a row</span>'
      : '';

    return '' +
      '<button class="tile' + (done ? ' is-done' : '') + '" data-id="' + escapeHtml(habit.id) + '"' +
      ' title="Click to add, right-click to take away">' +
        '<span class="tile__name">' + escapeHtml(habit.name) + '</span>' +
        '<span class="tile__value">' + readout + '</span>' +
        '<span class="tile__bar"><span style="width:' + percent + '%"></span></span>' +
        streak +
      '</button>';
  }

  function renderTiles() {
    var el = document.getElementById('tiles');
    /* The desktop widget loads this file for the logic but draws its own
       compact layout, so the full panel's containers are not there. */
    if (!el) return;

    var list = active();

    if (!list.length) {
      el.innerHTML = '<p class="empty">No habits yet — press “Edit habits” to pick some.</p>';
      return;
    }

    el.innerHTML = list.map(tileHtml).join('');
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

  function renderPicker() {
    var body = document.getElementById('picker-body');
    if (!body) return;

    var groups = PRESETS.map(function (group) {
      return '' +
        '<div class="picker__group">' +
          '<h3 class="picker__heading">' + escapeHtml(group.category) + '</h3>' +
          '<div class="picker__items">' + group.items.map(presetHtml).join('') + '</div>' +
        '</div>';
    }).join('');

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
                  '<input class="input input--tiny" type="number" min="1" step="1"' +
                    ' value="' + h.goal + '" data-goal aria-label="Goal">' +
                  '<input class="input input--unit" type="text"' +
                    ' value="' + escapeHtml(h.unit) + '" data-unit aria-label="Unit">' +
                  '<button class="task__drop" type="button" data-remove="' +
                    escapeHtml(h.id) + '" aria-label="Remove">&#215;</button>' +
                '</div>';
            }).join('') +
          '</div>' +
          '<p class="custom__hint muted">A goal of 1 means yes / no.</p>' +
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

  function start() {
    render();

    var tiles = document.getElementById('tiles');

    tiles.addEventListener('click', function (event) {
      var tile = event.target.closest('.tile');
      if (tile) bump(tile.getAttribute('data-id'), 1);
    });

    /* Undo matters: without it a stray click leaves the day's number wrong
       for good, and wrong data is worse than no data. */
    tiles.addEventListener('contextmenu', function (event) {
      var tile = event.target.closest('.tile');
      if (!tile) return;
      event.preventDefault();
      bump(tile.getAttribute('data-id'), -1);
    });

    /* 'change', not 'input': saving redraws the picker, and redrawing on
       every keystroke would tear the field out from under the cursor. */
    document.getElementById('picker-body').addEventListener('change', function (event) {
      var row = event.target.closest('[data-tune]');
      if (!row) return;

      var error = retune(
        row.getAttribute('data-tune'),
        row.querySelector('[data-goal]').value,
        row.querySelector('[data-unit]').value
      );

      if (error) {
        /* The redraw did not happen, so the box is still on screen. */
        var box = document.getElementById('tune-error');
        if (box) box.textContent = error;
      }
    });

    document.getElementById('picker-body').addEventListener('click', function (event) {
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
      if (own) remove(own.getAttribute('data-remove'));
    });

    var picker = document.getElementById('picker');
    document.getElementById('habits-toggle').addEventListener('click', function () {
      var open = picker.hasAttribute('hidden');
      if (open) {
        picker.removeAttribute('hidden');
      } else {
        picker.setAttribute('hidden', '');
      }
      this.textContent = open ? 'Done editing' : 'Edit habits';
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
    bump: bump,
    retune: retune,
    valueOf: valueOf,
    active: active,
    streaks: streaks,
    streaksFor: streaksFor,
    completionFor: completionFor,
    levelOn: levelOn,
    metOn: metOn,
    shiftDate: shiftDate
  };
})();
