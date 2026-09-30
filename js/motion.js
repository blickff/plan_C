/* Motion ---------------------------------------------------------------

   How the app moves. One set of rules for all of it, so it feels like one
   thing rather than a collection of effects:

   - Motion explains something: where a thing came from, what changed,
     what was pressed. Nothing moves for its own sake.
   - It is quick. A press answers in about a tenth of a second, a switch
     in a fifth, a new page in about a third. Nothing waits on it.
   - One character throughout: things decelerate into place (the curve
     below), and only small confirmations overshoot a touch.
   - Only opacity and transforms are animated, so it stays smooth.

   What moves: the page on switching sections, the rail's highlight and
   every segmented switch's bubble sliding to the choice, the theme
   spreading as a circle from where it was pressed, habit bars filling and
   a finished tile's pop, numbers counting to their new value, the
   calendar turning in the direction of the arrow, a new task or purchase
   arriving in its list, the dashboard's cards on opening the app, and a
   slight give under anything pressed.

   The person decides (Settings → Motion): follow the system, which may
   ask apps to keep still, always on, or off. The choice lands on the page
   as data-motion="full" or "reduced"; the CSS and everything below read
   that. */

var Motion = (function () {
  var EASE = 'cubic-bezier(0.2, 0, 0, 1)';
  var media = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function choice() {
    try { return Storage.load().settings.motion || 'auto'; } catch (err) { return 'auto'; }
  }

  function on() {
    var c = choice();
    if (c === 'on') return true;
    if (c === 'off') return false;
    return !(media && media.matches);
  }

  function apply() {
    document.documentElement.setAttribute('data-motion', on() ? 'full' : 'reduced');
    document.querySelectorAll('[data-motion-set]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-motion-set') === choice());
    });
  }

  function set(c) {
    Storage.load().settings.motion = c;
    Storage.save();
    apply();
  }

  /* Once an animation class has done its job it comes off, so it can play
     again next time and never sits on the element holding a transform. */
  function play(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    el.getBoundingClientRect();
    el.classList.add(cls);
    el.addEventListener('animationend', function done(event) {
      if (event.target !== el) return;
      el.classList.remove(cls);
      el.removeEventListener('animationend', done);
    });
  }

  /* Bubbles: one under the chosen button of every segmented switch, and
     one on the rail under the open section. They slide from choice to
     choice. Most switches are redrawn wholesale when the page updates, so
     where each one's bubble last stood is kept by the kind of switch, and
     a redrawn bubble starts from there. */
  var lastAt = {};

  function keyOf(seg) {
    if (seg.id) return seg.id;
    var b = seg.querySelector('.seg__btn');
    if (!b) return null;
    return Array.prototype.filter.call(b.attributes, function (a) {
      return a.name.indexOf('data-') === 0;
    }).map(function (a) { return a.name; }).join(',') || null;
  }

  function slide(thumb, box, key) {
    var pos = box ? [box.x, box.y, box.w, box.h].join(',') : '';
    if (!box) { thumb.style.opacity = '0'; thumb.dataset.pos = ''; return; }
    if (thumb.dataset.pos === pos) return;
    var from = thumb.dataset.pos || (key && lastAt[key]) || '';
    if (!from || !on()) {
      thumb.style.transition = 'none';
    } else if (!thumb.dataset.pos) {
      var p = from.split(',');
      thumb.style.transition = 'none';
      thumb.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px)';
      thumb.style.width = p[2] + 'px';
      thumb.style.height = p[3] + 'px';
      thumb.getBoundingClientRect();
      thumb.style.transition = '';
    }
    thumb.style.transform = 'translate(' + box.x + 'px,' + box.y + 'px)';
    thumb.style.width = box.w + 'px';
    thumb.style.height = box.h + 'px';
    thumb.style.opacity = '1';
    if (thumb.style.transition === 'none') {
      thumb.getBoundingClientRect();
      thumb.style.transition = '';
    }
    thumb.dataset.pos = pos;
    if (key) lastAt[key] = pos;
  }

  function thumbIn(parent, cls) {
    var t = parent.querySelector(':scope > .' + cls);
    if (!t) {
      t = document.createElement('span');
      t.className = cls;
      t.setAttribute('aria-hidden', 'true');
      parent.insertBefore(t, parent.firstChild);
    }
    return t;
  }

  function placeSeg(seg) {
    if (!seg.classList.contains('has-thumb')) seg.classList.add('has-thumb');
    var thumb = thumbIn(seg, 'seg__thumb');
    var a = seg.querySelector('.seg__btn.is-active');
    if (!a || !seg.offsetWidth) return slide(thumb, null);
    slide(thumb, { x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight }, keyOf(seg));
  }

  function placeRail() {
    var rail = document.querySelector('.rail');
    if (!rail) return;
    if (!rail.classList.contains('has-ind')) rail.classList.add('has-ind');
    var ind = thumbIn(rail, 'rail__ind');
    var a = rail.querySelector('.nav__item.is-active');
    if (!a) return slide(ind, null);
    var r = rail.getBoundingClientRect();
    var b = a.getBoundingClientRect();
    slide(ind, { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height) }, 'rail');
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      document.querySelectorAll('.seg').forEach(placeSeg);
      placeRail();
    });
  }

  /* Numbers count to their new value instead of jumping: the money total,
     the streak. Eased out, about half a second. */
  function count(el, from, to, format) {
    if (!el) return;
    var id = (el._countId || 0) + 1;
    el._countId = id;
    if (!on() || from === null || from === undefined || from === to) {
      el.textContent = format(to);
      return;
    }
    var start = performance.now();
    var ms = 520;
    function step(now) {
      if (el._countId !== id) return;
      var t = Math.min(1, (now - start) / ms);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = format(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    }
    el.textContent = format(from);
    requestAnimationFrame(step);
  }

  /* A list that gains one row — a task written, a purchase added — shows
     that row arriving. Rows are told apart by their text; only a single
     new row counts, so switching the day or the month (a whole new list)
     does not set everything moving at once. */
  function watchList(el, rowSelector) {
    if (!el) return;
    var seen = null;
    function sigs() {
      return Array.prototype.map.call(el.querySelectorAll(rowSelector), function (r) { return r.textContent; });
    }
    new MutationObserver(function () {
      var rows = el.querySelectorAll(rowSelector);
      var now = sigs();
      if (seen && on() && now.length === seen.length + 1) {
        var fresh = [];
        now.forEach(function (s, i) { if (seen.indexOf(s) === -1) fresh.push(rows[i]); });
        if (fresh.length === 1) play(fresh[0], 'is-new');
      }
      seen = now;
    }).observe(el, { childList: true, subtree: true });
    seen = sigs();
  }

  /* The theme spreads as a circle from where it was pressed. */
  function reveal(event, change) {
    if (!on() || !document.startViewTransition) { change(); return; }
    var x = event && event.clientX ? event.clientX : window.innerWidth / 2;
    var y = event && event.clientY ? event.clientY : window.innerHeight / 2;
    var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    var t = document.startViewTransition(change);
    t.ready.then(function () {
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 560, easing: EASE, pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () { /* the change has still happened */ });
  }

  /* The dashboard's cards arrive in a short wave on opening the app. */
  function arrive() {
    if (!on()) return;
    document.querySelectorAll('#board > [data-block]').forEach(function (b, i) {
      b.style.animationDelay = (i * 60) + 'ms';
      play(b, 'is-arriving');
    });
  }

  function start() {
    apply();
    if (media && media.addEventListener) media.addEventListener('change', apply);

    document.querySelectorAll('[data-motion-set]').forEach(function (b) {
      b.addEventListener('click', function () { set(b.getAttribute('data-motion-set')); });
    });

    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'attributes' || m.addedNodes.length) { schedule(); return; }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    window.addEventListener('resize', schedule);
    schedule();

    watchList(document.getElementById('tasks'), '.task');
    watchList(document.getElementById('countdowns'), '.cd');
    watchList(document.getElementById('money-list'), '.mrow');
  }

  return { on: on, start: start, play: play, count: count, reveal: reveal, arrive: arrive, apply: apply };
})();
