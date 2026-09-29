/* A date box in the app's own style ------------------------------------

   The browser's date field opens the system's calendar: square, blue,
   in Windows' font, with a "Clear" that leaves the box empty — nothing
   else on the page looks like it. This keeps the field (so everything
   that reads or sets its .value is untouched) but hides it, and puts a
   button in its place that opens a small calendar drawn like the rest of
   the app, about the size of the system one.

   The field's .value is wrapped, so a date set from code — "Today",
   "Tomorrow", the day the page is looking at — shows on the button at
   once without anyone having to call anything. */

var DatePick = (function () {
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var HEADS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  var native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var current = null;   // the one that is open, if any

  function parse(key) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    return p ? new Date(+p[1], +p[2] - 1, +p[3]) : null;
  }

  function keyOf(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function label(key) {
    var d = parse(key);
    if (!d) return 'Pick a date';
    var year = d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '';
    return DAYS[d.getDay()] + ', ' + SHORT[d.getMonth()] + ' ' + d.getDate() + year;
  }

  var ICON = '<svg class="dpick__ic" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>';

  function enhance(input) {
    if (input.dataset.dpick) return;
    input.dataset.dpick = '1';

    var wrap = document.createElement('span');
    wrap.className = 'dpick';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.type = 'hidden';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'input input--date dpick__btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', input.getAttribute('aria-label') || 'Date');
    wrap.appendChild(btn);

    var pop = document.createElement('div');
    pop.className = 'dpick__pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose a date');
    pop.hidden = true;
    wrap.appendChild(pop);

    var shown = null;    // first of the month on show
    var focusKey = null; // the day the keyboard is on

    function refresh() {
      btn.innerHTML = ICON + '<span>' + label(native.get.call(input)) + '</span>';
    }

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return native.get.call(input); },
      set: function (v) { native.set.call(input, v); refresh(); }
    });

    function set(key) {
      input.value = key;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function render() {
      var today = keyOf(new Date());
      var chosen = native.get.call(input);
      var y = shown.getFullYear();
      var m = shown.getMonth();
      /* Weeks start on Monday, as on the dashboard's calendar. */
      var lead = (new Date(y, m, 1).getDay() + 6) % 7;
      var start = new Date(y, m, 1 - lead);

      var cells = '';
      for (var i = 0; i < 42; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        var k = keyOf(d);
        var cls = 'dpick__day' +
          (d.getMonth() !== m ? ' is-out' : '') +
          (k === today ? ' is-today' : '') +
          (k === chosen ? ' is-on' : '');
        cells += '<button type="button" class="' + cls + '" data-key="' + k + '"' +
          ' tabindex="' + (k === focusKey ? '0' : '-1') + '"' +
          ' aria-label="' + label(k) + '"' + (k === chosen ? ' aria-pressed="true"' : '') + '>' +
          d.getDate() + '</button>';
      }

      pop.innerHTML =
        '<div class="dpick__head">' +
          '<p class="dpick__title">' + MONTHS[m] + ' ' + y + '</p>' +
          '<button type="button" class="dpick__nav" data-step="-1" aria-label="Previous month">&#8249;</button>' +
          '<button type="button" class="dpick__nav" data-step="1" aria-label="Next month">&#8250;</button>' +
        '</div>' +
        '<div class="dpick__grid">' +
          HEADS.map(function (h) { return '<span class="dpick__dow">' + h + '</span>'; }).join('') +
          cells +
        '</div>' +
        '<div class="dpick__foot">' +
          '<button type="button" class="chipbtn" data-jump="today">Today</button>' +
          '<button type="button" class="chipbtn" data-jump="tomorrow">Tomorrow</button>' +
        '</div>';
    }

    /* Below the button, or above it when the window has no room below;
       right edges lined up, so it never runs off the right-hand side. */
    function place() {
      pop.classList.remove('is-up');
      var r = pop.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8 && btn.getBoundingClientRect().top > r.height + 16) {
        pop.classList.add('is-up');
      }
    }

    function open(yes) {
      if (yes) {
        if (current && current !== close) current();
        var d = parse(native.get.call(input)) || new Date();
        shown = new Date(d.getFullYear(), d.getMonth(), 1);
        focusKey = keyOf(d);
        render();
        pop.hidden = false;
        place();
        btn.setAttribute('aria-expanded', 'true');
        current = close;
        var on = pop.querySelector('[tabindex="0"]');
        if (on) on.focus();
      } else {
        close();
      }
    }

    function close() {
      if (pop.hidden) return;
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (current === close) current = null;
    }

    btn.addEventListener('click', function () { open(pop.hidden); });

    pop.addEventListener('click', function (event) {
      var step = event.target.closest('[data-step]');
      if (step) {
        shown = new Date(shown.getFullYear(), shown.getMonth() + (+step.getAttribute('data-step')), 1);
        focusKey = keyOf(shown);
        render();
        return;
      }
      var jump = event.target.closest('[data-jump]');
      var day = event.target.closest('[data-key]');
      if (jump) {
        var t = new Date();
        if (jump.getAttribute('data-jump') === 'tomorrow') t.setDate(t.getDate() + 1);
        set(keyOf(t));
      } else if (day) {
        set(day.getAttribute('data-key'));
      } else {
        return;
      }
      close();
      btn.focus();
    });

    /* Arrow keys walk the days, a week at a time up and down, turning the
       month over when they run off its edge. */
    pop.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { close(); btn.focus(); return; }
      var move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!move || !event.target.closest('[data-key]')) return;
      event.preventDefault();
      var d = parse(focusKey);
      d.setDate(d.getDate() + move);
      focusKey = keyOf(d);
      if (d.getMonth() !== shown.getMonth() || d.getFullYear() !== shown.getFullYear()) {
        shown = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      render();
      var on = pop.querySelector('[data-key="' + focusKey + '"]');
      if (on) on.focus();
    });

    document.addEventListener('mousedown', function (event) {
      if (!pop.hidden && !wrap.contains(event.target)) close();
    });

    refresh();
  }

  function start() {
    document.querySelectorAll('input.input--date').forEach(enhance);
  }

  return { start: start, enhance: enhance };
})();

DatePick.start();
