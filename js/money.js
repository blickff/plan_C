/* Money: what was spent, on what, and whether it is going up.

   Built to be used every day, so the order on screen is the order of
   use: writing down what you just spent comes first, looking at where
   it all went comes after.

   Two decisions shape the charts, and both came out of measuring rather
   than taste:

   - No colour per category. A ring coloured by category only works if
     every pair of colours stays tell-apart-able, because a category with
     nothing spent drops out and its two neighbours then touch. Checked
     against these card surfaces with the data-viz validator, at most
     three hues pass that test — four if red and green are allowed, and
     those already mean "missed" and "done" in this app. So the ring is
     one grey with a single highlighted segment, and the names live in
     the list beside it, where identity never depends on colour at all.

   - Amounts are whole cents. 0.1 + 0.2 is not 0.3 in floating point,
     and a money page that drifts by a cent is a money page nobody
     trusts. */

var Money = (function () {

  var PRESETS = [
    { id: 'food', name: 'Food' },
    { id: 'shopping', name: 'Shopping' },
    { id: 'going-out', name: 'Going out' },
    { id: 'transport', name: 'Transport' },
    { id: 'travel', name: 'Travel' },
    { id: 'home', name: 'Home & bills' },
    { id: 'health', name: 'Health' },
    { id: 'other', name: 'Other' }
  ];

  /* A ring reads part-to-whole at a glance up to about six pieces; past
     that the slices are too thin to compare. The largest five are drawn
     and the rest share the sixth. The list beside it always has all. */
  var RING_SLOTS = 6;

  /* How many periods the trend shows, ending at the one on screen. */
  var TREND = { day: 14, week: 8, month: 6, year: 4 };

  var CURRENCIES = ['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'CHF', 'RUB'];

  var scope = 'month';
  var offset = 0;
  var picked = null;
  var focus = null;
  var editing = false;
  var undone = null;
  var undoTimer = null;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Data ------------------------------------------------------------- */

  function data() {
    var state = Storage.load();
    if (!state.money || typeof state.money !== 'object') state.money = {};
    var m = state.money;
    if (!m.currency) m.currency = 'EUR';
    if (!Array.isArray(m.categories) || !m.categories.length) {
      m.categories = PRESETS.map(function (p) { return { id: p.id, name: p.name }; });
    }
    if (!Array.isArray(m.entries)) m.entries = [];
    return m;
  }

  function liveCategories() {
    return data().categories.filter(function (c) { return !c.archived; });
  }

  function categoryName(id) {
    var list = data().categories;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].name;
    }
    return 'Unsorted';
  }

  /* "12,50", "12.50", "1 240,50" and "1.240,50" all mean what they look
     like. Whichever of . or , comes last is the decimal point; the other
     is a thousands separator. Returns whole cents, or null. */
  function parseAmount(text) {
    var s = String(text || '').replace(/[\s ']/g, '');
    if (!s) return null;
    var lastDot = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');
    var decimal = lastDot > lastComma ? '.' : ',';
    var thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
    if (!/^\d*\.?\d{0,2}$/.test(s) || s === '.' ) return null;
    var cents = Math.round(parseFloat(s) * 100);
    return cents > 0 && isFinite(cents) ? cents : null;
  }

  function format(cents) {
    var value = cents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: data().currency,
        currencyDisplay: 'narrowSymbol'
      }).format(value);
    } catch (err) {
      return value.toFixed(2) + ' ' + data().currency;
    }
  }

  /* Periods ------------------------------------------------------------ */

  function parse(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* The span of days a period covers, as two date keys. offset 0 is the
     one containing today, -1 the one before it, and so on. */
  function range(which, off) {
    var now = parse(Storage.today());
    var from;
    var to;

    if (which === 'day') {
      from = new Date(now);
      from.setDate(from.getDate() + off);
      to = new Date(from);
    } else if (which === 'week') {
      from = parse(Habits.mondayOf(Storage.today()));
      from.setDate(from.getDate() + off * 7);
      to = new Date(from);
      to.setDate(to.getDate() + 6);
    } else if (which === 'month') {
      from = new Date(now.getFullYear(), now.getMonth() + off, 1);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    } else {
      from = new Date(now.getFullYear() + off, 0, 1);
      to = new Date(from.getFullYear(), 11, 31);
    }

    return { from: Storage.dateKey(from), to: Storage.dateKey(to) };
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function title(which, r) {
    var from = parse(r.from);
    var today = Storage.today();
    if (which === 'day') {
      if (r.from === today) return 'Today';
      if (r.from === Habits.shiftDate(today, -1)) return 'Yesterday';
      return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(from);
    }
    if (which === 'week') {
      if (r.from === Habits.mondayOf(today)) return 'This week';
      var to = parse(r.to);
      return SHORT[from.getMonth()] + ' ' + from.getDate() + ' – ' +
        (to.getMonth() === from.getMonth() ? '' : SHORT[to.getMonth()] + ' ') + to.getDate();
    }
    if (which === 'month') return MONTHS[from.getMonth()] + ' ' + from.getFullYear();
    return String(from.getFullYear());
  }

  /* The short name under a trend bar. */
  function tick(which, r) {
    var from = parse(r.from);
    if (which === 'day') return String(from.getDate());
    if (which === 'week') return SHORT[from.getMonth()] + ' ' + from.getDate();
    if (which === 'month') return SHORT[from.getMonth()];
    return String(from.getFullYear());
  }

  function within(r) {
    return data().entries.filter(function (e) { return e.date >= r.from && e.date <= r.to; });
  }

  function sum(entries) {
    var total = 0;
    entries.forEach(function (e) { total += e.cents; });
    return total;
  }

  /* The comparison under the total.

     Comparing this month so far with the whole of last month would say
     "you spent less" every single day until the month ends, which is a
     lie the arithmetic tells without meaning to. While a period is still
     running it is set against the same stretch of the one before: the
     1st to the 29th against the 1st to the 29th. */
  function comparison(which, off) {
    var now = range(which, off);
    var before = range(which, off - 1);
    var today = Storage.today();
    var partial = now.from <= today && today < now.to;

    if (partial) {
      var elapsed = Math.round((parse(today) - parse(now.from)) / 86400000);
      var cut = parse(before.from);
      cut.setDate(cut.getDate() + elapsed);
      var cutKey = Storage.dateKey(cut);
      before = { from: before.from, to: cutKey < before.to ? cutKey : before.to };
      now = { from: now.from, to: today };
    }

    var a = sum(within(now));
    var b = sum(within(before));

    var word = { day: 'day', week: 'week', month: 'month', year: 'year' }[which];
    /* Worded to fit all three sentences below: "48% more than at this
       point last month", "Nothing spent the week before", "The same as
       the day before". */
    var against = partial
      ? 'at this point last ' + word
      : 'the ' + word + ' before';

    if (!b && !a) return null;
    /* Nothing to compare with is not the same as no change, so it gets
       no arrow. */
    if (!b) return { text: 'Nothing spent ' + against, dir: null };

    var change = Math.round(((a - b) / b) * 100);
    if (change === 0) return { text: 'The same as ' + against, dir: 0 };
    return {
      text: Math.abs(change) + '% ' + (change > 0 ? 'more' : 'less') + ' than ' + against,
      dir: change > 0 ? 1 : -1
    };
  }

  /* Writing things down -------------------------------------------------- */

  function add(catId, cents, note, date) {
    if (!catId) return 'Pick what it was for.';
    if (!cents) return 'Type how much — for example 12.50.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = Storage.today();

    data().entries.push({
      id: 'm-' + Date.now(),
      date: date,
      cat: catId,
      cents: cents,
      note: String(note || '').trim()
    });
    Storage.save();
    return null;
  }

  function remove(id) {
    var list = data().entries;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        undone = { entry: list[i], at: i };
        list.splice(i, 1);
        break;
      }
    }
    Storage.save();
    clearTimeout(undoTimer);
    undoTimer = setTimeout(function () { undone = null; render(); }, 10000);
    render();
  }

  function undoRemove() {
    if (!undone) return;
    clearTimeout(undoTimer);
    var list = data().entries;
    list.splice(Math.min(undone.at, list.length), 0, undone.entry);
    undone = null;
    Storage.save();
    render();
  }

  /* Categories ------------------------------------------------------------ */

  function addCategory(name) {
    name = String(name || '').trim();
    if (!name) return 'Give it a name.';
    var exists = liveCategories().some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); });
    if (exists) return 'There is one called that already.';
    data().categories.push({ id: 'cat-' + Date.now(), name: name });
    Storage.save();
    return null;
  }

  function renameCategory(id, name) {
    name = String(name || '').trim();
    if (!name) return;
    data().categories.forEach(function (c) { if (c.id === id) c.name = name; });
    Storage.save();
  }

  /* Archived, never deleted: last spring's travel spending should not
     turn into "Unsorted" because the category was tidied away today. */
  function archiveCategory(id) {
    data().categories.forEach(function (c) { if (c.id === id) c.archived = true; });
    if (picked === id) picked = null;
    Storage.save();
  }

  /* Drawing: the ring ------------------------------------------------------- */

  /* Largest first, from twelve o'clock. Ordering by size is safe here in
     a way it would not be in a coloured chart: no colour belongs to a
     category, so nothing gets repainted when the order changes. */
  function slices(entries) {
    var byCat = {};
    entries.forEach(function (e) { byCat[e.cat] = (byCat[e.cat] || 0) + e.cents; });

    var rows = Object.keys(byCat).map(function (id) {
      return { id: id, name: categoryName(id), cents: byCat[id] };
    }).sort(function (a, b) { return b.cents - a.cents; });

    if (rows.length <= RING_SLOTS) return { ring: rows, all: rows };

    var head = rows.slice(0, RING_SLOTS - 1);
    var tail = rows.slice(RING_SLOTS - 1);
    var rest = { id: '__rest', name: tail.length + ' more', cents: sum(tail.map(function (r) { return { cents: r.cents }; })) };
    return { ring: head.concat([rest]), all: rows, tail: tail };
  }

  var R = 54;
  var STROKE = 14;
  var GAP = 2.5;

  function ringSvg(ring, total, focusId) {
    var size = (R + STROKE) * 2;
    var c = size / 2;
    var circ = 2 * Math.PI * R;

    if (!total) {
      return '<svg class="mring" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<circle cx="' + c + '" cy="' + c + '" r="' + R + '" class="mring__empty"/></svg>';
    }

    var start = 0;
    var parts = ring.map(function (slice) {
      var share = slice.cents / total;
      var len = share * circ;
      /* A 2.5px gap of card colour between pieces, taken out of the
         piece itself, so the pieces still add up to the whole circle. */
      var gap = ring.length > 1 ? Math.min(GAP, len * 0.4) : 0;
      var dash = Math.max(0.01, len - gap);
      var el = '<circle cx="' + c + '" cy="' + c + '" r="' + R + '"' +
        ' class="mring__slice' + (slice.id === focusId ? ' is-focus' : '') + '"' +
        ' data-slice="' + escapeHtml(slice.id) + '"' +
        ' stroke-dasharray="' + dash.toFixed(2) + ' ' + (circ - dash).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-start).toFixed(2) + '">' +
        '<title>' + escapeHtml(slice.name) + ' · ' + escapeHtml(format(slice.cents)) + '</title></circle>';
      start += len;
      return el;
    }).join('');

    /* Rotated so the first piece starts at twelve o'clock. */
    return '<svg class="mring" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<g transform="rotate(-90 ' + c + ' ' + c + ')">' + parts + '</g></svg>';
  }

  /* Drawing: the page ------------------------------------------------------- */

  function renderEntry() {
    var cats = liveCategories();
    if (!picked || !cats.some(function (c) { return c.id === picked; })) {
      picked = cats.length ? cats[0].id : null;
    }

    document.getElementById('money-cats').innerHTML = cats.map(function (c) {
      return '<button class="mchip' + (c.id === picked ? ' is-on' : '') + '" type="button"' +
        ' data-pick="' + escapeHtml(c.id) + '" aria-pressed="' + (c.id === picked) + '">' +
        escapeHtml(c.name) + '</button>';
    }).join('');

    var todays = sum(within({ from: Storage.today(), to: Storage.today() }));
    document.getElementById('money-today').textContent = todays
      ? 'Today so far: ' + format(todays)
      : 'Nothing spent today yet.';

    var cur = document.getElementById('money-currency');
    if (document.activeElement !== cur) cur.value = data().currency;

    var edit = document.getElementById('money-edit');
    edit.hidden = !editing;
    document.getElementById('money-edit-toggle').textContent = editing ? 'Done' : 'Edit categories';

    if (editing) {
      document.getElementById('money-edit-list').innerHTML = cats.map(function (c) {
        return '<div class="mcat" data-cat="' + escapeHtml(c.id) + '">' +
          '<input class="input input--wide" type="text" value="' + escapeHtml(c.name) + '" data-rename aria-label="Name">' +
          '<button class="task__drop" type="button" data-archive="' + escapeHtml(c.id) + '" aria-label="Remove">&#215;</button>' +
        '</div>';
      }).join('');
    }
  }

  function renderPeriod() {
    document.querySelectorAll('[data-mscope]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mscope') === scope);
    });
    document.getElementById('money-title').textContent = title(scope, range(scope, offset));
    document.getElementById('money-next').disabled = offset >= 0;
  }

  function renderSummary() {
    var r = range(scope, offset);
    var entries = within(r);
    var total = sum(entries);
    var s = slices(entries);

    /* The biggest piece is the story until the person points at another. */
    var focusId = focus && s.ring.some(function (x) { return x.id === focus; })
      ? focus
      : (s.ring[0] ? s.ring[0].id : null);
    var focused = s.ring.filter(function (x) { return x.id === focusId; })[0];

    document.getElementById('money-total').textContent = format(total);

    var cmp = comparison(scope, offset);
    var cmpEl = document.getElementById('money-compare');
    if (!cmp) {
      cmpEl.innerHTML = '';
    } else {
      /* An arrow and words, in ordinary ink. Spending more is not the
         same kind of thing as a missed habit, and the red and green that
         mean missed and done elsewhere stay out of it. */
      var arrow = cmp.dir === null ? ''
        : cmp.dir > 0 ? '&#8593;' : cmp.dir < 0 ? '&#8595;' : '&#8596;';
      cmpEl.innerHTML = (arrow ? '<span class="mcmp__arrow" aria-hidden="true">' + arrow + '</span>' : '') +
        escapeHtml(cmp.text);
    }

    document.getElementById('money-ring').innerHTML = ringSvg(s.ring, total, focusId);

    var centre = document.getElementById('money-centre');
    if (!total) {
      centre.innerHTML = '<span class="mcentre__label">Nothing yet</span>';
    } else if (focused) {
      centre.innerHTML =
        '<span class="mcentre__share">' + Math.round((focused.cents / total) * 100) + '%</span>' +
        '<span class="mcentre__label">' + escapeHtml(focused.name) + '</span>';
    }

    /* The list is the legend and the table at once: every category, its
       amount and its share, readable without hovering over anything. */
    var list = document.getElementById('money-split');
    if (!s.all.length) {
      list.innerHTML = '<p class="soft">Nothing spent ' +
        (offset === 0 ? 'yet in this ' + scope : 'in this ' + scope) + '.</p>';
      return;
    }

    var inRing = {};
    s.ring.forEach(function (x) { inRing[x.id] = true; });

    list.innerHTML = s.all.map(function (row) {
      var sliceId = inRing[row.id] ? row.id : '__rest';
      var share = Math.round((row.cents / total) * 100);
      return '<button class="msplit' + (sliceId === focusId ? ' is-focus' : '') + '" type="button"' +
        ' data-slice="' + escapeHtml(sliceId) + '">' +
        '<span class="msplit__name">' + escapeHtml(row.name) + '</span>' +
        '<span class="msplit__amount">' + escapeHtml(format(row.cents)) + '</span>' +
        '<span class="msplit__share">' + share + '%</span>' +
        '<span class="msplit__bar"><span style="width:' + Math.max(1, share) + '%"></span></span>' +
      '</button>';
    }).join('');
  }

  function renderTrend() {
    var n = TREND[scope];
    var periods = [];
    for (var i = n - 1; i >= 0; i--) {
      var r = range(scope, offset - i);
      periods.push({ r: r, cents: sum(within(r)), current: i === 0 });
    }

    var max = 0;
    periods.forEach(function (p) { if (p.cents > max) max = p.cents; });

    var word = { day: 'days', week: 'weeks', month: 'months', year: 'years' }[scope];
    document.getElementById('money-trend-title').textContent = 'The last ' + n + ' ' + word;

    /* One grey, the period on screen in the accent: the story is "this
       one against the ones before", and a colour per bar would say
       something else. */
    document.getElementById('money-bars').innerHTML = periods.map(function (p, i) {
      var h = max ? Math.max(p.cents ? 3 : 0, Math.round((p.cents / max) * 100)) : 0;
      var label = title(scope, p.r);
      return '<button class="mbar' + (p.current ? ' is-current' : '') + '" type="button"' +
        ' data-back="' + (n - 1 - i) + '" data-read="' + escapeHtml(label + ' · ' + format(p.cents)) + '"' +
        ' aria-label="' + escapeHtml(label + ', ' + format(p.cents)) + '">' +
        '<span class="mbar__track"><span class="mbar__fill" style="height:' + h + '%"></span></span>' +
        '<span class="mbar__tick">' + escapeHtml(tick(scope, p.r)) + '</span>' +
      '</button>';
    }).join('');

    var cur = periods[periods.length - 1];
    document.getElementById('money-read').textContent = title(scope, cur.r) + ' · ' + format(cur.cents);
  }

  function renderEntries() {
    var r = range(scope, offset);
    /* Newest first. Within one day, the order they were written down in,
       reversed — taken from their place in the list, not from the id,
       because ids compared as text put "m-9" after "m-10". */
    var all = data().entries;
    var entries = within(r).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return all.indexOf(b) - all.indexOf(a);
    });

    var box = document.getElementById('money-list');
    var undoHtml = undone
      ? '<p class="undo">Deleted ' + escapeHtml(format(undone.entry.cents)) + ' · ' +
        '<button class="undo__btn" type="button" id="money-undo">Undo</button></p>'
      : '';

    if (!entries.length) {
      box.innerHTML = '<p class="soft">Nothing written down for ' +
        title(scope, r).toLowerCase().replace(/^this /, 'this ') + '.</p>' + undoHtml;
    } else {
      var fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric' });
      box.innerHTML = '<ul class="mlist">' + entries.map(function (e) {
        return '<li class="mrow">' +
          '<span class="mrow__when">' + escapeHtml(fmt.format(parse(e.date))) + '</span>' +
          '<span class="mrow__what">' +
            '<span class="mrow__cat">' + escapeHtml(categoryName(e.cat)) + '</span>' +
            (e.note ? '<span class="mrow__note">' + escapeHtml(e.note) + '</span>' : '') +
          '</span>' +
          '<span class="mrow__amount">' + escapeHtml(format(e.cents)) + '</span>' +
          '<button class="task__drop" type="button" data-mdrop="' + escapeHtml(e.id) + '" aria-label="Delete">&#215;</button>' +
        '</li>';
      }).join('') + '</ul>' + undoHtml;
    }

    var u = document.getElementById('money-undo');
    if (u) u.addEventListener('click', undoRemove);
  }

  function render() {
    if (!document.getElementById('money-view')) return;
    renderEntry();
    renderPeriod();
    renderSummary();
    renderTrend();
    renderEntries();
  }

  /* Wiring ------------------------------------------------------------------- */

  function start() {
    if (!document.getElementById('money-view')) return;

    var date = document.getElementById('money-date');
    date.value = Storage.today();

    var cur = document.getElementById('money-currency');
    cur.innerHTML = CURRENCIES.map(function (code) {
      return '<option value="' + code + '">' + code + '</option>';
    }).join('');

    render();

    document.getElementById('money-cats').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-pick]');
      if (!chip) return;
      picked = chip.getAttribute('data-pick');
      renderEntry();
      document.getElementById('money-amount').focus();
    });

    document.getElementById('money-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var amount = document.getElementById('money-amount');
      var note = document.getElementById('money-note');
      var error = add(picked, parseAmount(amount.value), note.value, date.value);
      document.getElementById('money-error').textContent = error || '';
      if (error) return;

      /* The category stays picked and the cursor goes back to the
         amount: three coffees in a row should be three quick entries,
         not three trips back up to the chips. */
      amount.value = '';
      note.value = '';
      amount.focus();
      render();
    });

    date.addEventListener('click', function () {
      if (typeof this.showPicker === 'function') {
        try { this.showPicker(); } catch (err) { /* already open */ }
      }
    });

    document.querySelectorAll('[data-mscope]').forEach(function (b) {
      b.addEventListener('click', function () {
        scope = this.getAttribute('data-mscope');
        offset = 0;
        focus = null;
        render();
      });
    });

    document.getElementById('money-prev').addEventListener('click', function () {
      offset -= 1; focus = null; render();
    });
    document.getElementById('money-next').addEventListener('click', function () {
      if (offset < 0) { offset += 1; focus = null; render(); }
    });

    /* Pointing at a piece of the ring, or at its row in the list, makes
       it the one the centre describes. Keyboard focus does the same, so
       nothing is reachable by mouse alone. */
    function point(event) {
      var hit = event.target.closest('[data-slice]');
      if (!hit) return;
      var id = hit.getAttribute('data-slice');
      if (id === focus) return;
      focus = id;
      renderSummary();
    }

    var summary = document.getElementById('money-summary');
    summary.addEventListener('mouseover', point);
    summary.addEventListener('focusin', point);
    summary.addEventListener('click', point);

    /* Pressing a bar steps to that period. */
    var bars = document.getElementById('money-bars');
    bars.addEventListener('click', function (event) {
      var bar = event.target.closest('[data-back]');
      if (!bar) return;
      offset -= Number(bar.getAttribute('data-back'));
      focus = null;
      render();
    });

    function read(event) {
      var bar = event.target.closest('[data-read]');
      if (bar) document.getElementById('money-read').textContent = bar.getAttribute('data-read');
    }
    bars.addEventListener('mouseover', read);
    bars.addEventListener('focusin', read);
    bars.addEventListener('mouseleave', renderTrend);

    document.getElementById('money-list').addEventListener('click', function (event) {
      var drop = event.target.closest('[data-mdrop]');
      if (drop) remove(drop.getAttribute('data-mdrop'));
    });

    document.getElementById('money-edit-toggle').addEventListener('click', function () {
      editing = !editing;
      renderEntry();
    });

    var editList = document.getElementById('money-edit-list');
    editList.addEventListener('change', function (event) {
      var row = event.target.closest('[data-cat]');
      if (row && event.target.matches('[data-rename]')) {
        renameCategory(row.getAttribute('data-cat'), event.target.value);
        render();
      }
    });
    editList.addEventListener('click', function (event) {
      var drop = event.target.closest('[data-archive]');
      if (!drop) return;
      archiveCategory(drop.getAttribute('data-archive'));
      render();
    });

    document.getElementById('money-newcat').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('money-newcat-name');
      var error = addCategory(input.value);
      document.getElementById('money-newcat-error').textContent = error || '';
      if (!error) { input.value = ''; render(); }
    });

    cur.addEventListener('change', function () {
      data().currency = this.value;
      Storage.save();
      render();
    });
  }

  return { start: start, render: render, parseAmount: parseAmount };
})();
