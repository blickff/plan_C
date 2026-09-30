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
  var SIZE = { out: 0, spark: 21, flame: 28, blaze: 34, blue: 36, violet: 38, white: 40 };

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
     base at 0,0 and its tip at 0,-1. */
  var TONGUE = 'M0,-1 C0.13,-0.74 0.47,-0.55 0.47,-0.25 C0.47,0.03 0.26,0.15 0,0.15 ' +
    'C-0.26,0.15 -0.47,0.03 -0.47,-0.25 C-0.47,-0.55 -0.13,-0.74 0,-1 Z';

  /* days: the streak in days. waiting: today not done yet. wentOut: the
     streak is nought but there has been one before. */
  function svg(days, waiting, wentOut) {
    var id = 'flm' + (++uid);
    var stage = stageOf(days);
    var lit = stage.key !== 'out';
    var size = SIZE[stage.key] * (waiting ? 0.72 : 1);
    /* Where the flame stands: on top of the head. */
    var base = 62;

    var flame = '';
    if (lit) {
      flame =
        '<circle class="flame__glow" cx="30" cy="' + (base - size * 0.45) + '" r="' + (size * 0.85 + 8) + '" fill="url(#' + id + 'g)"/>' +
        '<g transform="translate(30 ' + base + ') scale(' + size + ')">' +
          '<g class="flame__tongue flame__tongue--outer"><path d="' + TONGUE + '" fill="url(#' + id + 'o)"/></g>' +
          /* The size and place of each inner tongue sit on a wrapper: the
             flicker animates the transform of the group inside, and a CSS
             transform would otherwise replace them. */
          '<g transform="scale(0.72) translate(0 0.06)"><g class="flame__tongue flame__tongue--mid"><path d="' + TONGUE + '" fill="url(#' + id + 'm)"/></g></g>' +
          '<g transform="scale(0.4) translate(0 0.2)"><g class="flame__tongue flame__tongue--core"><path d="' + TONGUE + '" class="flame__core"/></g></g>' +
        '</g>';
      /* Sparks from a blaze on: a few embers that rise and fade. */
      if (days >= 7 && !waiting) {
        var sparks = '';
        [[-6, 0], [5, 0.7], [-2, 1.3], [8, 1.9], [-9, 2.4]].forEach(function (s, i) {
          sparks += '<circle class="flame__spark" cx="' + (30 + s[0]) + '" cy="' + (base - size * 0.6) + '" r="' + (i % 2 ? 1 : 1.4) + '"' +
            ' style="animation-delay:' + s[1] + 's"/>';
        });
        flame += sparks;
      }
    }

    var smoke = !lit && wentOut
      ? '<path class="flame__smoke" d="M30 58 C25 50 35 45 30 37 C25 29 35 24 30 16"/>'
      : '';

    return '' +
      '<svg class="flame__svg" viewBox="0 0 60 100" aria-hidden="true">' +
        '<defs>' +
          '<radialGradient id="' + id + 'g"><stop offset="0" class="flame__g0"/><stop offset="1" class="flame__g1"/></radialGradient>' +
          '<linearGradient id="' + id + 'o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="flame__o0"/><stop offset="1" class="flame__o1"/></linearGradient>' +
          '<linearGradient id="' + id + 'm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="flame__m0"/><stop offset="1" class="flame__m1"/></linearGradient>' +
          '<linearGradient id="' + id + 'w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="flame__w0"/><stop offset="0.55" class="flame__w1"/><stop offset="1" class="flame__w2"/></linearGradient>' +
          '<radialGradient id="' + id + 'h" cx="0.4" cy="0.35" r="0.7"><stop offset="0" class="flame__h0"/><stop offset="1" class="flame__h1"/></radialGradient>' +
        '</defs>' +
        flame +
        smoke +
        /* The stick, charred just under the head once it has been lit. */
        '<rect x="26.5" y="67" width="7" height="31" rx="2.2" fill="url(#' + id + 'w)"/>' +
        (lit ? '<rect class="flame__char" x="26.5" y="67" width="7" height="8" rx="2.2"/>' : '') +
        /* The head: red and glossy before it is struck, black with a live
           ember after. */
        '<ellipse class="flame__head" cx="30" cy="66" rx="6.4" ry="7.6" fill="url(#' + id + 'h)"/>' +
        (lit ? '<ellipse class="flame__ember" cx="30" cy="64.5" rx="3.6" ry="4"/>' : '') +
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
