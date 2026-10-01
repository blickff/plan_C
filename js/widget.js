/* The desktop widget. Same data and same logic as the panel — it loads
   storage.js and habits.js — but its own drawing.

   It runs in a second window over the same origin as the panel, so both
   read one localStorage. The browser fires a `storage` event in every
   other window of an origin when one of them writes, which is how the
   two stay in step without either knowing the other exists — and how a
   face chosen in the panel's Settings reaches the widget at once.

   Six faces, each one section of the app, or none of it:

     Clock   just a clock. Dials with hands — minimal, classic, roman,
             modern, and mono (black, white and grey only) — or digits:
             digital, stack, and ring (the time inside a ring that fills
             as the day's habits are done).
     Today   the habits to do today, each one pressed to count.
     Week    the streak beside the last seven days, one bar a day.
     Plans   today's tasks, ticked off here, and what is coming up.
     Note    what was written today.
     Money   this month's spending against last month's, and the months
             before it.

   The clock and the section are two separate choices: a clock alone, a
   section alone, or the clock above the section.

   Settings → Desktop widget also chooses the accent colour (the second
   hand, the light behind the face), whether the clock has a second hand and shows the
   date, and the backdrop: lit by the accent, or plain.

   The match stays in the panel: the owner did not want it on the desktop. */

