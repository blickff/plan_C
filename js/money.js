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
    { id: 'hobbies', name: 'Hobbies' },
    { id: 'other', name: 'Other' }
  ];

  /* Every category gets its own piece of the ring, and its own shade.
     Folding the small ones into a shared "N more" piece left several
     rows in one grey, which is exactly what the shades are there to
     prevent. Kept as a ceiling only for a list far longer than anyone
     keeps. */
  var RING_SLOTS = 16;

  /* How many periods the trend shows, ending at the one on screen. */
  var TREND = { day: 14, week: 8, month: 6, year: 4 };

  var CURRENCIES = ['EUR', 'USD', 'GBP', 'UAH', 'PLN', 'CHF', 'RUB'];

  var scope = 'month';
  var offset = 0;
  /* How many periods back the comparison card looks: 1 is the one
     straight before the period on screen. */
  var back = 1;
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

  function findCategory(id) {
    var list = data().categories;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Icons ------------------------------------------------------------------

     Line drawings on a 24-unit grid, in the text colour, so a category
     can be found by shape before its name is read. Drawn here rather
     than loaded: the app runs with no network access to anything but the
     weather, and a font of icons would be a megabyte for eleven shapes.

     Categories you make yourself all get the tag — unless their name is
     one these already know ("Car", "Hobbies"), in which case they get
     that drawing. */

  var ICONS = {
    food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
    shopping: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    'going-out': '<path d="M5 4h14l-7 8.5z"/><path d="M12 12.5V20M8 20h8"/>',
    transport: '<rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M8.5 20.5v-3M15.5 20.5v-3"/><circle cx="8.5" cy="14.3" r="0.6"/><circle cx="15.5" cy="14.3" r="0.6"/>',
    car: '<path d="M4.5 16.5v-4.5l2.2-5h10.6l2.2 5v4.5"/><path d="M4.5 12h15"/><circle cx="8" cy="16.5" r="1.8"/><circle cx="16" cy="16.5" r="1.8"/>',
    travel: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5.5h6V8M4 13.5h16"/>',
    home: '<path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 10v10h11V10"/><path d="M10 20v-5h4v5"/>',
    health: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    hobbies: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-.9 1.9-1.8 0-1.4-1.3-1.8-1.3-3.1s1.1-2.1 2.4-2.1h2.2a2.8 2.8 0 0 0 2.8-2.8c0-3.9-3.6-7.2-8-7.2z"/><circle cx="7.8" cy="11" r="0.9"/><circle cx="10" cy="7.6" r="0.9"/><circle cx="14.2" cy="7.6" r="0.9"/>',
    other: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    custom: '<path d="M3.5 11.8V4.5a1 1 0 0 1 1-1h7.3l8.7 8.7-8.3 8.3z"/><circle cx="8" cy="8" r="1.3"/>'
  };

  /* Names that mean one of the drawings above, whatever the category was
     called when it was made. */
  var ICON_NAMES = {
    car: 'car', auto: 'car', petrol: 'car', fuel: 'car',
    hobby: 'hobbies', hobbies: 'hobbies',
    food: 'food', groceries: 'food', restaurants: 'food',
    shopping: 'shopping', clothes: 'shopping',
    travel: 'travel', trips: 'travel', holidays: 'travel',
    home: 'home', rent: 'home', bills: 'home',
    health: 'health', pharmacy: 'health', sport: 'health', gym: 'health',
    transport: 'transport', 'going out': 'going-out', fun: 'going-out'
  };

  function iconKey(catId) {
    if (ICONS[catId] && catId !== 'custom') return catId;
    var cat = findCategory(catId);
    var name = cat ? cat.name.toLowerCase().trim() : '';
    return ICON_NAMES[name] || 'custom';
  }

  function icon(catId) {
    return '<svg class="micon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[iconKey(catId)] + '</svg>';
  }

  /* Colours, for whoever switches them on --------------------------------

     Off by default, and the reason stands: measured against these card
     colours, no more than three hues stay tell-apart-able once any two
     categories can land side by side in the ring. With colour on, every
     category still keeps its name, its icon and its row in the list, so
     colour is a help to the eye and never the only way to know which is
     which.

     The hues are the eight of the documented, validated chart palette,
     one per category and fixed to it — a category keeps its colour from
     month to month however the ranking changes. */

  var CATEGORY_HUE = {
    food: 'orange', shopping: 'magenta', 'going-out': 'violet', transport: 'blue',
    car: 'blue', travel: 'aqua', home: 'yellow', health: 'red', hobbies: 'green'
  };

  var HUE_ORDER = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'];

  function coloured() {
    return data().colours === 'colour';
  }

  /* A category's colour, or null for "Other" and anything past the
     eight hues — those stay grey rather than getting a ninth colour
     nobody could tell from one of the first eight. */
  function hueFor(catId) {
    if (catId === 'other' || catId === '__rest') return null;
    var name = CATEGORY_HUE[iconKey(catId)];
    if (!name) {
      var list = data().categories.filter(function (c) { return !CATEGORY_HUE[iconKey(c.id)] && c.id !== 'other'; });
      var at = list.findIndex(function (c) { return c.id === catId; });
      name = at >= 0 && at < HUE_ORDER.length ? HUE_ORDER[at] : null;
    }
    if (!name) return null;
    /* A theme variable, not a hex: the light and dark steps live in
       theme.css, so switching theme recolours the chart with no redraw. */
    return 'var(--hue-' + name + ')';
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

  /* The first day anything was written down. Before it the app was not
     in use, so a period that ends before it holds no spending to compare
     with — only an empty stretch, and "nothing spent last year" said
     about a year nobody was counting reads as a fact when it is not. */
  function firstDay() {
    var first = null;
    data().entries.forEach(function (e) { if (!first || e.date < first) first = e.date; });
    return first;
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
  /* Two periods to set side by side: the one on screen, and the one
     `back` steps before it. When the one on screen is still running,
     both are cut to the same number of days — see comparison(). */
  function pair(which, off, back) {
    var now = range(which, off);
    var other = range(which, off - back);
    var today = Storage.today();
    var partial = now.from <= today && today < now.to;

    if (partial) {
      var elapsed = Math.round((parse(today) - parse(now.from)) / 86400000);
      var cut = parse(other.from);
      cut.setDate(cut.getDate() + elapsed);
      var cutKey = Storage.dateKey(cut);
      other = { from: other.from, to: cutKey < other.to ? cutKey : other.to };
      now = { from: now.from, to: today };
    }

    return { now: now, other: other, partial: partial };
  }

  function comparison(which, off) {
    var p = pair(which, off, 1);
    var a = sum(within(p.now));
    var b = sum(within(p.other));
    var partial = p.partial;

    var word = { day: 'day', week: 'week', month: 'month', year: 'year' }[which];
    /* Worded to fit all three sentences below: "48% more than at this
       point last month", "Nothing spent the week before", "The same as
       the day before". */
    var against = partial
      ? 'at this point last ' + word
      : 'the ' + word + ' before';

    if (!b && !a) return null;
    var first = firstDay();
    if (!b && (!first || p.other.to < first)) return null;
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

  /* Mono: one grey per piece, spread evenly from light grey to near black
     (near white in the dark theme) over however many pieces there are —
     so each category has a shade of its own. Handed out alternately from
     the light and the dark half, so any two neighbours in the ring —
     the last and the first too, where they meet at twelve o'clock — are
     far apart; not light-to-dark by size, since the size is already the
     size. The two ends come from the theme (--viz-lo, --viz-hi), so the
     shades follow light and dark without a redraw. */
  function toneFor(index, count) {
    if (count < 2) return 'color-mix(in srgb, var(--viz-lo) 50%, var(--viz-hi))';
    var half = Math.ceil(count / 2);
    var step = index % 2 === 0 ? index / 2 : half + (index - 1) / 2;
    var pct = Math.round((step / (count - 1)) * 100);
    return 'color-mix(in srgb, var(--viz-hi) ' + pct + '%, var(--viz-lo))';
  }

  function ringSvg(ring, total, focusId) {
    var size = (R + STROKE) * 2;
    var c = size / 2;
    var circ = 2 * Math.PI * R;

    if (!total) {
      return '<svg class="mring" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<circle cx="' + c + '" cy="' + c + '" r="' + R + '" class="mring__empty"/></svg>';
    }

    var start = 0;
    var parts = ring.map(function (slice, i) {
      var share = slice.cents / total;
      var len = share * circ;
      /* A 2.5px gap of card colour between pieces, taken out of the
         piece itself, so the pieces still add up to the whole circle. */
      var gap = ring.length > 1 ? Math.min(GAP, len * 0.4) : 0;
      var dash = Math.max(0.01, len - gap);
      var el = '<circle cx="' + c + '" cy="' + c + '" r="' + R + '"' +
        ' class="mring__slice' + (slice.id === focusId ? ' is-focus' : '') + '"' +
        ' style="--tone:' + (coloured() ? (hueFor(slice.id) || 'var(--viz-t2)') : toneFor(i, ring.length)) + '"' +
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
        ' data-pick="' + escapeHtml(c.id) + '" aria-pressed="' + (c.id === picked) + '"' +
        (coloured() && hueFor(c.id) ? ' style="--hue:' + hueFor(c.id) + '"' : '') + '>' + icon(c.id) +
        escapeHtml(c.name) + '</button>';
    }).join('');

    var todays = sum(within({ from: Storage.today(), to: Storage.today() }));
    document.getElementById('money-today').textContent = todays
      ? 'Today so far: ' + format(todays)
      : '';

    var cur = document.getElementById('money-currency');
    if (document.activeElement !== cur) cur.value = data().currency;

    document.querySelectorAll('[data-mcolours]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mcolours') === (coloured() ? 'colour' : 'mono'));
    });

    var edit = document.getElementById('money-edit');
    edit.hidden = !editing;
    var toggle = document.getElementById('money-edit-toggle');
    toggle.querySelector('.mtool__label').textContent = editing ? 'Done' : 'Edit categories';
    toggle.classList.toggle('is-on', editing);

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

    /* What is pointed at is a category, and only that one row lights up.

       The small categories folded into the ring's "N more" piece used to
       share that piece's id in the list too, so pointing at any one of
       them lit up all of them at once — it looked as if they had been
       merged. Now a row stands for its own category; the ring, which only
       has the one piece for them, highlights that piece, and the centre
       gives the pointed-at category's own share. Pointing at the "N more"
       piece itself still lights all its rows, because that piece is them. */
    var inTail = {};
    (s.tail || []).forEach(function (t) { inTail[t.id] = true; });
    function sliceOf(id) { return inTail[id] ? '__rest' : id; }

    var known = focus === '__rest' ? !!s.tail : s.all.some(function (x) { return x.id === focus; });
    var focusCat = focus && known ? focus : (s.ring[0] ? s.ring[0].id : null);
    var focusId = focusCat ? sliceOf(focusCat) : null;
    var focused = focusCat === '__rest'
      ? s.ring.filter(function (x) { return x.id === '__rest'; })[0]
      : s.all.filter(function (x) { return x.id === focusCat; })[0];

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

    /* Only a piece being pointed at is marked. At rest the centre still
       names the biggest, but nothing is lit — lighting it looked as if
       the pointer were still resting on it. */
    var pointing = focus !== null && known;
    document.getElementById('money-ring').innerHTML = ringSvg(s.ring, total, pointing ? focusId : null);

    /* With colours on, pointing at a category fades the others rather
       than painting the chosen one black — the colour is what the person
       asked to see. */
    var summaryEl = document.getElementById('money-summary');
    summaryEl.classList.toggle('is-colour', coloured());
    summaryEl.classList.toggle('is-pointing', pointing);

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

    /* Each row wears the grey of its piece of the ring — the dot and the
       bar — so the two can be matched by eye without pointing at
       anything. The name itself stays in ordinary ink. */
    var tones = {};
    s.ring.forEach(function (x, i) {
      tones[x.id] = coloured() ? (hueFor(x.id) || 'var(--viz-t2)') : toneFor(i, s.ring.length);
    });

    list.innerHTML = s.all.map(function (row) {
      var sliceId = sliceOf(row.id);
      var share = Math.round((row.cents / total) * 100);
      var lit = pointing && (row.id === focusCat || (focusCat === '__rest' && inTail[row.id]));
      return '<button class="msplit' + (lit ? ' is-focus' : '') + '" type="button"' +
        ' style="--tone:' + tones[sliceId] + '"' +
        ' data-slice="' + escapeHtml(row.id) + '">' +
        '<span class="msplit__name">' + icon(row.id) +
          escapeHtml(row.name) + '</span>' +
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

    /* Nothing spent in any of them: no bars to point at, and no line of
       month names reading out zeroes as the pointer passes over empty
       space — which was all a new user saw of this card. */
    if (!max) {
      document.getElementById('money-bars').innerHTML = '<p class="mtrend__empty">Nothing spent yet</p>';
      document.getElementById('money-read').textContent = '';
      return;
    }

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

  /* The list of purchases: how it is sorted, and whether it is showing
     everything or only the first few. A year of coffees made the page
     scroll for ever. */
  var LIST_SHORT = 5;
  var listSort = 'date';
  var listAll = false;

  function renderEntries() {
    var r = range(scope, offset);
    /* Newest first, or largest first. Within one day, the order they were
       written down in, reversed — taken from their place in the list, not
       from the id, because ids compared as text put "m-9" after "m-10". */
    var all = data().entries;
    var entries = within(r).slice().sort(function (a, b) {
      if (listSort === 'amount' && a.cents !== b.cents) return b.cents - a.cents;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return all.indexOf(b) - all.indexOf(a);
    });

    document.querySelectorAll('[data-msort]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-msort') === listSort);
    });

    var shown = listAll ? entries : entries.slice(0, LIST_SHORT);
    var more = entries.length > LIST_SHORT
      ? '<button class="picker__more mlist__more" type="button" id="money-more" aria-expanded="' + listAll + '">' +
        (listAll ? 'Show fewer' : 'Show all ' + entries.length) + '</button>'
      : '';
    entries = shown;

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
            '<span class="mrow__cat">' + icon(e.cat) + escapeHtml(categoryName(e.cat)) + '</span>' +
            (e.note ? '<span class="mrow__note">' + escapeHtml(e.note) + '</span>' : '') +
            (e.sample ? '<span class="mrow__tag">example</span>' : '') +
          '</span>' +
          '<span class="mrow__amount">' + escapeHtml(format(e.cents)) + '</span>' +
          '<button class="task__drop" type="button" data-mdrop="' + escapeHtml(e.id) + '" aria-label="Delete">&#215;</button>' +
        '</li>';
      }).join('') + '</ul>' + more + undoHtml;
    }

    var u = document.getElementById('money-undo');
    if (u) u.addEventListener('click', undoRemove);

    var m = document.getElementById('money-more');
    if (m) {
      m.addEventListener('click', function () {
        listAll = !listAll;
        renderEntries();
      });
    }
  }

  /* Two periods, category by category -----------------------------------

     "Where did more go, and where less" is a question about categories,
     not about the total: the total can hold level while shopping doubles
     and food halves. So each category gets its own line with both
     amounts and the change.

     Sorted and sized by the change in money, not in percent. +200% on a
     three-euro coffee habit is noise beside +15% on rent; the percent is
     still there in words, but the order and the bars follow what the
     change actually cost. */

  /* Always months — or years, when the page is on Year. Comparing one
     week with another said little: a week is too short for spending to
     settle, and one dinner out decides the result. So whatever the page
     is set to, this card compares the month it falls in. */
  var LOOKBACK = { month: 12, year: 5 };

  function compareBase() {
    if (scope === 'year') return { which: 'year', off: offset };
    if (scope === 'month') return { which: 'month', off: offset };
    var from = parse(range(scope, offset).from);
    var now = parse(Storage.today());
    return {
      which: 'month',
      off: (from.getFullYear() * 12 + from.getMonth()) - (now.getFullYear() * 12 + now.getMonth())
    };
  }

  /* The list of months to compare with, drawn like the months of the
     calendar's year view — the same pills, stacked top to bottom — with
     the year written above each run of months, instead of the system's
     own drop-down list. */
  /* Only periods something was spent in. An empty one offers nothing to
     compare with, and a year from before the app was in use would fill
     the table with zeros and "new" beside every line. */
  function choices(base) {
    var out = [];
    for (var k = 1; k <= LOOKBACK[base.which]; k++) {
      if (within(range(base.which, base.off - k)).length) out.push(k);
    }
    return out;
  }

  function renderPicker(base, ks) {
    var btn = document.getElementById('money-against-btn');
    var panel = document.getElementById('money-against-panel');

    btn.textContent = title(base.which, range(base.which, base.off - back));

    var html = '';
    var lastYear = null;
    ks.forEach(function (k) {
      var r = range(base.which, base.off - k);
      var y = r.from.slice(0, 4);
      if (base.which === 'month' && y !== lastYear) {
        html += '<p class="mpick__year">' + y + '</p>';
        lastYear = y;
      }
      var name = base.which === 'month' ? MONTHS[parse(r.from).getMonth()] : y;
      html += '<button class="mpick__opt' + (k === back ? ' is-on' : '') + '" type="button"' +
        ' role="option" aria-selected="' + (k === back) + '" data-back="' + k + '">' +
        escapeHtml(name) + '</button>';
    });
    panel.innerHTML = html;
  }

  function renderCompare() {
    var base = compareBase();
    var ks = choices(base);
    var card = document.getElementById('money-against-card');
    /* Nothing earlier to compare with — the first month, or the first
       year, of using the app: no card, rather than a table of zeros. */
    card.hidden = !ks.length;
    if (!ks.length) return;
    if (ks.indexOf(back) < 0) back = ks[0];
    renderPicker(base, ks);

    var p = pair(base.which, base.off, back);
    var nowBy = {};
    var thenBy = {};
    within(p.now).forEach(function (e) { nowBy[e.cat] = (nowBy[e.cat] || 0) + e.cents; });
    within(p.other).forEach(function (e) { thenBy[e.cat] = (thenBy[e.cat] || 0) + e.cents; });

    var ids = {};
    Object.keys(nowBy).forEach(function (id) { ids[id] = true; });
    Object.keys(thenBy).forEach(function (id) { ids[id] = true; });

    var rows = Object.keys(ids).map(function (id) {
      var a = nowBy[id] || 0;
      var b = thenBy[id] || 0;
      return { id: id, name: categoryName(id), now: a, then: b, diff: a - b };
    }).sort(function (x, y) { return Math.abs(y.diff) - Math.abs(x.diff); });

    var totalNow = sum(within(p.now));
    var totalThen = sum(within(p.other));
    var sumEl = document.getElementById('money-against-sum');

    /* Said with the actual dates. "Both cut to the same 29 days" was
       correct and meant nothing to anyone reading it; "Sep 1–29 against
       Aug 1–29" says the same thing in a form that needs no explaining. */
    var shownName = base.which === 'month'
      ? MONTHS[parse(p.now.from).getMonth()]
      : p.now.from.slice(0, 4);
    /* Comparing years, both spans have the same dates, so the year is
       what tells them apart. */
    var withYear = base.which === 'year';
    var note = p.partial
      ? spanLabel(p.now, withYear) + ' against ' + spanLabel(p.other, withYear) +
        ', since ' + shownName + ' is not over yet'
      : '';

    if (!rows.length) {
      sumEl.textContent = '';
      document.getElementById('money-diff').innerHTML =
        '<p class="soft">Nothing spent in either — nothing to compare.</p>';
      return;
    }

    var d = totalNow - totalThen;
    sumEl.textContent = (d === 0 ? 'The same in total'
      : (d > 0 ? format(d) + ' more' : format(-d) + ' less') + ' in total' +
        (totalThen ? ' (' + (d > 0 ? '+' : '−') + Math.abs(Math.round((d / totalThen) * 100)) + '%)' : '')) +
      (note ? ' · ' + note : '');

    var maxDiff = 0;
    rows.forEach(function (r) { if (Math.abs(r.diff) > maxDiff) maxDiff = Math.abs(r.diff); });

    var head = '<div class="mdiff mdiff--head">' +
      '<span></span>' +
      '<span class="mdiff__num">' + escapeHtml(shortTitle(base.which, p.now)) + '</span>' +
      '<span class="mdiff__num">' + escapeHtml(shortTitle(base.which, range(base.which, base.off - back))) + '</span>' +
      '<span></span><span></span></div>';

    document.getElementById('money-diff').innerHTML = head + rows.map(function (r) {
      var change;
      var pct = r.then ? Math.round((r.diff / r.then) * 100) : 0;
      if (!r.then) change = 'new';
      else if (!r.now) change = 'nothing now';
      /* A euro and a half either way on the rent is not "0% less". */
      else if (pct === 0) change = 'about the same';
      else change = Math.abs(pct) + '% ' + (r.diff > 0 ? 'more' : 'less');

      /* Direction carries the sign — right is more, left is less — so
         no colour is needed for it, and the words say it again. */
      var len = maxDiff ? Math.round((Math.abs(r.diff) / maxDiff) * 50) : 0;
      var bar = r.diff === 0 ? ''
        : '<span class="mdiff__fill ' + (r.diff > 0 ? 'is-up' : 'is-down') + '" style="width:' + len + '%"></span>';

      var up = r.then ? pct > 0 : r.now > 0;
      var down = r.then ? pct < 0 : false;
      var arrow = up ? '&#8593; ' : down ? '&#8595; ' : '';

      return '<div class="mdiff">' +
        '<span class="mdiff__name">' + icon(r.id) + escapeHtml(r.name) + '</span>' +
        '<span class="mdiff__num">' + escapeHtml(format(r.now)) + '</span>' +
        '<span class="mdiff__num mdiff__then">' + escapeHtml(format(r.then)) + '</span>' +
        '<span class="mdiff__bar" aria-hidden="true">' + bar + '</span>' +
        '<span class="mdiff__change">' + arrow + escapeHtml(change) + '</span>' +
      '</div>';
    }).join('');
  }

  /* "Sep 1–29", or "Jan 1 – Sep 29" when the span crosses months. */
  function spanLabel(r, withYear) {
    var a = parse(r.from);
    var b = parse(r.to);
    var year = withYear ? ' ' + b.getFullYear() : '';
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return SHORT[a.getMonth()] + ' ' + a.getDate() + (a.getDate() === b.getDate() ? '' : '–' + b.getDate()) + year;
    }
    return SHORT[a.getMonth()] + ' ' + a.getDate() + ' – ' + SHORT[b.getMonth()] + ' ' + b.getDate() + year;
  }

  /* A column heading short enough for a narrow column. */
  function shortTitle(which, r) {
    var from = parse(r.from);
    if (which === 'day') return SHORT[from.getMonth()] + ' ' + from.getDate();
    if (which === 'week') return SHORT[from.getMonth()] + ' ' + from.getDate();
    if (which === 'month') return SHORT[from.getMonth()] + ' ' + String(from.getFullYear()).slice(2);
    return String(from.getFullYear());
  }

  /* Example data ---------------------------------------------------------

     A chart with nothing in it shows nothing about how it works. This
     fills the last five months with made-up but plausible spending so
     the ring, the bars and the comparison can be seen doing their job.

     Every example entry is marked, so "Remove example data" takes out
     exactly those and never touches a real one. Seeded, so it comes out
     the same every time. */

  function hasExample() {
    return data().entries.some(function (e) { return e.sample; });
  }

  function hasReal() {
    return data().entries.some(function (e) { return !e.sample; });
  }

  function loadExample() {
    var seed = 20260929;
    function rand() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    function between(lo, hi) { return Math.round((lo + rand() * (hi - lo)) * 100); }

    var ids = {};
    data().categories.forEach(function (c) { ids[c.id] = true; });
    function cat(id) { return ids[id] ? id : (liveCategories()[0] || {}).id; }

    var today = parse(Storage.today());
    var start = new Date(today.getFullYear(), today.getMonth() - 4, 1);
    var stamp = Date.now();
    var n = 0;
    var entries = data().entries;

    function put(date, id, cents, note) {
      entries.push({ id: 'm-ex-' + stamp + '-' + (n++), date: Storage.dateKey(date), cat: cat(id),
        cents: cents, note: note || '', sample: true });
    }

    for (var d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      var dow = (d.getDay() + 6) % 7;
      var dom = d.getDate();
      /* Spending creeps up over the five months, so the arrows and the
         comparison have a direction to show. */
      var drift = 1 + (d - start) / (today - start || 1) * 0.35;

      if (dom === 1) put(d, 'home', 45000, 'Rent');
      if (dom === 15) put(d, 'home', between(55, 80), 'Electricity & internet');
      if (dom === 2) put(d, 'transport', 4900, 'Monthly ticket');

      if (rand() < 0.62) put(d, 'food', Math.round(between(3, 14) * drift), rand() < 0.5 ? 'Coffee' : 'Lunch');
      if (dow === 5 || (dow === 2 && rand() < 0.4)) put(d, 'food', between(28, 62), 'Groceries');
      if ((dow >= 4 && rand() < 0.55) || rand() < 0.08) {
        put(d, 'going-out', Math.round(between(9, 38) * drift), rand() < 0.5 ? 'Drinks' : 'Cinema');
      }
      if (rand() < 0.09) put(d, 'shopping', Math.round(between(15, 85) * drift), rand() < 0.5 ? 'Clothes' : 'Online order');
      if (rand() < 0.04) put(d, 'health', between(6, 32), 'Pharmacy');
      if (rand() < 0.05) put(d, 'transport', between(3, 18), 'Taxi');
      if (rand() < 0.03) put(d, 'other', between(4, 25));
    }

    /* One trip, in the second month. */
    var trip = new Date(start.getFullYear(), start.getMonth() + 1, 18);
    put(trip, 'travel', 18900, 'Train tickets');
    put(new Date(trip.getFullYear(), trip.getMonth(), 19), 'travel', 26400, 'Hotel');

    Storage.save();
  }

  function removeExample() {
    var m = data();
    m.entries = m.entries.filter(function (e) { return !e.sample; });
    Storage.save();
  }

  function renderExampleControls() {
    var load = document.getElementById('money-example');
    var note = document.getElementById('money-example-note');
    var ex = hasExample();

    /* Offered only while there is nothing real to look at: once there
       is, example data would only muddy it. */
    load.hidden = ex || hasReal();
    note.hidden = !ex;
  }

  var listFor = null;

  function render() {
    if (!document.getElementById('money-view')) return;
    /* A new period starts with the list folded again; adding a purchase
       to the one already open leaves it as it was. */
    if (listFor !== scope + offset) { listAll = false; listFor = scope + offset; }
    renderEntry();
    renderPeriod();
    renderSummary();
    renderTrend();
    renderCompare();
    renderEntries();
    renderExampleControls();
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
        back = 1;
        focus = null;
        render();
      });
    });

    var pickBtn = document.getElementById('money-against-btn');
    var pickPanel = document.getElementById('money-against-panel');

    function openPicker(open) {
      pickPanel.hidden = !open;
      pickBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var on = pickPanel.querySelector('.is-on');
        if (on) { on.focus(); on.scrollIntoView({ block: 'nearest' }); }
      }
    }

    pickBtn.addEventListener('click', function () { openPicker(pickPanel.hidden); });

    pickPanel.addEventListener('click', function (event) {
      var opt = event.target.closest('[data-back]');
      if (!opt) return;
      back = Number(opt.getAttribute('data-back')) || 1;
      openPicker(false);
      renderCompare();
      pickBtn.focus();
    });

    /* Closes on a click anywhere else, or on Escape — the two ways
       anybody expects a list like this to go away. */
    document.addEventListener('click', function (event) {
      if (!pickPanel.hidden && !event.target.closest('#money-against')) openPicker(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !pickPanel.hidden) { openPicker(false); pickBtn.focus(); }
    });

    document.getElementById('money-example').addEventListener('click', function () {
      loadExample();
      render();
    });

    /* No "are you sure": only the made-up entries go, and they can be
       brought back from the same place while nothing real is written. */
    document.getElementById('money-example-drop').addEventListener('click', function () {
      removeExample();
      render();
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

    /* Pointing is temporary. Once the pointer leaves — or the keyboard
       focus moves out — the highlight goes away and the centre goes back
       to the biggest piece, rather than staying stuck on whatever was last
       passed over on the way out. */
    function release() {
      if (focus === null) return;
      focus = null;
      renderSummary();
    }
    summary.addEventListener('mouseleave', release);
    summary.addEventListener('focusout', function (event) {
      if (!summary.contains(event.relatedTarget)) release();
    });

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

    document.querySelectorAll('[data-msort]').forEach(function (b) {
      b.addEventListener('click', function () {
        listSort = this.getAttribute('data-msort');
        renderEntries();
      });
    });

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

    document.querySelectorAll('[data-mcolours]').forEach(function (b) {
      b.addEventListener('click', function () {
        data().colours = this.getAttribute('data-mcolours');
        Storage.save();
        render();
      });
    });

    cur.addEventListener('change', function () {
      data().currency = this.value;
      Storage.save();
      render();
    });
  }

  return { start: start, render: render, parseAmount: parseAmount };
})();
