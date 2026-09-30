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
  var SIZE = { out: 0, spark: 26, flame: 35, blaze: 43, blue: 46, violet: 48, white: 50 };

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

  /* days: the streak in days. waiting: today not done yet. wentOut: the
     streak is nought but there has been one before. */
  function svg(days, waiting, wentOut) {
    var id = 'flm' + (++uid);
    var stage = stageOf(days);
    var lit = stage.key !== 'out';
    var size = SIZE[stage.key] * (waiting ? 0.7 : 1);
    var bx = HX;
    var by = HY + 3;

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
        (lit ? '<rect x="-2.3" y="2" width="4.6" height="13" rx="2.3" fill="' + url('c') + '"/>' : '') +
        '<ellipse class="flame__head" cx="0" cy="-0.5" rx="4.6" ry="6.2" fill="' + url('h') + '"/>' +
        (lit ? '<ellipse class="flame__ember" cx="0" cy="-1" rx="2.8" ry="3.8"/>' : '') +
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
          '</g>' +
        '</g>' +
        '<g transform="translate(' + bx + ' ' + by + ') scale(' + size + ')">' +
          '<g transform="translate(0 0.02) scale(0.36 0.42)"><g class="flame__tongue flame__tongue--core"><path d="' + TONGUE + '" fill="' + url('k') + '"/></g></g>' +
        '</g>';

      /* Sparks from a blaze on: embers that rise off the tip and fade. */
      if (days >= 7 && !waiting) {
        [[-5, 0], [4, 0.6], [-1, 1.2], [7, 1.8], [-8, 2.3]].forEach(function (s, i) {
          fire += '<circle class="flame__spark" cx="' + (bx + s[0]) + '" cy="' + (by - size * 0.7) + '" r="' + (i % 2 ? 0.9 : 1.3) + '"' +
            ' style="animation-delay:' + s[1] + 's"/>';
        });
      }
    }

    var smoke = !lit && wentOut
      ? '<path class="flame__smoke" d="M' + HX + ' ' + (HY - 7) + ' C' + (HX - 5) + ' ' + (HY - 15) + ' ' + (HX + 5) + ' ' + (HY - 21) +
        ' ' + HX + ' ' + (HY - 29) + ' C' + (HX - 5) + ' ' + (HY - 37) + ' ' + (HX + 5) + ' ' + (HY - 43) + ' ' + HX + ' ' + (HY - 52) + '"/>'
      : '';

    return '' +
      '<svg class="flame__svg" viewBox="0 0 70 120" aria-hidden="true">' +
        '<defs>' +
          '<filter id="' + id + 's" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.7"/></filter>' +
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
      (waiting ? ' is-waiting' : '') +
      (flare ? ' is-flare' : '');
    var title = stage.key === 'out'
      ? (wentOut ? 'The match went out. Light it again today.' : 'Not lit yet — do it today to strike it.')
      : stage.name + (waiting ? ' · burning low until today is done' : '');
    return '<div class="' + cls + '" title="' + title + '">' + svg(days, waiting, wentOut) + '</div>';
  }

  return { html: html, stageOf: stageOf, nextOf: nextOf };
})();