var Widget = (function () {

  var SECTIONS = ['none', 'today', 'week', 'plans', 'note', 'money'];
  var ANALOG = ['minimal', 'classic', 'roman', 'modern', 'mono'];
  var DIALS = ANALOG.concat(['digital', 'stack', 'ring']);
  var ACCENTS = ['orange', 'amber', 'red', 'green', 'blue', 'violet', 'ink'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* What the person chose, with the defaults filled in. Two separate
     choices: a clock, on or off; and a section of the app — or none, for
     a clock alone. One of the two is always on. Older settings said it as
     one "face" plus "clock on top"; those are read as what they meant. */
  function choice() {
    var w = Storage.load().settings.widget || {};
    var section;
    var clock;
    if (w.section !== undefined || w.clock !== undefined) {
      section = SECTIONS.indexOf(w.section) !== -1 ? w.section : 'none';
      clock = w.clock === true;
    } else {
      section = w.face === 'clock' ? 'none' : (SECTIONS.indexOf(w.face) !== -1 ? w.face : 'today');
      clock = w.face === 'clock' || w.clockOnTop === true;
    }
    if (section === 'none') clock = true;
    return { section: section, clock: clock };
  }

  function prefs() {
    var w = Storage.load().settings.widget || {};
    var c = choice();
    return {
      /* face: what fills the window — the clock when there is no section. */
      face: c.section === 'none' ? 'clock' : c.section,
      clockOnTop: c.clock && c.section !== 'none',
      dial: DIALS.indexOf(w.dial) !== -1 ? w.dial : 'classic',
      accent: ACCENTS.indexOf(w.accent) !== -1 ? w.accent : 'orange',
      seconds: w.seconds !== false,
      date: w.date !== false,
      weather: w.weather !== false,
      /* small, medium or large: the whole widget scaled, text and all. */
      size: w.size === 'small' || w.size === 'large' ? w.size : 'medium',
      backdrop: w.backdrop === 'plain' ? 'plain' : 'glow'
    };
  }

  /* The shape of window a face is drawn for. The clock's depends on the
     dial: a round one wants a square, a row of digits a wide strip. */
  function clockShape(p) {
    if (p.dial === 'digital') return 'clock-digital';
    if (p.dial === 'stack') return 'clock-stack';
    return 'clock-round';
  }

  function hasClock(p) { return p.face === 'clock' || p.clockOnTop; }

  /* The widget follows the panel's theme: the setting, or the clock when
     the setting says to follow it. */
  function applyTheme() {
    var choice = Storage.load().settings.theme || 'auto';
    var hour = new Date().getHours();
    var theme = choice === 'auto'
      ? (hour >= 7 && hour < 19 ? 'light' : 'dark')
      : choice;
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* The pieces the faces draw from -------------------------------------- */

  function dueToday() {
    var log = Storage.load().log;
    var key = Storage.today();
    return Habits.active().filter(function (h) { return Habits.dueOn(log, h, key); });
  }

  function todayScore() {
    var s = Storage.load();
    var score = Habits.completionFor(s.log, s.habits, Storage.today());
    return score === null ? 0 : Math.round(score * 100);
  }

  /* The habit with the longest run going. */
  function leadHabit() {
    var log = Storage.load().log;
    var todayKey = Storage.today();
    var lead = null;
    Habits.active().forEach(function (habit) {
      var run = Habits.streaks(log, habit, todayKey);
      if (!lead || run.current > lead.run) lead = { habit: habit, run: run.current, unit: run.unit };
    });
    return lead;
  }

  function streakHtml(cls) {
    var lead = leadHabit();
    var run = lead ? lead.run : 0;
    var unit = (lead ? lead.unit : 'day') + (run === 1 ? '' : 's');
    return {
      num: '<p class="' + cls + '"><b>' + run + '</b> <span>' + unit + '</span></p>',
      label: lead ? 'Streak · ' + lead.habit.name : 'No habits yet'
    };
  }

  /* The last seven days, today last: each day's share done and its level,
     the same colours as the calendar. */
  function lastWeek() {
    var s = Storage.load();
    var todayKey = Storage.today();
    var narrow = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' });
    var out = [];
    for (var back = 6; back >= 0; back--) {
      var key = Habits.shiftDate(todayKey, -back);
      var p = key.split('-');
      var date = new Date(+p[0], +p[1] - 1, +p[2]);
      var score = Storage.known(s.log, key) ? Habits.completionFor(s.log, s.habits, key) : null;
      out.push({
        key: key,
        letter: narrow.format(date),
        share: score === null ? null : Math.max(0, Math.min(1, score)),
        level: Habits.levelOn(s.log, s.habits, key),
        today: back === 0
      });
    }
    return out;
  }

  function weekStrip(cls) {
    return '<div class="wgw ' + cls + '">' + lastWeek().map(function (d) {
      var h = d.share === null ? 0 : Math.max(0.08, d.share);
      return '<div class="wgw__day' + (d.today ? ' is-today' : '') + '" title="' + d.key +
          (d.share === null ? '' : ' · ' + Math.round(d.share * 100) + '% done') + '">' +
        '<span class="wgw__col"><span class="wgw__fill"' + (d.level < 0 ? '' : ' data-level="' + d.level + '"') +
          ' style="height:' + Math.round(h * 100) + '%"></span></span>' +
        '<span class="wgw__letter">' + escapeHtml(d.letter) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* Today ---------------------------------------------------------------- */

  var TICK = '<svg class="wgh__tick" viewBox="0 0 16 16" aria-label="done"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  /* Which habits were finished at the last drawing, so the one that has
     just been finished can be told apart from those done earlier. */
  var finished = {};

  function faceToday() {
    var log = Storage.load().log;
    var key = Storage.today();
    var habits = Habits.active().sort(function (a, b) {
      return (Habits.dueOn(log, b, key) ? 1 : 0) - (Habits.dueOn(log, a, key) ? 1 : 0);
    });

    var rows = habits.length ? habits.map(function (h) {
      var value = Habits.valueOf(h.id);
      var done = value >= h.goal;
      var width = Math.min(100, Math.round((value / h.goal) * 100));
      var readout = done ? TICK
        : h.goal === 1 ? '—'
        : escapeHtml(value + '/' + h.goal + (h.unit ? ' ' + h.unit : ''));
      /* Finished just now, by a click here or in the panel: lit once. */
      var fresh = done && finished[h.id] === false;
      finished[h.id] = done;
      return '<button class="wgh' + (done ? ' is-done' : '') + (fresh ? ' is-fresh' : '') + (Habits.dueOn(log, h, key) ? '' : ' is-off') + '"' +
        ' type="button" data-bump="' + escapeHtml(h.id) + '" title="Click to add, right-click to take away">' +
        '<span class="wgh__name">' + escapeHtml(h.name) + '</span>' +
        '<span class="wgh__value">' + readout + '</span>' +
        '<span class="wgh__bar"><span style="width:' + width + '%"></span></span>' +
      '</button>';
    }).join('') : '<p class="wg__empty">No habits yet — open the panel to pick some.</p>';

    /* One line above the habits: how today stands, and the streak. It
       used to be a card with a big number and a ring, and a strip of the
       week under it — most of the widget's height for three facts. */
    var due = habits.filter(function (h) { return Habits.dueOn(log, h, key); });
    var done = due.filter(function (h) { return Habits.valueOf(h.id) >= h.goal; }).length;
    var lead = leadHabit();
    var run = lead && lead.run > 0
      ? lead.run + '-' + lead.unit + ' streak'
      : '';

    return '' +
      '<div class="wgt">' +
        '<p class="wgt__line">' +
          '<b>Today</b>' +
          '<span>' + (due.length ? done + ' of ' + due.length + ' done' : 'nothing due') + '</span>' +
          (run ? '<em title="' + escapeHtml(lead.habit.name) + '">' + run + '</em>' : '') +
        '</p>' +
        '<div class="wgt__list" id="wg-list">' + rows + '</div>' +
      '</div>';
  }

  /* Week ----------------------------------------------------------------- */

  function faceWeek() {
    var streak = streakHtml('wgk__num');
    var week = lastWeek();
    var known = week.filter(function (d) { return d.share !== null; });
    var avg = known.length
      ? Math.round(known.reduce(function (a, d) { return a + d.share; }, 0) / known.length * 100)
      : null;
    return '' +
      '<div class="wgk">' +
        '<div class="wgk__left">' + streak.num +
          '<p class="wgk__label">' + escapeHtml(streak.label) + '</p>' +
          '<p class="wgk__avg">' + (avg === null ? '' : '<b>' + avg + '%</b> a day on average') + '</p>' +
        '</div>' +
        '<div class="wgk__right">' + weekStrip('wgk__week') + '</div>' +
      '</div>';
  }

  /* Plans: today's tasks and what is coming up ----------------------------- */

  function whenLabel(key, todayKey) {
    var a = key.split('-');
    var b = todayKey.split('-');
    var days = Math.round((new Date(+a[0], +a[1] - 1, +a[2]) - new Date(+b[0], +b[1] - 1, +b[2])) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return 'in ' + days + ' days';
  }

  function facePlans() {
    var s = Storage.load();
    var todayKey = Storage.today();
    var tasks = (s.tasks || []).filter(function (t) { return t.date === todayKey; });
    var events = (s.countdowns || [])
      .filter(function (c) { return c.date >= todayKey; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
      .slice(0, 3);
    var done = tasks.filter(function (t) { return t.done; }).length;

    var list = tasks.length ? tasks.map(function (t) {
      return '<button class="wgp__task' + (t.done ? ' is-done' : '') + '" type="button" data-task="' + escapeHtml(t.id) + '">' +
        '<span class="wgp__check" aria-hidden="true"></span>' +
        '<span class="wgp__text">' + escapeHtml(t.text) + '</span>' +
      '</button>';
    }).join('') : '<p class="wgp__none">Nothing planned for today.</p>';

    var coming = events.length ? '<p class="wgp__sub">Coming up</p>' + events.map(function (c) {
      return '<div class="wgp__event"><span class="wgp__what">' + escapeHtml(c.title) + '</span>' +
        '<span class="wgp__when">' + whenLabel(c.date, todayKey) + '</span></div>';
    }).join('') : '';

    return '' +
      '<div class="wgp">' +
        '<p class="wgp__title">Today' + (tasks.length ? ' <span>' + done + ' of ' + tasks.length + ' done</span>' : '') + '</p>' +
        '<div class="wgp__list" id="wg-list">' + list + '</div>' +
        coming +
      '</div>';
  }

  /* Note ------------------------------------------------------------------ */

  function faceNote() {
    var s = Storage.load();
    var todayKey = Storage.today();
    var text = (s.notes[todayKey] || '').trim();
    var label = 'Today';
    if (!text) {
      var keys = Object.keys(s.notes).filter(function (k) { return (s.notes[k] || '').trim(); }).sort();
      var last = keys[keys.length - 1];
      if (last) {
        var p = last.split('-');
        var d = new Date(+p[0], +p[1] - 1, +p[2]);
        text = s.notes[last].trim();
        label = DAYS[d.getDay()] + ', ' + SHORT[d.getMonth()] + ' ' + d.getDate();
      }
    }
    return '' +
      '<div class="wgn">' +
        '<p class="wgn__label">' + (text ? 'Note · ' + escapeHtml(label) : 'Note') + '</p>' +
        (text
          ? '<p class="wgn__text" id="wg-list">' + escapeHtml(text) + '</p>'
          : '<p class="wgn__none">Nothing written yet. The note box is at the bottom of the dashboard.</p>') +
      '</div>';
  }

  /* The clock -------------------------------------------------------------- */

  var ROMAN = { 12: 'XII', 3: 'III', 6: 'VI', 9: 'IX' };

  function at(radius, degrees) {
    var a = degrees * Math.PI / 180;
    return { x: (50 + radius * Math.sin(a)).toFixed(2), y: (50 - radius * Math.cos(a)).toFixed(2) };
  }

  /* A dial with hands. Five styles, as watches come:
       minimal  ticks only, bold at the hours
       classic  the numbers 1–12 and a fine minute track
       roman    XII, III, VI, IX in a serif, batons between
       modern   dots for the hours, rounded hands, nothing else
       mono     black, white and grey only: a hairline ring, twelve
                short marks, plain hands, no accent and no glow
     Each hand sits in its own group so it can be turned alone. */
  function analog(kind, withDate) {
    var marks = '';
    var i;
    var a;
    var b;

    if (kind === 'mono') {
      for (i = 0; i < 12; i++) {
        a = at(i % 3 === 0 ? 41 : 43, i * 30);
        b = at(46, i * 30);
        marks += '<line class="wgc__tick' + (i % 3 === 0 ? ' is-major' : '') + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      }
    } else if (kind === 'modern') {
      for (i = 0; i < 12; i++) {
        a = at(41, i * 30);
        marks += '<circle class="wgc__dot' + (i % 3 === 0 ? ' is-major' : '') + '" cx="' + a.x + '" cy="' + a.y + '" r="' + (i % 3 === 0 ? 2.1 : 1.2) + '"/>';
      }
    } else {
      for (i = 0; i < 60; i++) {
        var major = i % 5 === 0;
        var quarter = i % 15 === 0;
        if (kind === 'roman' && quarter) continue;          // a numeral sits there
        if (kind === 'roman' && !major) continue;           // batons only
        var inner = kind === 'classic' ? (major ? 44 : 45.2)
          : kind === 'roman' ? 39
          : (major ? 38.5 : 44);
        a = at(inner, i * 6);
        b = at(46.5, i * 6);
        marks += '<line class="wgc__tick' + (major ? ' is-major' : '') + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      }
    }

    var numbers = '';
    if (kind === 'classic') {
      for (i = 1; i <= 12; i++) {
        a = at(35.5, i * 30);
        numbers += '<text class="wgc__numeral" x="' + a.x + '" y="' + (+a.y + 3.6).toFixed(2) + '">' + i + '</text>';
      }
    } else if (kind === 'roman') {
      [12, 3, 6, 9].forEach(function (h) {
        a = at(37, h * 30);
        numbers += '<text class="wgc__numeral is-roman" x="' + a.x + '" y="' + (+a.y + 4).toFixed(2) + '">' + ROMAN[h] + '</text>';
      });
    }

    var hour;
    var minute;
    if (kind === 'classic') {
      hour = '<path class="wgc__hand is-h" d="M48.3 55 L49.1 28 L50 25.5 L50.9 28 L51.7 55 Z"/>';
      minute = '<path class="wgc__hand is-m" d="M48.8 56 L49.4 13 L50 10.5 L50.6 13 L51.2 56 Z"/>';
    } else if (kind === 'roman') {
      hour = '<path class="wgc__hand is-h" d="M50 56 L48.2 50 L50 26 L51.8 50 Z"/>';
      minute = '<path class="wgc__hand is-m" d="M50 57 L48.7 50 L50 11 L51.3 50 Z"/>';
    } else {
      var fromCentre = kind === 'modern' || kind === 'mono';
      hour = '<line class="wgc__hand is-h" x1="50" y1="' + (fromCentre ? 50 : 54) + '" x2="50" y2="28"/>';
      minute = '<line class="wgc__hand is-m" x1="50" y1="' + (fromCentre ? 50 : 55) + '" x2="50" y2="' + (kind === 'modern' ? 14 : kind === 'mono' ? 12.5 : 11.5) + '"/>';
    }

    /* The date, as a watch carries it: a small window in the lower half. */
    var date = withDate
      ? '<g class="wgc__datewin"><rect x="38.5" y="63.5" width="23" height="9" rx="2.4"/>' +
        '<text x="50" y="70.2" data-date></text></g>'
      : '';

    return '' +
      '<svg class="wgc__dial wgc__dial--' + kind + '" viewBox="0 0 100 100" aria-hidden="true">' +
        '<circle class="wgc__face" cx="50" cy="50" r="48.5"/>' +
        marks + numbers + date +
        '<g class="wgc__turn" data-hand="h">' + hour + '</g>' +
        '<g class="wgc__turn" data-hand="m">' + minute + '</g>' +
        '<g class="wgc__turn wgc__sec" data-hand="s">' +
          '<line class="wgc__hand is-s" x1="50" y1="60" x2="50" y2="9"/>' +
          '<circle class="wgc__sectip" cx="50" cy="60" r="1.7"/>' +
        '</g>' +
        '<circle class="wgc__pin" cx="50" cy="50" r="2.3"/>' +
      '</svg>';
  }

  function faceClock(p) {
    var longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

    if (p.dial === 'digital') {
      return '' +
        '<div class="wgc wgc--digital">' +
          '<p class="wgc__time" data-time></p>' +
          (p.date ? '<p class="wgc__date">' + escapeHtml(longDate) + '</p>' : '') +
        '</div>';
    }

    if (p.dial === 'stack') {
      return '' +
        '<div class="wgc wgc--stack">' +
          '<p class="wgc__hh" data-hh></p>' +
          '<p class="wgc__mm" data-mm></p>' +
          (p.date ? '<p class="wgc__date" data-date></p>' : '') +
        '</div>';
    }

    if (p.dial === 'ring') {
      var pct = todayScore();
      return '' +
        '<div class="wgc wgc--round">' +
          '<div class="wgc__ringwrap" style="--ring-p:' + pct + '" title="Today: ' + pct + '% of your habits done">' +
            '<p class="wgc__time" data-time></p>' +
            '<p class="wgc__ringpct">' + (p.date ? '<span data-date></span> · ' : '') + pct + '% done</p>' +
          '</div>' +
        '</div>';
    }

    return '' +
      '<div class="wgc wgc--round' + (p.seconds ? '' : ' no-seconds') + '">' +
        analog(p.dial, p.date) +
      '</div>';
  }

  /* The hands and the digits move on their own, apart from the minute
     redraw: smoothly with motion on (the second hand sweeps), a tick a
     second with it off. */
  var clockTimer = null;
  var clockFrame = 0;

  function tickClock() {
    var face = document.getElementById('wg-face');
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var s = now.getSeconds() + now.getMilliseconds() / 1000;
    var smooth = typeof Motion === 'undefined' || Motion.on();
    var sec = smooth ? s : Math.floor(s);
    var turns = {
      h: ((h % 12) + m / 60 + sec / 3600) * 30,
      m: (m + sec / 60) * 6,
      s: sec * 6
    };
    face.querySelectorAll('.wgc__turn').forEach(function (g) {
      g.setAttribute('transform', 'rotate(' + turns[g.getAttribute('data-hand')].toFixed(2) + ' 50 50)');
    });
    var hh = ('0' + h).slice(-2);
    var mm = ('0' + m).slice(-2);
    var day = DAYS[now.getDay()].toUpperCase() + ' ' + now.getDate();
    function put(sel, text) {
      face.querySelectorAll(sel).forEach(function (el) { if (el.textContent !== text) el.textContent = text; });
    }
    put('[data-time]', hh + ':' + mm);
    put('[data-hh]', hh);
    put('[data-mm]', mm);
    put('[data-date]', day);
  }

  function runClock(on, sweeping) {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    cancelAnimationFrame(clockFrame);
    if (!on) return;
    tickClock();
    var smooth = typeof Motion === 'undefined' || Motion.on();
    if (sweeping && smooth) {
      (function loop() {
        tickClock();
        clockFrame = requestAnimationFrame(loop);
      })();
    } else {
      clockTimer = setInterval(tickClock, sweeping ? 1000 : 5000);
    }
  }

  /* Money ------------------------------------------------------------ */

  function formatMoney(cents) {
    var cur = (Storage.load().money || {}).currency || 'EUR';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol'
      }).format(cents / 100);
    } catch (err) {
      return (cents / 100).toFixed(2) + ' ' + cur;
    }
  }

  function sumBetween(from, to) {
    var total = 0;
    ((Storage.load().money || {}).entries || []).forEach(function (e) {
      if (e.date >= from && e.date <= to) total += e.cents;
    });
    return total;
  }

  function keyOf(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function faceMoney() {
    var today = new Date();
    var y = today.getFullYear();
    var m = today.getMonth();
    var todayKey = keyOf(today);
    var thisMonth = sumBetween(keyOf(new Date(y, m, 1)), todayKey);
    /* Last month up to the same date, so a month under way is not set
       against a whole one. */
    var lastEnd = new Date(y, m, 0);
    var lastSame = sumBetween(keyOf(new Date(y, m - 1, 1)),
      keyOf(new Date(y, m - 1, Math.min(today.getDate(), lastEnd.getDate()))));
    var spentToday = sumBetween(todayKey, todayKey);

    var cmp = '';
    if (lastSame > 0) {
      var ch = Math.round(((thisMonth - lastSame) / lastSame) * 100);
      cmp = (ch > 0 ? '&#8593; ' : ch < 0 ? '&#8595; ' : '') + Math.abs(ch) + '% ' +
        (ch >= 0 ? 'more' : 'less') + ' than ' + SHORT[(m + 11) % 12] + ' by this date';
    }

    var bars = [];
    for (var k = 5; k >= 0; k--) {
      var start = new Date(y, m - k, 1);
      var end = new Date(y, m - k + 1, 0);
      bars.push({ label: SHORT[start.getMonth()], cents: sumBetween(keyOf(start), keyOf(end)), now: k === 0 });
    }
    var max = Math.max.apply(null, bars.map(function (b) { return b.cents; })) || 1;

    return '' +
      '<div class="wgy">' +
        '<p class="wgy__label">Spent in ' + MONTHS[m] + '</p>' +
        '<p class="wgy__total">' + escapeHtml(formatMoney(thisMonth)) + '</p>' +
        '<p class="wgy__cmp">' + (cmp || 'Nothing to compare with yet') + '</p>' +
        '<div class="wgy__bars">' + bars.map(function (b) {
          return '<div class="wgy__bar' + (b.now ? ' is-now' : '') + '" title="' + b.label + ' · ' + escapeHtml(formatMoney(b.cents)) + '">' +
            '<span class="wgy__col"><span style="height:' + Math.max(b.cents ? 4 : 0, Math.round((b.cents / max) * 100)) + '%"></span></span>' +
            '<span class="wgy__tick">' + b.label + '</span>' +
          '</div>';
        }).join('') + '</div>' +
        '<p class="wgy__today">Today <b>' + escapeHtml(formatMoney(spentToday)) + '</b></p>' +
      '</div>';
  }

  /* Drawing ------------------------------------------------------------ */

  /* The top line: the date and the weather. The date is left out when a
     clock on the widget is already showing it — it was there twice — and
     the weather can be turned off. With neither, the line takes no room:
     its buttons float over the top of the widget instead. */
  function renderBar(p) {
    var clockShowsDate = hasClock(p) && p.date;
    var dateEl = document.getElementById('wg-date');
    /* Its own element, not the one weather.js writes into: that module
       would put its own line there, place name and all, whether or not
       the weather is wanted on the widget. It still fetches; this reads
       what it stored. */
    var weatherEl = document.getElementById('wg-weather');

    dateEl.textContent = clockShowsDate ? '' : new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }).format(new Date());

    var w = Storage.load().settings.weather;
    weatherEl.textContent = p.weather && w && typeof Weather !== 'undefined'
      ? Math.round(w.temp) + '° ' + Weather.describe(w.code)
      : '';

    /* The dot between the two belongs only where both are there. */
    weatherEl.classList.toggle('is-alone', !dateEl.textContent);
    return !!(dateEl.textContent || weatherEl.textContent);
  }

  /* How big the window should be ------------------------------------------

     The widget is as wide as its face needs and exactly as tall as what
     is in it: one habit makes a small widget, five a taller one. Past a
     limit the list scrolls instead of the window growing down the screen.
     A clock alone has a shape of its own.

     No shape is allowed to get extreme: never lower than about two thirds
     of its width (one habit made a thin strip, a digital clock a wide
     band), never smaller than SMALLEST and never taller than TALLEST. */
  var WIDTH = { today: 280, plans: 280, note: 280, money: 300, week: 350 };
  var CLOCK_ALONE = { 'clock-round': [230, 230], 'clock-digital': [260, 190], 'clock-stack': [200, 240] };
  var SMALLEST = 170;
  var TALLEST = 540;
  var FLATTEST = 0.66;

  function shape(w, h) {
    return { w: w, h: Math.min(TALLEST, Math.max(SMALLEST, Math.round(w * FLATTEST), h)) };
  }
  var SCALE = { small: 0.85, medium: 1, large: 1.2 };
  var lastSize = '';
  var size = { w: 280, h: 300 };

  function measure(p, root) {
    if (p.face === 'clock') {
      var fixed = CLOCK_ALONE[clockShape(p)];
      return shape(fixed[0], fixed[1]);
    }
    var w = WIDTH[p.face] || 280;
    /* Let it take the height it wants, at the width it will have, and
       read that. Nothing is painted in between. */
    root.classList.add('is-measuring');
    root.style.width = w + 'px';
    /* offsetHeight: the laid-out height, whatever scale it is shown at. */
    var h = root.offsetHeight + 1;
    root.style.width = '';
    root.classList.remove('is-measuring');
    return shape(w, h);
  }

  function render() {
    applyTheme();

    var p = prefs();
    var root = document.getElementById('wg');
    var face = document.getElementById('wg-face');
    var barHasText = renderBar(p);

    var combined = p.face !== 'clock' && p.clockOnTop;
    root.className = 'wg wg--' + p.face + ' wg--' + p.backdrop + ' wg--accent-' + p.accent +
      (hasClock(p) ? ' wg--dial-' + p.dial : '') +
      (combined ? ' wg--combined wg--with-' + clockShape(p) : '') +
      (barHasText && p.face !== 'clock' ? '' : ' wg--nobar');

    var body = p.face === 'week' ? faceWeek()
      : p.face === 'plans' ? facePlans()
      : p.face === 'note' ? faceNote()
      : p.face === 'clock' ? faceClock(p)
      : p.face === 'money' ? faceMoney()
      : faceToday();

    /* Combined: the clock in a band of its own across the top, the chosen
       face below it. */
    face.innerHTML = combined
      ? '<div class="wg__clockband">' + faceClock(p) + '</div><div class="wg__under">' + body + '</div>'
      : body;

    runClock(hasClock(p), ANALOG.indexOf(p.dial) !== -1 && p.seconds);

    /* The window follows the content: the desktop app is told the size,
       and the scale chosen in Settings, whenever either changes. */
    size = measure(p, root);
    var zoom = SCALE[p.size];
    var key = size.w + 'x' + size.h + '@' + zoom;
    if (key !== lastSize) {
      lastSize = key;
      if (window.desktop && window.desktop.setWidgetSize) window.desktop.setWidgetSize(size.w, size.h, zoom);
    }

    fadeList();
    tellTray(todayScore());
  }

  /* A list fades out at the bottom only when something is really hidden
     below. */
  function fadeList() {
    var list = document.getElementById('wg-list');
    if (list) list.classList.toggle('is-scrollable', list.scrollHeight > list.clientHeight + 1);
  }

  /* The reminder ---------------------------------------------------

     One nudge a day, at the hour chosen, and only if the day is actually
     unfinished when it comes. It lives in the widget because the widget
     is the window that stays open. */
  function checkReminder() {
    if (!window.desktop || !window.desktop.notify) return;

    var settings = Storage.load().settings;
    var plan = settings.reminder;
    if (!plan || !plan.on) return;

    var todayKey = Storage.today();
    if (plan.sent === todayKey) return;
    if (Storage.clock() < (plan.at || '21:00')) return;

    var left = dueToday().filter(function (h) { return Habits.valueOf(h.id) < h.goal; });

    plan.sent = todayKey;
    Storage.save();
    if (!left.length) return;

    var names = left.slice(0, 3).map(function (h) { return h.name; }).join(', ');
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

  /* Pinned or not, as the desktop app says: pinned, the widget cannot be
     dragged, and its own hide and move controls are gone. */
  function setPinned(on) {
    document.body.classList.toggle('is-pinned', !!on);
    var pin = document.getElementById('wg-pin');
    if (pin) {
      pin.classList.toggle('is-on', !!on);
      pin.title = on
        ? 'Pinned to the desktop. Press to unpin — then it can be moved.'
        : 'Pin to the desktop: it stays where it is, behind your windows';
    }
  }

  /* habits.js calls repaint() after a tick. */
  window.repaint = render;

  function start() {
    if (typeof Motion !== 'undefined') Motion.apply();
    render();

    Storage.adoptVault(function (adopted) {
      if (adopted) render();
    });

    if (Storage.load().settings.place) Weather.start();

    var root = document.getElementById('wg');

    root.addEventListener('click', function (event) {
      var b = event.target.closest('[data-bump]');
      if (b) { Habits.bump(b.getAttribute('data-bump'), 1); return; }

      /* A task ticked off here is ticked off in the panel too: it is the
         same list. */
      var t = event.target.closest('[data-task]');
      if (t) {
        var id = t.getAttribute('data-task');
        (Storage.load().tasks || []).forEach(function (task) {
          if (task.id === id) task.done = !task.done;
        });
        Storage.save();
        render();
      }
    });

    root.addEventListener('contextmenu', function (event) {
      var b = event.target.closest('[data-bump]');
      if (!b) return;
      event.preventDefault();
      Habits.bump(b.getAttribute('data-bump'), -1);
    });

    /* Another window of this origin wrote to storage — most likely the
       panel, perhaps with a new face. Redraw. */
    window.addEventListener('storage', function (event) {
      if (event.key === 'dayPanel') {
        Storage.reload();
        if (typeof Motion !== 'undefined') Motion.apply();
        render();
      }
    });

    window.addEventListener('resize', fadeList);
    /* The window was given its size a moment after the page asked; what
       fits in it may have changed. */
    window.addEventListener('resize', function () { setTimeout(fadeList, 60); });

    /* Rolls over at midnight without a restart, and is the heartbeat the
       reminder rides on. */
    setInterval(function () {
      render();
      checkReminder();
    }, 60 * 1000);

    checkReminder();

    if (!window.desktop) return;

    UpdateUI.start({ buttons: [document.getElementById('wg-update')] });

    /* Pinned, a double-click anywhere opens the panel — there is nothing
       to drag, so the gesture is free. */
    root.addEventListener('dblclick', function (event) {
      if (document.body.classList.contains('is-pinned') && !event.target.closest('button')) {
        window.desktop.openPanel();
      }
    });

    document.getElementById('wg-open').addEventListener('click', function () {
      window.desktop.openPanel();
    });

    document.getElementById('wg-hide').addEventListener('click', function () {
      window.desktop.hideWidget();
    });

    document.getElementById('wg-pin').addEventListener('click', function () {
      window.desktop.togglePinned().then(setPinned);
    });

    var topBtn = document.getElementById('wg-top');
    window.desktop.getWindowSettings().then(function (s) {
      topBtn.classList.toggle('is-on', s.onTop);
      setPinned(s.pinned);
    });

    topBtn.addEventListener('click', function () {
      window.desktop.toggleOnTop().then(function (onTop) {
        topBtn.classList.toggle('is-on', onTop);
      });
    });

    if (window.desktop.onWidgetMode) {
      window.desktop.onWidgetMode(function (mode) {
        setPinned(mode.pinned);
        topBtn.classList.toggle('is-on', !!mode.onTop);
      });
    }
  }

  return { start: start, render: render, choice: choice, size: function () { return size; }, refit: fadeList };
})();

Widget.start();
