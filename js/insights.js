/* Insights: what the rest of the day says about the habits.

   This is the whole reason the panel and the tracker were merged. The
   panel knows the context of a day — the weather, what was planned, what
   was written down — and the tracker knows what got done. Only their
   intersection can say something you did not already know, and no
   habit tracker on its own can say any of it.

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
     p < 0.05 because every habit is tested several ways, and many tests
     mean many chances to be fooled. */
  var MIN_DAYS = 10;
  var MIN_GAP = 25;
  var MIN_Z = 3;

  /* Enough first-tick times to talk about when something usually
     happens. This one is a description, not a claim about cause, so it
     does not need the z-test — but it does need enough days not to be
     an anecdote. */
  var MIN_TIMES = 10;

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

  /* Which days may be counted at all.

     Two conditions, and the first one was missing for a long time. A day
     nobody ever filled in is not a day the habit failed — it is a day
     with no record. Counting those as misses meant the busiest weeks,
     when the app went untouched, looked like the laziest ones, and
     "Sunday is your weak spot" could mean nothing more than that the
     computer stays off on Sundays.

     The second: a day the habit was not asked for is not a day it was
     skipped. Tuesday says nothing about a Monday-Wednesday-Friday habit.

     Today is left out throughout — it is not over, and counting it as a
     miss would drag every figure down every morning. */
  function eachDay(log, habit, todayKey, visit) {
    var key = habit.createdAt || todayKey;
    var guard = 0;
    while (key < todayKey && guard++ < 4000) {
      if (Storage.known(log, key) && Habits.dueOn(log, habit, key)) visit(key);
      key = Habits.shiftDate(key, 1);
    }
  }

  /* A habit measured by the week is kept or broken by the week, so a
     day-by-day comparison of it would be comparing the wrong thing. */
  function daily(habit) {
    return !habit.sched || habit.sched.type !== 'week';
  }

  function didIt(log, habit, key) {
    return Habits.metOn(log, habit, key) ? 1 : 0;
  }

  /* Each test returns the two groups it built plus a finding if the
     numbers earned one. The groups are kept either way: when there is no
     finding, they are what the page uses to say how far off it is. */

  function result(kind, a, b, found) {
    return { kind: kind, a: a.length, b: b.length, found: found || null };
  }

  /* Weather ---------------------------------------------------------- */

  function weatherTest(log, habit, todayKey) {
    var wet = [];
    var dry = [];

    eachDay(log, habit, todayKey, function (key) {
      var day = log[key];
      /* No weather recorded means the panel was not open that day —
         that is missing context, not fair weather. */
      if (!day || day.weather === undefined) return;
      (Weather.isWet(day.weather) ? wet : dry).push(didIt(log, habit, key));
    });

    if (!convincing(wet, dry)) return result('weather', wet, dry);

    var wetShare = share(wet);
    var dryShare = share(dry);
    return result('weather', wet, dry, {
      habit: habit.name,
      text: wetShare < dryShare
        ? 'You manage it on ' + wetShare + '% of wet days, against ' + dryShare + '% of dry ones.'
        : 'Rain suits you: ' + wetShare + '% on wet days, against ' + dryShare + '% of dry ones.',
      note: wet.length + ' wet days, ' + dry.length + ' dry'
    });
  }

  /* Day of the week --------------------------------------------------- */

  var DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
                   'Friday', 'Saturday', 'Sunday'];

  function weekdayTest(log, habit, todayKey) {
    var buckets = [[], [], [], [], [], [], []];

    eachDay(log, habit, todayKey, function (key) {
      buckets[Habits.weekdayOf(key)].push(didIt(log, habit, key));
    });

    var worst = -1;
    var worstShare = 101;
    var fullest = 0;
    for (var i = 0; i < 7; i++) {
      if (buckets[i].length > fullest) fullest = buckets[i].length;
      if (buckets[i].length < MIN_DAYS) continue;
      var s = share(buckets[i]);
      if (s < worstShare) {
        worstShare = s;
        worst = i;
      }
    }

    if (worst === -1) return { kind: 'weekday', a: fullest, b: MIN_DAYS, found: null };

    /* Compared against every other day pooled, not against the best
       single day — one freak Tuesday should not set the bar. */
    var rest = [];
    for (var j = 0; j < 7; j++) {
      if (j !== worst) rest = rest.concat(buckets[j]);
    }
    if (!convincing(buckets[worst], rest)) {
      return result('weekday', buckets[worst], rest);
    }

    return result('weekday', buckets[worst], rest, {
      habit: habit.name,
      text: DAY_NAMES[worst] + ' is the weak spot: ' + worstShare +
        '%, against ' + share(rest) + '% on other days.',
      note: buckets[worst].length + ' ' + DAY_NAMES[worst] + 's on record'
    });
  }

  /* Recent trend ------------------------------------------------------ */

  function trendTest(log, habit, todayKey) {
    var recent = [];
    var earlier = [];
    var cutoff = Habits.shiftDate(todayKey, -30);
    var start = Habits.shiftDate(todayKey, -60);

    eachDay(log, habit, todayKey, function (key) {
      if (key >= cutoff) recent.push(didIt(log, habit, key));
      else if (key >= start) earlier.push(didIt(log, habit, key));
    });

    if (!convincing(recent, earlier)) return result('trend', recent, earlier);

    var now = share(recent);
    var before = share(earlier);
    return result('trend', recent, earlier, {
      habit: habit.name,
      text: now > before
        ? 'Picking up: ' + now + '% this past month, against ' + before + '% the month before.'
        : 'Slipping: ' + now + '% this past month, against ' + before + '% the month before.',
      note: 'last 30 days against the 30 before'
    });
  }

  /* How much was on that day -------------------------------------------

     This one exists only because the tasks and the habits live in the
     same place. A habit tracker cannot ask it, because it does not know
     what else you had on. */

  var BUSY = 3;

  function loadTest(log, habit, todayKey, tasks) {
    var busy = [];
    var quiet = [];

    eachDay(log, habit, todayKey, function (key) {
      var n = 0;
      tasks.forEach(function (task) { if (task.date === key) n++; });
      /* The middle is left out on purpose. Two tasks is neither a busy
         day nor a quiet one, and stretching the groups to meet in the
         middle would blur exactly the contrast being looked for. */
      if (n >= BUSY) busy.push(didIt(log, habit, key));
      else if (n <= 1) quiet.push(didIt(log, habit, key));
    });

    if (!convincing(busy, quiet)) return result('load', busy, quiet);

    var busyShare = share(busy);
    var quietShare = share(quiet);
    return result('load', busy, quiet, {
      habit: habit.name,
      text: busyShare < quietShare
        ? 'Full days crowd it out: ' + busyShare + '% when ' + BUSY +
          ' or more things were planned, against ' + quietShare + '% on quiet days.'
        : 'It survives a full day: ' + busyShare + '% when ' + BUSY +
          ' or more things were planned, against ' + quietShare + '% on quiet days.',
      note: busy.length + ' full days, ' + quiet.length + ' quiet'
    });
  }

  /* Whether you wrote anything ------------------------------------------

     Also only possible here. Writing a couple of lines about the day is
     not a habit being tracked, but it turns out to mark the days that go
     differently often enough to be worth the comparison. */

  function wroteTest(log, habit, todayKey, notes) {
    var wrote = [];
    var silent = [];

    eachDay(log, habit, todayKey, function (key) {
      var text = notes[key];
      (text && text.trim() ? wrote : silent).push(didIt(log, habit, key));
    });

    if (!convincing(wrote, silent)) return result('wrote', wrote, silent);

    var wroteShare = share(wrote);
    var silentShare = share(silent);
    return result('wrote', wrote, silent, {
      habit: habit.name,
      text: wroteShare > silentShare
        ? 'The days you write something down are the good ones: ' + wroteShare +
          '%, against ' + silentShare + '% on the days you do not.'
        : 'Odd one: ' + wroteShare + '% on the days you write something down, against ' +
          silentShare + '% on the days you do not.',
      note: wrote.length + ' days written up, ' + silent.length + ' not'
    });
  }

  /* When it usually happens --------------------------------------------

     Plain description, not a claim about cause, so it is kept apart from
     the findings above and worded as an observation. */

  function timing(log, habit, todayKey) {
    var minutes = [];
    var key = habit.createdAt || todayKey;
    var guard = 0;

    while (key <= todayKey && guard++ < 4000) {
      var day = log[key];
      var stamp = day && day.at && day.at[habit.id];
      if (stamp) {
        var parts = stamp.split(':');
        minutes.push(Number(parts[0]) * 60 + Number(parts[1]));
      }
      key = Habits.shiftDate(key, 1);
    }

    if (minutes.length < MIN_TIMES) return null;

    minutes.sort(function (a, b) { return a - b; });
    var mid = minutes[Math.floor(minutes.length / 2)];
    var hh = Math.floor(mid / 60);
    var mm = mid % 60;

    /* The quarter either side, so "usually at eight" does not hide a
       habit that happens anywhere between six and midnight. */
    var low = minutes[Math.floor(minutes.length * 0.25)];
    var high = minutes[Math.floor(minutes.length * 0.75)];

    function clock(total) {
      var h = Math.floor(total / 60);
      var m = total % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    return {
      habit: habit.name,
      text: 'Usually around ' + clock(hh * 60 + mm) +
        ' (most of them between ' + clock(low) + ' and ' + clock(high) + ').',
      note: minutes.length + ' days timed'
    };
  }

  /* Putting it together ------------------------------------------------ */

  var LABELS = {
    weather: 'Rain against clear weather',
    weekday: 'One weekday against the rest',
    trend: 'This month against last',
    load: 'Full days against quiet ones',
    wrote: 'Days you wrote something down'
  };

  function collect() {
    var state = Storage.load();
    var todayKey = Storage.today();
    var found = [];
    var best = {};

    Habits.active().forEach(function (habit) {
      if (!daily(habit)) return;

      [
        weatherTest(state.log, habit, todayKey),
        weekdayTest(state.log, habit, todayKey),
        trendTest(state.log, habit, todayKey),
        loadTest(state.log, habit, todayKey, state.tasks),
        wroteTest(state.log, habit, todayKey, state.notes)
      ].forEach(function (test) {
        if (test.found) {
          found.push(test.found);
          best[test.kind] = 'done';
          return;
        }
        if (best[test.kind] === 'done') return;

        /* How close the closest habit is, so the page can say what it is
           waiting for instead of looking broken. */
        var reach = Math.min(test.a, test.b);
        if (!best[test.kind] || reach > best[test.kind].reach) {
          best[test.kind] = { reach: reach, a: test.a, b: test.b };
        }
      });
    });

    var waiting = Object.keys(LABELS).filter(function (kind) {
      return best[kind] && best[kind] !== 'done';
    }).map(function (kind) {
      var it = best[kind];
      return {
        label: LABELS[kind],
        note: it.reach >= MIN_DAYS
          ? 'enough days — no difference big enough to call'
          : Math.min(it.a, it.b) + ' of the ' + MIN_DAYS + ' days needed on the thinner side'
      };
    });

    var times = [];
    Habits.active().forEach(function (habit) {
      var t = timing(state.log, habit, todayKey);
      if (t) times.push(t);
    });

    return { found: found, waiting: waiting, times: times };
  }

  function findingHtml(f) {
    return '' +
      '<li class="finding">' +
        '<span class="finding__habit">' + escapeHtml(f.habit) + '</span>' +
        '<span class="finding__text">' + escapeHtml(f.text) + '</span>' +
        '<span class="finding__note muted">' + escapeHtml(f.note) + '</span>' +
      '</li>';
  }

  function render() {
    var el = document.getElementById('insights');
    if (!el) return;

    var out = collect();
    var html = '<p class="card__title">Patterns</p>';

    if (out.found.length) {
      html += '<ul class="findings">' + out.found.map(findingHtml).join('') + '</ul>';
    } else {
      html += '<p class="card__note muted">Nothing solid yet. Every comparison below ' +
        'needs about ' + MIN_DAYS + ' days on each side before it means anything, ' +
        'and a day only counts once it has been filled in — press a day on the ' +
        'calendar to fill in one that was missed.</p>';
    }

    /* Saying what is being waited for. A page that shows nothing and
       explains nothing is indistinguishable from a page that is broken,
       and this one will be empty for weeks by design. */
    if (out.waiting.length) {
      html += '<p class="label">Still counting</p><ul class="waiting">' +
        out.waiting.map(function (w) {
          return '<li class="waiting__row">' +
            '<span>' + escapeHtml(w.label) + '</span>' +
            '<span class="muted">' + escapeHtml(w.note) + '</span></li>';
        }).join('') + '</ul>';
    }

    if (out.times.length) {
      html += '<p class="label">When you do them</p><ul class="findings">' +
        out.times.map(findingHtml).join('') + '</ul>';
    }

    el.innerHTML = html;
  }

  return {
    render: render,
    collect: collect,
    MIN_DAYS: MIN_DAYS,
    MIN_GAP: MIN_GAP
  };
})();
