/* The fitting room's controls (scripts/widget-demo.html): the same choices
   as Settings → Desktop widget, plus the theme. Each one is written to
   the settings exactly as the panel writes it, and the widget is asked to
   redraw — which is all the desktop app does too. */

(function () {
  /* The sizes desktop/main.js gives each face's window. */
  var SIZES = {
    today: [340, 440],
    week: [410, 200],
    plans: [310, 330],
    note: [310, 230],
    money: [330, 260],
    'clock-round': [270, 270],
    'clock-digital': [390, 180],
    'clock-stack': [220, 280]
  };

  /* How much taller the window gets for a clock above the face. */
  var ABOVE = { 'clock-round': 196, 'clock-digital': 118, 'clock-stack': 176 };

  var SECTIONS = [['none', 'Nothing'], ['today', 'Today'], ['week', 'Week'], ['plans', 'Plans'], ['note', 'Note'], ['money', 'Money']];
  var DIALS = ['minimal', 'classic', 'roman', 'modern', 'mono', 'digital', 'stack', 'ring'];
  var ACCENTS = { orange: '#ff7a2a', amber: '#f5a800', red: '#ef4444', green: '#22a35a', blue: '#3b9cff', violet: '#b46cff', ink: 'var(--text)' };
  var HANDS = ['minimal', 'classic', 'roman', 'modern', 'mono'];

  function prefs() {
    var s = Storage.load().settings;
    if (!s.widget) s.widget = {};
    return s.widget;
  }

  function cap(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  function pills(attr, list, current) {
    return '<div class="demo-row">' + list.map(function (item) {
      var id = Array.isArray(item) ? item[0] : item;
      var name = Array.isArray(item) ? item[1] : cap(item);
      return '<button class="pill' + (id === current ? ' is-active' : '') + '" type="button" ' + attr + '="' + id + '">' + name + '</button>';
    }).join('') + '</div>';
  }

  function draw() {
    var w = prefs();
    var c = Widget.choice();
    var dial = w.dial || 'classic';
    var theme = Storage.load().settings.theme || 'auto';
    var panel = document.getElementById('demo-panel');

    var clockShape = dial === 'digital' ? 'clock-digital' : dial === 'stack' ? 'clock-stack' : 'clock-round';
    var both = c.clock && c.section !== 'none';
    var size = SIZES[c.section === 'none' ? clockShape : c.section];
    var root = document.getElementById('wg');
    root.style.setProperty('--w', size[0] + 'px');
    root.style.setProperty('--h', (size[1] + (both ? ABOVE[clockShape] : 0)) + 'px');

    panel.innerHTML =
      '<h1>Widget preview</h1>' +
      '<p class="lead">The widget as it would sit on the desktop, at the size of its window. Everything here is also in Settings → Desktop widget.</p>' +
      '<h2>Clock</h2><div class="demo-row"><button class="pill' + (c.clock ? ' is-active' : '') + '" type="button" data-toggle="clock">Show a clock</button></div>' +
      (c.clock
        ? '<div style="margin-top:8px">' + pills('data-set-dial', DIALS, dial) + '</div>' +
          '<div class="demo-row" style="margin-top:8px">' +
            (HANDS.indexOf(dial) !== -1 ? '<button class="pill' + (w.seconds !== false ? ' is-active' : '') + '" type="button" data-toggle="seconds">Second hand</button>' : '') +
            '<button class="pill' + (w.date !== false ? ' is-active' : '') + '" type="button" data-toggle="date">Date</button>' +
          '</div>'
        : '') +
      '<h2>Section</h2>' + pills('data-set-section', SECTIONS, c.section) +
      '<h2>Accent</h2><div class="demo-sw">' + Object.keys(ACCENTS).map(function (name) {
        return '<button type="button" title="' + cap(name) + '" data-set-accent="' + name + '" style="--sw:' + ACCENTS[name] + '"' +
          ((w.accent || 'orange') === name ? ' class="is-active"' : '') + '></button>';
      }).join('') + '</div>' +
      '<h2>Backdrop</h2>' + pills('data-set-backdrop', [['glow', 'Lit by the accent'], ['plain', 'Plain']], w.backdrop === 'plain' ? 'plain' : 'glow') +
      '<h2>Theme</h2>' + pills('data-set-theme', [['dark', 'Dark'], ['light', 'Light']], theme === 'light' ? 'light' : 'dark') +
      '<h2>Pinned to the desktop</h2><div class="demo-row">' +
        '<button class="pill' + (document.body.classList.contains('is-pinned') ? ' is-active' : '') + '" type="button" data-toggle="pinned">Show it as pinned</button></div>' +
      '<p class="lead" style="margin-top:10px">Pinned, its hide and move buttons go. In the app it then cannot be dragged, resized or hidden until unpinned in Settings.</p>';
  }

  document.getElementById('demo-panel').addEventListener('click', function (event) {
    var b = event.target.closest('button');
    if (!b) return;
    var w = prefs();
    var c = Widget.choice();
    var done = false;
    ['dial', 'accent', 'backdrop'].forEach(function (key) {
      var value = b.getAttribute('data-set-' + key);
      if (value) { w[key] = value; done = true; }
    });
    /* The two choices, kept so that one is always on — as Settings does. */
    var section = b.getAttribute('data-set-section');
    if (section) {
      c.section = section;
      if (section === 'none') c.clock = true;
      done = true;
    }
    var theme = b.getAttribute('data-set-theme');
    if (theme) { Storage.load().settings.theme = theme; done = true; }
    var toggle = b.getAttribute('data-toggle');
    if (toggle === 'pinned') {
      document.body.classList.toggle('is-pinned');
      done = true;
    } else if (toggle === 'clock') {
      c.clock = !c.clock;
      if (!c.clock && c.section === 'none') c.section = 'today';
      done = true;
    } else if (toggle) {
      w[toggle] = w[toggle] === false;
      done = true;
    }
    if (!done) return;
    w.section = c.section;
    w.clock = c.clock;
    delete w.face;
    delete w.clockOnTop;
    Storage.save();
    Widget.render();
    draw();
  });

  draw();
})();
