/* The match on the streak card ------------------------------------------

   A streak as a match that burns. It lights on the first day, grows as
   the streak does, and changes colour the way fire does as it gets
   hotter — orange, gold, then blue, violet, and white at a hundred:

     0            an unlit match (a curl of smoke if a streak just went out)
     1–2          a small orange flame
     3–6          a full flame
     7–13         a golden blaze, throwing sparks
     14–29        blue
     30–99        violet
     100 and on   white-hot, with a shimmer at the edge

   While today's habit is still to do, the flame — whatever its stage and
   colour — burns about a fifth dimmer; done, it is back to full. If the
   streak breaks, the match goes out and smokes for the day after, then
   is a fresh match again. Moving up a stage makes it flare once.

   Drawn in SVG with three tongues (outer, middle, core), each flickering
   on its own rhythm so it never looks like a loop, over a soft glow.
   Weekly habits count their weeks as seven days each. */

var Flame = (function () {
  var STAGES = [
    { from: 0,   key: 'out',    name: 'Unlit' },
    { from: 1,   key: 'spark',  name: 'Spark' },
    { from: 3,   key: 'flame',  name: 'Flame' },
    { from: 7,   key: 'blaze',  name: 'Blaze' },
    { from: 14,  key: 'blue',   name: 'Blue flame' },
    { from: 30,  key: 'violet', name: 'Violet flame' },
    { from: 100, key: 'white',  name: 'White-hot' }
  ];

  /* How tall the flame stands at each stage, in the drawing's units. */
  var SIZE = { out: 0, spark: 24, flame: 30, blaze: 34, blue: 36, violet: 38, white: 40 };

  var uid = 0;

  function stageIndex(days) {
    var at = 0;
    for (var i = 0; i < STAGES.length; i++) if (days >= STAGES[i].from) at = i;
    return at;
  }

  function stageOf(days) { return STAGES[stageIndex(days)]; }

  /* The next stage and how far off it is, for the line under the number. */
  function nextOf(days) {
    var i = stageIndex(days);
    var next = STAGES[i + 1];
    return next ? { stage: next, left: next.from - days } : null;
  }

  /* One tongue of flame: round at the bottom, pointed at the top, its
     base at 0,0 and its tip at 0,-1. Even on both sides — a lopsided one
     made the whole flame look pushed to the right of the match. */
  var TONGUE = 'M0,-1 C0.14,-0.75 0.47,-0.56 0.47,-0.26 C0.47,0.02 0.27,0.16 0,0.16 ' +
    'C-0.27,0.16 -0.47,0.02 -0.47,-0.26 C-0.47,-0.56 -0.14,-0.75 0,-1 Z';

  /* A thin lick of flame that rises beside the main one. */
  var LICK = 'M0,-1 C0.1,-0.7 0.3,-0.45 0.26,-0.2 C0.23,0.05 0.1,0.12 0,0.12 ' +
    'C-0.1,0.12 -0.24,0.04 -0.24,-0.2 C-0.24,-0.45 -0.08,-0.7 0,-1 Z';

  /* The match stands upright in the middle of the drawing, its head at
     HX,HY; the flame rises from the head and wraps round it — the bottom
     of the flame is thin enough to see the glowing head through, with
     the faint blue a match flame has at its root. */
  var HX = 35;
  var HY = 72;

  /* How far down the stick is black after burning so many days: a tenth
     of it on the first day, a little over half at a hundred, no further. */
  function charFor(days) {
    return Math.round(10 + (Math.min(Math.max(days, 1), 100) / 100) * 14);
  }

  /* days: the streak in days. waiting: today not done yet. wentOut: the
     streak is nought but there has been one before — true, or how many
     days that last one lasted, which sets how burnt the match is. */
  function svg(days, waiting, wentOut) {
    var id = 'flm' + (++uid);
    var stage = stageOf(days);
    var lit = stage.key !== 'out';
    /* Waiting for today does not shrink the fire or change its stage:
       it only burns about a fifth dimmer (see .is-waiting). */
    var size = SIZE[stage.key];
    var bx = HX;
    var by = HY + 3;
    /* The longer it has burned, the further the black creeps down the
       stick: a tenth of it on the first day, a little over half at a
       hundred, and no further. */
    var gone = !lit && wentOut;
    /* A match that went out is burnt as far as it had got: the days it
       burned before it went out, not a fixed amount. */
    var burned = gone ? (typeof wentOut === 'number' ? wentOut : 1) : days;
    var charred = lit || gone ? charFor(burned) : 0;
    /* How rough the flame's edge is, and at what grain: see the filter. */
    var rough = (size * 0.2).toFixed(1);
    var grain = (3.4 / Math.max(size, 1)).toFixed(3) + ' ' + (2.4 / Math.max(size, 1)).toFixed(3);
    var seed = stageIndex(days) * 7 + 3;
    /* How far the noise rises before it starts over, in the drawing's
       units: half a flame. See the engine, below. */
    var strip = Math.max(8, Math.round(size * 0.5));

    function url(name) { return 'url(#' + id + name + ')'; }

    /* Behind everything: the light the fire throws. */
    var glow = lit
      ? '<circle class="flame__glow" cx="' + bx + '" cy="' + (by - size * 0.42) + '" r="' + (size * 0.8 + 12) + '" fill="' + url('g') + '"/>'
      : '';

    /* The match, upright: the stick runs down from the head, charred
       for a little way below it once lit. */
    var match =
      '<g transform="translate(' + HX + ' ' + HY + ')">' +
        '<rect x="-2.3" y="2" width="4.6" height="42" rx="2.3" fill="' + url('w') + '"/>' +
        (charred ? '<rect x="-2.3" y="2" width="4.6" height="' + charred + '" rx="2.3" fill="' + url('c') + '"/>' : '') +
        '<ellipse class="flame__head" cx="0" cy="-0.5" rx="4.6" ry="6.2" fill="' + url('h') + '"/>' +
        (lit ? '<ellipse class="flame__ember" cx="0" cy="-1" rx="2.8" ry="3.8"/>' : '') +
        (gone ? '<ellipse class="flame__dying" cx="0.6" cy="-2.6" rx="1.9" ry="2.3"/>' : '') +
      '</g>';

    var fire = '';
    if (lit) {
      fire =
        /* The root of the flame, round the head: faint blue, blurred. */
        '<ellipse class="flame__root" cx="' + bx + '" cy="' + (by - 1) + '" rx="' + (size * 0.2 + 2) + '" ry="' + (size * 0.14 + 1.5) + '"/>' +
        '<g filter="' + url('s') + '">' +
          '<g transform="translate(' + bx + ' ' + by + ') scale(' + size + ')">' +
            /* Two licks either side, then the main body, the middle and the
               bright core. Each wrapper holds its size and place; the group
               inside it is what flickers, so the two never fight. */
            '<g transform="translate(-0.21 -0.02) scale(0.52 0.6)"><g class="flame__tongue flame__lick flame__lick--l"><path d="' + LICK + '" fill="' + url('o') + '"/></g></g>' +
            '<g transform="translate(0.21 -0.02) scale(0.52 0.6)"><g class="flame__tongue flame__lick flame__lick--r"><path d="' + LICK + '" fill="' + url('o') + '"/></g></g>' +
            '<g class="flame__tongue flame__tongue--outer"><path d="' + TONGUE + '" fill="' + url('o') + '"/></g>' +
            '<g transform="translate(0 0.04) scale(0.7)"><g class="flame__tongue flame__tongue--mid"><path d="' + TONGUE + '" fill="' + url('m') + '"/></g></g>' +
            /* A wisp breaking off the tip, so the top is not one clean point. */
            '<g transform="translate(0.06 -1.02) scale(0.2 0.28)"><g class="flame__tongue flame__wisp"><path d="' + TONGUE + '" fill="' + url('o') + '"/></g></g>' +
          '</g>' +
        '</g>' +
        '<g filter="' + url('r') + '">' +
          '<g transform="translate(' + bx + ' ' + by + ') scale(' + size + ')">' +
            '<g transform="translate(0 0.02) scale(0.36 0.42)"><g class="flame__tongue flame__tongue--core"><path d="' + TONGUE + '" fill="' + url('k') + '"/></g></g>' +
          '</g>' +
        '</g>' +
        '<g class="flame__particles"></g>';

      /* Sparks from a blaze on: embers that rise off the tip and fade. */
      if (days >= 7) {
        [[-5, 0], [4, 0.6], [-1, 1.2], [7, 1.8], [-8, 2.3]].forEach(function (s, i) {
          fire += '<circle class="flame__spark" cx="' + (bx + s[0]) + '" cy="' + (by - size * 0.7) + '" r="' + (i % 2 ? 0.9 : 1.3) + '"' +
            ' style="animation-delay:' + s[1] + 's"/>';
        });
      }
    }

    var smoke = '';
    if (gone) {
      var top = HY - 7;
      smoke =
        '<g filter="' + url('f') + '">' +
          '<g class="flame__thread">' +
            '<path d="M' + HX + ' ' + top + ' C' + (HX - 3) + ' ' + (top - 8) + ' ' + (HX + 4) + ' ' + (top - 14) + ' ' + (HX + 1) + ' ' + (top - 22) +
              ' C' + (HX - 2) + ' ' + (top - 29) + ' ' + (HX + 5) + ' ' + (top - 34) + ' ' + (HX + 3) + ' ' + (top - 42) + '"' +
              ' fill="none" stroke="' + url('t') + '" stroke-width="2.2" stroke-linecap="round"/>' +
          '</g>' +
          [0, 1.4, 2.8].map(function (delay, i) {
            return '<circle class="flame__puff" cx="' + (HX + (i - 1) * 1.5) + '" cy="' + (top - 16) + '" r="4"' +
              ' fill="' + url('p') + '" style="animation-delay:' + delay + 's"/>';
          }).join('') +
        '</g>';
    }

    return '' +
      '<svg class="flame__svg" viewBox="0 0 70 120" aria-hidden="true"' +
        ' data-lit="' + (lit ? 1 : 0) + '" data-size="' + size + '" data-bx="' + bx + '" data-by="' + by + '"' +
        ' data-strip="' + strip + '" data-stage="' + stageIndex(days) + '">' +
        '<defs>' +
          /* The fire's edge. Fractal noise pushes the outline about —
             no smooth drop, no clean line between the layers — and a
             blur melts what is left. The engine makes the noise rise
             through the flame: two copies of it climb half a cycle apart
             and are crossfaded, each weighed to nothing at the moment it
             drops back to the start, so the flow never seams or jumps
             (flame__drift, flame__drift2, flame__mix). Its strength
             breathes too (flame__warp). */
          '<filter id="' + id + 's" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feTurbulence class="flame__noise" type="fractalNoise" baseFrequency="' + grain + '" numOctaves="2" seed="' + seed + '" result="t"/>' +
            '<feOffset class="flame__drift" in="t" dx="0" dy="0" result="a"/>' +
            '<feOffset class="flame__drift2" in="t" dx="0" dy="0" result="b"/>' +
            '<feComposite class="flame__mix" in="a" in2="b" operator="arithmetic" k1="0" k2="1" k3="0" k4="0" result="n"/>' +
            '<feDisplacementMap class="flame__warp" in="SourceGraphic" in2="n" scale="' + rough + '" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
            '<feGaussianBlur in="d" stdDeviation="1"/>' +
          '</filter>' +
          '<filter id="' + id + 'r" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feTurbulence class="flame__noise" type="fractalNoise" baseFrequency="' + grain + '" numOctaves="2" seed="' + (seed + 1) + '" result="t"/>' +
            '<feOffset class="flame__drift" in="t" dx="0" dy="0" result="a"/>' +
            '<feOffset class="flame__drift2" in="t" dx="0" dy="0" result="b"/>' +
            '<feComposite class="flame__mix" in="a" in2="b" operator="arithmetic" k1="0" k2="1" k3="0" k4="0" result="n"/>' +
            '<feDisplacementMap class="flame__warp" in="SourceGraphic" in2="n" scale="' + (rough * 0.5).toFixed(1) + '" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
            '<feGaussianBlur in="d" stdDeviation="0.7"/>' +
          '</filter>' +
          '<radialGradient id="' + id + 'g"><stop offset="0" class="flame__g0"/><stop offset="1" class="flame__g1"/></radialGradient>' +
          /* The outer flame fades out at the tip and thins at the root, so
             the head shows through it. */
          '<linearGradient id="' + id + 'o" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" class="flame__o0"/><stop offset="0.5" class="flame__o1"/>' +
            '<stop offset="0.82" class="flame__o2"/><stop offset="1" class="flame__o3"/></linearGradient>' +
          '<linearGradient id="' + id + 'm" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" class="flame__m0"/><stop offset="0.6" class="flame__m1"/><stop offset="1" class="flame__m2"/></linearGradient>' +
          '<linearGradient id="' + id + 'k" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" class="flame__k0"/><stop offset="0.55" class="flame__k1"/><stop offset="1" class="flame__k2"/></linearGradient>' +
          '<linearGradient id="' + id + 'w" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0" class="flame__w0"/><stop offset="0.5" class="flame__w1"/><stop offset="1" class="flame__w2"/></linearGradient>' +
          '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" class="flame__c0"/><stop offset="0.45" class="flame__c1"/><stop offset="1" class="flame__c2"/></linearGradient>' +
          '<radialGradient id="' + id + 'h" cx="0.38" cy="0.32" r="0.75"><stop offset="0" class="flame__h0"/><stop offset="1" class="flame__h1"/></radialGradient>' +
          /* Smoke: the thread thick and grey at the head, gone by the top;
             the puffs soft all round; the noise roughens both. */
          '<linearGradient id="' + id + 't" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="flame__t0"/><stop offset="0.5" class="flame__t1"/><stop offset="1" class="flame__t2"/></linearGradient>' +
          '<radialGradient id="' + id + 'p"><stop offset="0" class="flame__p0"/><stop offset="1" class="flame__p1"/></radialGradient>' +
          '<filter id="' + id + 'f" x="-100%" y="-60%" width="300%" height="220%">' +
            '<feTurbulence class="flame__noise" type="fractalNoise" baseFrequency="0.08 0.05" numOctaves="2" seed="11" result="n"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
            '<feGaussianBlur in="d" stdDeviation="0.9"/>' +
          '</filter>' +
        '</defs>' +
        (glow ? '<g class="flame__fire">' + glow + '</g>' : '') +
        smoke +
        match +
        (fire ? '<g class="flame__fire">' + fire + '</g>' +
          '<circle class="flame__strike" cx="' + HX + '" cy="' + (HY - 2) + '" r="5"/>' : '') +
      '</svg>';
  }

  /* The whole piece for the card: the match and its classes. Moving up a
     stage since the last time this was drawn in this browser makes it
     flare once; the first time ever it only remembers. */
  function lit(days) { return stageOf(days).key !== 'out'; }

  /* What the card showed last time — lit, gone out (and after how many
     days), or a fresh match — kept per browser, so the moment it changes
     can be played once, whether it happens while you watch or while the
     app was closed. */
  function lastShown() {
    try { return window.localStorage.getItem('daybook.flameShown') || ''; } catch (err) { return ''; }
  }

  function remember(state) {
    try { window.localStorage.setItem('daybook.flameShown', state); } catch (err) { /* nothing lost */ }
  }

  /* The whole piece for the card.

     Moving up a stage makes the fire flare once. Lighting it after it
     was out plays a short scene instead of a jump: a burnt-out match
     drops away and fades, a fresh one rises in its place, a flash at its
     head as it is struck, and the fire grows out of the flash. From a
     fresh, never-lit match, just the strike and the fire. */
  /* quiet: a match drawn for show (a preview, a gallery) rather than the
     streak card's own — it neither plays a scene nor changes what the card
     remembers having shown. */
  function html(days, waiting, wentOut, quiet) {
    var stage = stageOf(days);
    var isLit = lit(days);
    var gone = !isLit && wentOut;
    var state = isLit ? 'lit' : gone ? 'gone:' + (typeof wentOut === 'number' ? wentOut : 1) : 'fresh';
    var before = quiet ? state : lastShown();
    if (!quiet) remember(state);

    var ignite = isLit && before !== '' && before !== 'lit';
    var swapFrom = ignite && before.indexOf('gone:') === 0 ? +before.slice(5) || 1 : 0;

    var flare = false;
    if (!quiet) try {
      var seen = window.localStorage.getItem('daybook.flameStage');
      var now = stageIndex(days);
      if (!ignite && seen !== null && now > +seen && !waiting) flare = true;
      window.localStorage.setItem('daybook.flameStage', String(now));
    } catch (err) { /* private window: no flare, nothing lost */ }

    var cls = 'flame flame--' + stage.key +
      (gone ? ' is-gone' : '') +
      (waiting ? ' is-waiting' : '') +
      (flare ? ' is-flare' : '') +
      (ignite ? ' is-ignite' : '') +
      (swapFrom ? ' is-swap' : '');
    var title = stage.key === 'out'
      ? (gone ? 'The match went out. Light it again today.' : 'Not lit yet — do it today to strike it.')
      : stage.name + (waiting ? ' · dimmed until today is done' : '');

    /* The old match, drawn over the new one for the swap and animated
       away; it is gone from the page once its part is over. */
    var old = swapFrom
      ? svg(0, false, swapFrom).replace('class="flame__svg"', 'class="flame__svg flame__old"')
      : '';

    return '<div class="' + cls + '" title="' + title + '">' + svg(days, waiting, wentOut) + old + '</div>';
  }

  /* The fire, alive -------------------------------------------------------

     Drawn above, the fire is a still picture. This makes it burn, frame by
     frame, for as long as it is on screen and motion is on (Settings →
     Motion); otherwise it rests and the picture stays.

     What moves, and why it does not look like a loop:
     - The noise that roughens the edge flows upward through the flame,
       like the hot air carrying it, so licks form at the root and climb
       off the tip. It is a tiled strip scrolled by exactly its own height
       and round again, so it never jumps.
     - A wind made of a few slow waves of unrelated lengths leans the
       flame now one way, now the other; the inner layers follow a moment
       late, as a real flame's do.
     - Each tongue flickers on its own mix of quicker waves; the side
       licks stretch up now and then; a wisp keeps breaking off the tip
       and melting away.
     - The glow, the root and the ember in the head breathe with it.
     - Sparks, from a blaze on, are particles: set off at random moments,
       lifted by the heat, carried by the wind, burning out on the way up.
       Hotter stages throw more.
     - The pointer is air moving: pass it beside the flame and the flame
       bends away from it and stands a little taller.
     - Waiting for today, all of it is calmer and quieter.

     Sums of sines at unrelated frequencies stand in for noise: smooth,
     cheap, and they do not visibly repeat. */

  var Engine = (function () {
    var states = new WeakMap();
    var flames = [];
    var lastScan = 0;
    var last = 0;
    var queued = false;
    var SPARKS_PER_SECOND = [0, 0, 0, 1.4, 1.8, 2.3, 2.9];

    function wave(t, s) {
      return Math.sin(t + s) * 0.5 + Math.sin(t * 1.63 + s * 1.7) * 0.3 + Math.sin(t * 2.71 + s * 2.3) * 0.2;
    }

    function alive() {
      return (typeof Motion === 'undefined' || Motion.on()) && document.visibilityState !== 'hidden';
    }

    function setup(el) {
      var svgEl = el.querySelector('.flame__svg:not(.flame__old)');
      if (!svgEl || svgEl.getAttribute('data-lit') !== '1') return null;
      function q(sel) { return svgEl.querySelector(sel); }
      var glow = q('.flame__glow');
      var st = {
        el: el,
        svg: svgEl,
        size: +svgEl.getAttribute('data-size'),
        bx: +svgEl.getAttribute('data-bx'),
        by: +svgEl.getAttribute('data-by'),
        strip: +svgEl.getAttribute('data-strip'),
        stage: +svgEl.getAttribute('data-stage'),
        waiting: el.classList.contains('is-waiting'),
        outer: q('.flame__tongue--outer'),
        mid: q('.flame__tongue--mid'),
        core: q('.flame__tongue--core'),
        lickL: q('.flame__lick--l'),
        lickR: q('.flame__lick--r'),
        wisp: q('.flame__wisp'),
        glow: glow,
        glowR: glow ? +glow.getAttribute('r') : 0,
        root: q('.flame__root'),
        ember: q('.flame__ember'),
        drifts: svgEl.querySelectorAll('.flame__drift'),
        drifts2: svgEl.querySelectorAll('.flame__drift2'),
        mixes: svgEl.querySelectorAll('.flame__mix'),
        warps: Array.prototype.slice.call(svgEl.querySelectorAll('.flame__warp')),
        particles: q('.flame__particles'),
        sparks: [],
        nextSpark: 0,
        seed: Math.random() * 100,
        wind: 0,
        lag: 0,
        push: 0,
        hover: 0,
        px: null
      };
      st.warp0 = st.warps.map(function (w) { return +w.getAttribute('scale'); });

      el.addEventListener('pointermove', function (event) {
        var r = svgEl.getBoundingClientRect();
        st.px = (event.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1);
      });
      el.addEventListener('pointerleave', function () { st.px = null; });
      el.classList.add('is-alive');
      return st;
    }

    function bend(node, skew, sx, sy, opacity) {
      if (!node) return;
      node.style.transform = 'skewX(' + (-skew).toFixed(2) + 'deg) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
      if (opacity !== undefined) node.style.opacity = opacity.toFixed(3);
    }

    function spawn(st) {
      if (!st.particles) return;
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'flame__ember-spark');
      var p = {
        node: c,
        x: st.bx + (Math.random() - 0.5) * st.size * 0.3,
        y: st.by - st.size * (0.5 + Math.random() * 0.3),
        vx: st.wind * 12 + (Math.random() - 0.5) * 10,
        vy: -(18 + Math.random() * 22) * (st.size / 30),
        r0: 0.45 + Math.random() * 0.75,
        age: 0,
        life: 0.7 + Math.random() * 0.8
      };
      st.particles.appendChild(c);
      st.sparks.push(p);
    }

    function frame(st, t, dt) {
      var calm = st.waiting ? 0.55 : 1;
      var heat = 0.85 + st.stage * 0.07;
      var s = st.seed;

      /* The air: slow gusts, plus the pointer pushing from its side. */
      var gust = wave(t * 0.45 * heat, s) * 0.55 + wave(t * 1.2 * heat, s + 3) * 0.2;
      var pushTo = st.px === null ? 0 : Math.max(-1, Math.min(1, -st.px)) * 0.9;
      st.push += (pushTo - st.push) * Math.min(1, dt * 4);
      st.hover += ((st.px === null ? 0 : 1) - st.hover) * Math.min(1, dt * 3);
      st.wind += (gust * calm + st.push - st.wind) * Math.min(1, dt * 2.5);
      st.lag += (st.wind - st.lag) * Math.min(1, dt * 1.6);

      /* The flicker: quicker waves, a different mix for each tongue. */
      var f1 = wave(t * 5.1 * heat, s + 1);
      var f2 = wave(t * 7.3 * heat, s + 2);
      var f3 = wave(t * 11.2 * heat, s + 5);
      var lift = 1 + st.hover * 0.06;

      bend(st.outer, st.wind * 10 + f1 * 2.2 * calm, 1 + f2 * 0.035 * calm, (1 + f1 * 0.07 * calm) * lift);
      bend(st.mid, st.lag * 8 + f2 * 2.4 * calm, 1 + f3 * 0.04 * calm, (1 + f3 * 0.07 * calm) * lift);
      bend(st.core, st.lag * 5 + f3 * 1.5 * calm, 1 + f1 * 0.05 * calm, 1 + f2 * 0.06 * calm);

      var dim = st.waiting ? 0.8 : 1;
      var lL = wave(t * 3.4 * heat, s + 7);
      var lR = wave(t * 3.9 * heat, s + 9);
      bend(st.lickL, st.wind * 16 + lL * 6 * calm, 1 - lL * 0.08, 0.9 + (lL + 1) * 0.22 * calm, (0.45 + (lL + 1) * 0.25) * dim);
      bend(st.lickR, st.wind * 16 + lR * 6 * calm, 1 - lR * 0.08, 0.9 + (lR + 1) * 0.22 * calm, (0.45 + (lR + 1) * 0.25) * dim);

      /* The wisp breaks off the tip, rises and melts, over and over. */
      if (st.wisp) {
        var ph = (t * 0.95 * heat + s) % 1;
        st.wisp.style.transform = 'translate(' + (st.wind * 3 * ph).toFixed(2) + 'px,' + (-ph * 1.4).toFixed(2) + 'px) scale(' + (1 - ph * 0.55).toFixed(3) + ')';
        st.wisp.style.opacity = ((1 - ph) * 0.75 * (ph < 0.12 ? ph / 0.12 : 1) * dim).toFixed(3);
      }

      /* Light breathing with the fire. */
      if (st.glow) {
        st.glow.setAttribute('r', (st.glowR * (1 + f1 * 0.035 * calm + st.hover * 0.06)).toFixed(2));
        st.glow.style.opacity = ((st.waiting ? 0.55 : 0.85) + f2 * 0.1 * calm).toFixed(3);
      }
      if (st.root) st.root.style.opacity = (0.38 + (f3 + 1) * 0.08).toFixed(3);
      if (st.ember) st.ember.style.opacity = (0.55 + (f2 + 1) * 0.18).toFixed(3);

      /* The noise rising through the flame. Two copies climb half a cycle
         apart; each is weighed to nothing just as it drops back to the
         start, so the mix flows up without a seam. Mixing flattens the
         noise a little mid-way, so the push is raised to match. The core
         rises slower than the body. */
      var rise = st.size * 0.85 * heat * calm;
      for (var n = 0; n < st.drifts.length; n++) {
        var phase = ((t * rise * (n ? 0.65 : 1)) / st.strip) % 1;
        var other = (phase + 0.5) % 1;
        var wa = 1 - Math.abs(2 * phase - 1);
        var wb = 1 - wa;
        st.drifts[n].setAttribute('dy', (-phase * st.strip).toFixed(2));
        if (st.drifts2[n]) st.drifts2[n].setAttribute('dy', (-other * st.strip).toFixed(2));
        if (st.mixes[n]) {
          st.mixes[n].setAttribute('k2', wa.toFixed(3));
          st.mixes[n].setAttribute('k3', wb.toFixed(3));
        }
        if (st.warps[n]) {
          var flat = Math.sqrt(wa * wa + wb * wb) || 1;
          st.warps[n].setAttribute('scale', (st.warp0[n] * (1 + f1 * 0.12) / flat).toFixed(2));
        }
      }

      /* Sparks: set off at random, lifted, blown, burnt out. */
      var rate = (SPARKS_PER_SECOND[st.stage] || 0) * (st.waiting ? 0.35 : 1);
      if (rate > 0 && t >= st.nextSpark) {
        if (st.nextSpark) spawn(st);
        st.nextSpark = t + (-Math.log(1 - Math.random()) / rate);
      }
      for (var i = st.sparks.length - 1; i >= 0; i--) {
        var p = st.sparks[i];
        p.age += dt;
        if (p.age >= p.life) {
          p.node.remove();
          st.sparks.splice(i, 1);
          continue;
        }
        p.vx += (st.wind * 30 - p.vx * 0.5) * dt + (Math.random() - 0.5) * 16 * dt;
        p.vy -= 6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        var k = p.age / p.life;
        p.node.setAttribute('cx', p.x.toFixed(2));
        p.node.setAttribute('cy', p.y.toFixed(2));
        p.node.setAttribute('r', (p.r0 * (1 - k * 0.6)).toFixed(2));
        p.node.style.opacity = (p.age < 0.08 ? p.age / 0.08 : 1 - k).toFixed(3);
      }
    }

    /* Motion off: every flame back to the still picture. */
    function rest() {
      flames.forEach(function (st) {
        st.el.classList.remove('is-alive');
        [st.outer, st.mid, st.core, st.lickL, st.lickR, st.wisp, st.glow, st.root, st.ember].forEach(function (n) {
          if (n) { n.style.transform = ''; n.style.opacity = ''; }
        });
        if (st.glow) st.glow.setAttribute('r', st.glowR);
        st.sparks.forEach(function (p) { p.node.remove(); });
        st.sparks = [];
      });
      flames = [];
      states = new WeakMap();
    }

    function rescan() {
      flames = [];
      document.querySelectorAll('.flame').forEach(function (el) {
        var st = states.get(el);
        if (st === undefined) {
          st = setup(el);
          states.set(el, st);
        }
        if (st) flames.push(st);
      });
    }

    function tick(now) {
      queued = false;
      if (!alive()) { rest(); last = 0; return; }
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (now - lastScan > 400) { rescan(); lastScan = now; }
      var t = now / 1000;
      flames.forEach(function (st) {
        if (st.svg.isConnected && st.svg.getClientRects().length) frame(st, t, dt);
      });
      schedule();
    }

    /* One loop at a time. A frame asked for while the window was hidden
       may never come; after a second without it, ask again — and let
       only the newest request run, so two loops never burn side by side. */
    var queuedAt = 0;
    var loop = 0;
    function schedule() {
      var now = performance.now();
      if (queued && now - queuedAt < 1000) return;
      queued = true;
      queuedAt = now;
      var id = ++loop;
      requestAnimationFrame(function (ts) { if (id === loop) tick(ts); });
    }

    /* The one-off scenes — lighting again, a stage-up flare — are CSS
       animations on classes. A browser plays an element's animations
       again every time it comes back on screen, so coming back to the
       dashboard showed a bare match and the lighting all over again.
       Once a scene has played, its classes come off and the burnt match
       it swapped out goes, so the fire is simply burning when you return. */
    function settle(event) {
      var name = event.animationName;
      if (name !== 'flame-ignite' && name !== 'flame-fade-in' && name !== 'flame-flare') return;
      var el = event.target.closest && event.target.closest('.flame');
      if (!el) return;
      if (name === 'flame-flare') {
        el.classList.remove('is-flare');
        return;
      }
      el.classList.remove('is-ignite', 'is-swap');
      var old = el.querySelector('.flame__old');
      if (old) old.remove();
    }

    function start() {
      document.addEventListener('animationend', settle, true);
      document.addEventListener('visibilitychange', function () { last = 0; if (alive()) schedule(); });
      new MutationObserver(function () {
        lastScan = 0;
        if (alive()) schedule();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
      schedule();
    }

    return { start: start };
  })();

  Engine.start();

  /* What a habit's match should look like today: how many days it has
     burned (a weekly habit's weeks count as seven days each, so its fire
     grows at the same pace in time), whether it is waiting for today, and
     — only on the day after a streak broke — how far the one that went
     out had got. Shared by the streak card and the desktop widget. */
  function stateFor(habit, run, unit) {
    var s = Storage.load();
    var todayKey = Storage.today();
    var days = unit === 'week' ? run * 7 : run;
    var waiting = run > 0 && Habits.dueOn(s.log, habit, todayKey) && !Habits.metOn(s.log, habit, todayKey);
    var wentOut = false;
    if (run === 0 && Habits.streaks(s.log, habit, todayKey).best > 0) {
      var points = Habits.occurrences(s.log, habit, todayKey);
      var k = points.length - 1;
      if (k >= 0 && !points[k].met) k--;          // today, still in progress
      var missed = 0;
      while (k >= 0 && !points[k].met) { missed++; k--; }
      if (missed === 1) {
        var last = 0;
        while (k >= 0 && points[k].met) { last++; k--; }
        wentOut = Math.max(1, unit === 'week' ? last * 7 : last);
      }
    }
    return { days: days, waiting: waiting, wentOut: wentOut };
  }

  /* The habit with the longest run going — the one whose match is shown. */
  function lead() {
    var s = Storage.load();
    var todayKey = Storage.today();
    var best = null;
    Habits.active().forEach(function (habit) {
      var r = Habits.streaks(s.log, habit, todayKey);
      if (!best || r.current > best.run) best = { habit: habit, run: r.current, unit: r.unit };
    });
    if (!best) return null;
    var st = stateFor(best.habit, best.run, best.unit);
    best.days = st.days;
    best.waiting = st.waiting;
    best.wentOut = st.wentOut;
    return best;
  }

  return { html: html, stageOf: stageOf, nextOf: nextOf, stateFor: stateFor, lead: lead };
})();
