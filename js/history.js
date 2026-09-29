/* History: the ten-week grid, the numbers above it, and the two backup
   buttons. All of the arithmetic lives in habits.js — this file only turns
   it into markup.

   Named HistoryView rather than History: a global called History would
   shadow the browser's own window.History. */

var HistoryView = (function () {
  /* Roughly nine months. The cells are capped in CSS, so this is what
     fills a wide card without turning into a wall of blocks. */
  var WEEKS = 40;

  function startOfWeek(date) {
    /* getDay() calls Sunday 0; shift so the week starts on Monday. */
    var shift = (date.getDay() + 6) % 7;
    var start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(date.getDate() - shift);
    return start;
  }

  function renderGrid() {
    var state = Storage.load();
    var todayKey = Storage.today();

    var cursor = startOfWeek(new Date());
    cursor.setDate(cursor.getDate() - (WEEKS - 1) * 7);

    var cells = [];
    for (var i = 0; i < WEEKS * 7; i++) {
      var key = Storage.dateKey(cursor);
      var html;

      if (key > todayKey) {
        html = '<span class="cell cell--future" title="' + key + '"></span>';
      } else {
        var level = Habits.levelOn(state.log, state.habits, key);
        var ratio = Habits.completionFor(state.log, state.habits, key);
        var label = !Storage.known(state.log, key)
          ? key + ': never filled in'
          : ratio === null
            ? key + ': no habits yet'
            : key + ': ' + Math.round(ratio * 100) + '% done';
        html = '<span class="cell" data-level="' + level + '" title="' + label + '"></span>';
      }

      cells.push(html);
      cursor.setDate(cursor.getDate() + 1);
    }

    return '' +
      '<div class="grid">' + cells.join('') + '</div>' +
      '<div class="legend">' +
        '<span class="cell" data-level="0"></span><span class="muted">under 15%</span>' +
        '<span class="legend__gap"></span>' +
        '<span class="cell" data-level="1"></span><span class="muted">to 65%</span>' +
        '<span class="legend__gap"></span>' +
        '<span class="cell" data-level="2"></span><span class="muted">65% and up</span>' +
      '</div>';
  }

  function statHtml(label, value, note, percent) {
    var bar = typeof percent === 'number'
      ? '<span class="stat__bar"><span style="width:' + percent + '%"></span></span>'
      : '';
    return '' +
      '<div class="stat">' +
        '<p class="stat__label">' + label + '</p>' +
        '<p class="stat__value">' + value + '</p>' +
        (note ? '<p class="stat__note muted">' + note + '</p>' : '') +
        bar +
      '</div>';
  }

  function topStreak(habits, log, todayKey, which) {
    var top = { count: 0, name: null };
    habits.forEach(function (habit) {
      var run = Habits.streaks(log, habit, todayKey)[which];
      if (run > top.count) top = { count: run, name: habit.name };
    });
    return top;
  }

  function monthPercent(state, todayKey) {
    var parts = todayKey.split('-');
    var total = 0;
    var counted = 0;

    for (var day = 1; day <= Number(parts[2]); day++) {
      var key = parts[0] + '-' + parts[1] + '-' + (day < 10 ? '0' + day : day);
      if (!Storage.known(state.log, key)) continue;
      var ratio = Habits.completionFor(state.log, state.habits, key);
      if (ratio !== null) {
        total += ratio;
        counted++;
      }
    }

    return counted ? Math.round((total / counted) * 100) : null;
  }

  function days(n) {
    return n + (n === 1 ? ' day' : ' days');
  }

  function renderStats() {
    var state = Storage.load();
    var todayKey = Storage.today();
    var live = Habits.active();

    var current = topStreak(live, state.log, todayKey, 'current');
    var best = topStreak(live, state.log, todayKey, 'best');
    var month = monthPercent(state, todayKey);

    /* The year card lives on the dashboard now, so it is not repeated here. */
    return '' +
      statHtml('Current streak',
        current.count ? days(current.count) : 'none',
        current.name || 'nothing running yet') +
      statHtml('Best streak',
        best.count ? days(best.count) : 'none',
        best.name || 'no history yet') +
      statHtml('This month',
        month === null ? 'no data' : month + '%',
        'of habits completed',
        month === null ? undefined : month);
  }

  function render() {
    var wrap = document.getElementById('history');

    if (!Habits.active().length) {
      wrap.innerHTML = '<p class="empty">Pick some habits and this fills in as you log days.</p>';
      return;
    }

    wrap.innerHTML =
      '<div class="stats">' + renderStats() + '</div>' +
      renderGrid();
  }

  function start() {
    render();

    document.getElementById('export-btn').addEventListener('click', function () {
      Storage.exportToFile();
    });

    var file = document.getElementById('import-file');

    document.getElementById('import-btn').addEventListener('click', function () {
      file.click();
    });

    file.addEventListener('change', function () {
      var chosen = this.files[0];

      /* Cleared right away so that picking the same file twice still fires
         a change event. */
      this.value = '';
      if (!chosen) return;

      var reader = new FileReader();
      reader.onload = function () {
        /* Importing replaces everything, so it asks first. */
        if (!window.confirm('Replace everything on this panel with the contents of ' + chosen.name + '?')) {
          return;
        }

        var error = Storage.importFromText(reader.result);
        if (error) {
          window.alert(error);
          return;
        }

        Habits.render();
        render();
      };
      reader.readAsText(chosen);
    });
  }

  return {
    start: start,
    render: render
  };
})();
