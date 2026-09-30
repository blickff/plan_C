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

   While today's habit is still to do, the flame burns low and wavers —
   it is waiting to be fed. Done, it stands up to full height. Moving up a
   stage makes it flare once.

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
    var size = SIZE[stage.key] * (waiting ? 0.7 : 1);
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
        '</g>';

      /* Sparks from a blaze on: embers that rise off the tip and fade. */
      if (days >= 7 && !waiting) {
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
      '<svg class="flame__svg" viewBox="0 0 70 120" aria-hidden="true">' +
        '<defs>' +
          /* The fire's edge. Fractal noise pushes the outline about —
             no smooth drop, no clean line between the layers — and a
             blur melts what is left. The noise is the one place to set
             the fire moving later: shift its seed or its grain over time
             (class flame__noise) and every edge moves with it. */
          '<filter id="' + id + 's" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feTurbulence class="flame__noise" type="fractalNoise" baseFrequency="' + grain + '" numOctaves="2" seed="' + seed + '" result="n"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + rough + '" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
            '<feGaussianBlur in="d" stdDeviation="1"/>' +
          '</filter>' +
          '<filter id="' + id + 'r" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feTurbulence class="flame__noise" type="fractalNoise" baseFrequency="' + grain + '" numOctaves="2" seed="' + (seed + 1) + '" result="n"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + (rough * 0.5).toFixed(1) + '" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
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
        glow +
        smoke +
        match +
        fire +
      '</svg>';
  }

  /* The whole piece for the card: the match and its classes. Moving up a
     stage since the last time this was drawn in this browser makes it
     flare once; the first time ever it only remembers. */
  function lit(days) { return stageOf(days).key !== 'out'; }

  function html(days, waiting, wentOut) {
    var stage = stageOf(days);
    var flare = false;
    try {
      var seen = window.localStorage.getItem('daybook.flameStage');
      var now = stageIndex(days);
      if (seen !== null && now > +seen && !waiting) flare = true;
      window.localStorage.setItem('daybook.flameStage', String(now));
    } catch (err) { /* private window: no flare, nothing lost */ }

    var cls = 'flame flame--' + stage.key +
      (!lit(days) && wentOut ? ' is-gone' : '') +
      (waiting ? ' is-waiting' : '') +
      (flare ? ' is-flare' : '');
    var title = stage.key === 'out'
      ? (wentOut ? 'The match went out. Light it again today.' : 'Not lit yet — do it today to strike it.')
      : stage.name + (waiting ? ' · burning low until today is done' : '');
    return '<div class="' + cls + '" title="' + title + '">' + svg(days, waiting, wentOut) + '</div>';
  }

  return { html: html, stageOf: stageOf, nextOf: nextOf };
})();
