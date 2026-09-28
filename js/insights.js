/* Insights: what the weather and the calendar say about the habits.

   This is the whole reason the panel and the tracker were merged. The
   panel knows the context of a day, the tracker knows what got done, and
   only their intersection can say something you did not already know.

   Everything here obeys one rule, and it matters more than the findings:
   say nothing unless the numbers earn it. A panel that states "you skip
   the gym in the rain" off three observations is worse than a panel that
   stays quiet, because it sounds equally confident when it is wrong. */

var Insights = (function () {

  /* Three gates, and a finding has to pass all of them.

     MIN_DAYS and MIN_GAP alone were not enough, and the numbers say so.
     A Monte Carlo run with no real link whatsoever — the same coin on
     wet and dry days — still produced a confident claim 26% of the time
     at ten days a side. Across four habits tested three ways, the chance
     of at least one invented pattern was 97%. The panel would have been
     making things up almost every time.

     So the gap now also has to clear a two-proportion z-test. z >= 3
     (about p < 0.003) brings that 97% down to 3%, while still catching
     real effects: a 20%-vs-80% split is found about 60% of the time at
     fifteen days a side. The bar is deliberately stricter than the usual
     p < 0.05 because every habit is tested three ways, and many tests
     mean many chances to be fooled. */
  var MIN_DAYS = 10;
  var MIN_GAP = 25;
  var MIN_Z = 3;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function share(hits) {
    if (!hits.length) return 0;
    var done = 0;
    hits.forEach(function (v) { done += v; });
    return Math.round((done / hits.length) * 100);
  }

  function count(hits) {
    var done = 0;
    hits.forEach(function (v) { done += v; });
    return done;
  }

  /* Would two groups this different turn up by chance? Standard
     two-proportion z-test: the gap divided by how much a gap of pure
     luck typically measures at these sample sizes. */
  function convincing(a, b) {
    if (a.length < MIN_DAYS || b.length < MIN_DAYS) return false;

    var aDone = count(a);
    var bDone = count(b);
    var pooled = (aDone + bDone) / (a.length + b.length);
    if (pooled <= 0 || pooled >= 1) return false;

    var se = Math.sqrt(pooled * (1 - pooled) * (1 / a.length + 1 / b.length));
    if (!se) return false;

    var gap = Math.abs(aDone / a.length - bDone / b.length);
    if (gap * 100 < MIN_GAP) return false;

    return gap / se >= MIN_Z;
  }

  /* Every day from the habit's first to yesterday. Today is left out on
     purpose: it is not over, and counting it as a miss would drag every
     figure down every morning.

     Walking the calendar rather than the log's keys matters — a day with
     no entry is a day the habit did not happen, and skipping those would
     quietly only ever count the good days. */
  function eachDay(habit, todayKey, visit) {
    var key = habit.createdAt || todayKey;
    var guard = 0;
    while (key < todayKey && guard++ < 4000) {
      visit(key);
      key = Habits.shiftDate(key, 1);
    }
  }

  function didIt(log, habit, key) {
    return Habits.metOn(log, habit, key) ? 1 : 0;
  }

  /* Weather ---------------------------------------------------------- */

  function weatherFinding(log, habit, todayKey) {
    var wet = [];
    var dry = [];

    eachDay(habit, todayKey, function (key) {
      var day = log[key];
      /* No weather recorded means the panel was not open that day —
         that is missing context, not fair weather. */
      if (!day || day.weather === undefined) return;
      (Weather.isWet(day.weather) ? wet : dry).push(didIt(log, habit, key));
    });

    if (!convincing(wet, dry)) return null;

    var wetShare = share(wet);
    var dryShare = share(dry);
    var worseInRain = wetShare < dryShare;
    return {
      habit: habit.name,
      text: worseInRain
        ? 'You manage it on ' + wetShare + '% of wet days, against ' + dryShare + '% of dry ones.'
        : 'Rain suits you: ' + wetShare + '% on wet days, against ' + dryShare + '% of dry ones.',
      note: wet.length + ' wet days, ' + dry.length + ' dry'
    };
  }

  /* Day of the week --------------------------------------------------- */

  var DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
                   'Friday', 'Saturday', 'Sunday'];

  function weekdayFinding(log, habit, todayKey) {
    var buckets = [[], [], [], [], [], [], []];

    eachDay(habit, todayKey, function (key) {
      var parts = key.split('-');
      var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      var index = (date.getDay() + 6) % 7;
      buckets[index].push(didIt(log, habit, key));
    });

    var worst = -1;
    var worstShare = 101;
    for (var i = 0; i < 7; i++) {
      if (buckets[i].length < MIN_DAYS) continue;
      var s = share(buckets[i]);
      if (s < worstShare) {
        worstShare = s;
        worst = i;
      }
    }
    if (worst === -1) return null;

    /* Compared against every other day pooled, not against the best
       single day — one freak Tuesday should not set the bar. */
    var rest = [];
    for (var j = 0; j < 7; j++) {
      if (j !== worst) rest = rest.concat(buckets[j]);
    }
    if (!convincing(buckets[worst], rest)) return null;

    var restShare = share(rest);
    return {
      habit: habit.name,
      text: DAY_NAMES[worst] + ' is the weak spot: ' + worstShare +
        '%, against ' + restShare + '% on other days.',
      note: buckets[worst].length + ' ' + DAY_NAMES[worst] + 's on record'
    };
  }

  /* Recent trend ------------------------------------------------------ */

  function trendFinding(log, habit, todayKey) {
    var recent = [];
    var earlier = [];
    var cutoff = Habits.shiftDate(todayKey, -30);
    var start = Habits.shiftDate(todayKey, -60);

    eachDay(habit, todayKey, function (key) {
      if (key >= cutoff) recent.push(didIt(log, habit, key));
      else if (key >= start) earlier.push(didIt(log, habit, key));
    });

    if (!convincing(recent, earlier)) return null;

    var now = share(recent);
    var before = share(earlier);
    return {
      habit: habit.name,
      text: now > before
        ? 'Picking up: ' + now + '% this past month, against ' + before + '% the month before.'
        : 'Slipping: ' + now + '% this past month, against ' + before + '% the month before.',
      note: 'last 30 days vs the 30 before'
    };
  }

  /* Rendering --------------------------------------------------------- */

  function collect() {
    var state = Storage.load();
    var todayKey = Storage.today();
    var found = [];

    Habits.active().forEach(function (habit) {
      [weatherFinding, weekdayFinding, trendFinding].forEach(function (test) {
        var hit = test(state.log, habit, todayKey);
        if (hit) found.push(hit);
      });
    });

    return found;
  }

  function render() {
    var el = document.getElementById('insights');
    if (!el) return;

    var found = collect();

    if (!found.length) {
      el.innerHTML =
        '<p class="card__title">Patterns</p>' +
        '<p class="card__note muted">Nothing solid yet. These need about ' + MIN_DAYS +
        ' days on each side of a comparison before they mean anything, ' +
        'so they show up once there is history to stand on.</p>';
      return;
    }

    el.innerHTML =
      '<p class="card__title">Patterns</p>' +
      '<ul class="findings">' + found.map(function (f) {
        return '' +
          '<li class="finding">' +
            '<span class="finding__habit">' + escapeHtml(f.habit) + '</span>' +
            '<span class="finding__text">' + escapeHtml(f.text) + '</span>' +
            '<span class="finding__note muted">' + escapeHtml(f.note) + '</span>' +
          '</li>';
      }).join('') + '</ul>';
  }

  return {
    render: render,
    collect: collect,
    MIN_DAYS: MIN_DAYS,
    MIN_GAP: MIN_GAP
  };
})();
