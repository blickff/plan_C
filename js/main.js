/* Clock, theme, the slide-out menu and switching between the three views.
   Plain script on purpose: ES modules are blocked when the page is opened
   from disk with a double click, which is how this project runs. */

/* Seven greetings, one a day, round and round. Seven and a daily step
   means each lands on the same weekday every week, so none of them can
   say anything about the hour — the panel is open at eight in the
   morning and at midnight, and "Good evening" would be wrong half the
   time it appeared.

   Nothing here comments on how the day is going either. A greeting that
   praised or chided would be wrong about as often, and a panel that
   guesses at your mood is a panel you start avoiding. */
var GREETINGS = [
  'Hello again',
  'Here we go',
  'A new one',
  'Back at it',
  'Good to see you',
  'Right then',
  'Onwards'
];

/* Days since the epoch, from the local date. Used as the index so the
   phrase is fixed for the whole day: picking at random would reshuffle
   it on every repaint, which is once a minute. */
function dayNumber() {
  var parts = Storage.today().split('-');
  return Math.floor(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000);
}

function greetingForToday() {
  return GREETINGS[dayNumber() % GREETINGS.length];
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Redraw everything that depends on the stored data. habits.js calls this
   after a tick so the cards and the grid follow along. */
function repaint() {
  Dashboard.render();
  HistoryView.render();
  renderDayHead();
  if (typeof Insights !== 'undefined') Insights.render();
}

/* The day on screen --------------------------------------------------

   Pressing a day on the calendar used to open a second card below it
   that listed the same habits, the same tasks and the same note again,
   with its own smaller controls. Two ways to look at a day, one of them
   worse, and a card that appeared and pushed the page around.

   Now the page itself moves to that day: the tiles, the task list and
   the note all show it and are edited exactly as today is. The only
   new thing on screen is one line saying which day you are on. */

function prettyDay(key) {
  var parts = key.split('-');
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  }).format(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

function goToDay(key) {
  Storage.setViewingDay(key);
  Dashboard.showMonthOf(key);
  Habits.renderTiles();
  /* Panel.render draws the tasks and the note for the day, and asks the
     calendar to redraw so the selected cell moves with it. */
  Panel.render();
  renderDayHead();
}

function renderDayHead() {
  var el = document.getElementById('dayhead');
  if (!el) return;

  var key = Storage.viewingDay();
  var todayKey = Storage.today();
  var here = key === todayKey;
  var ahead = key > todayKey;
  var state = Storage.load();

  var score = Habits.completionFor(state.log, state.habits, key);
  var accounted = Storage.known(state.log, key);
  var values = Storage.valuesOn(state.log, key);

  /* Today is never "never filled in" — it is simply not over. Saying
     otherwise every morning would be an accusation. */
  /* Nothing said about today: the ring on the card above already shows
     how it is going, and "0% of today done" every morning repeated it
     as a small reproach. Other days get one short line, because there
     it is the only place the number appears. */
  var note = ahead ? 'Still to come'
    : here ? ''
    : !accounted ? 'Not filled in'
    : score === null ? ''
    : Math.round(score * 100) + '% done';

  /* Dates that land on this day, which used to be the day card's "on
     this date" list. One line is enough for what is usually one thing. */
  var due = state.countdowns.filter(function (c) { return c.date === key; });
  var dueLine = due.length
    ? '<span class="dayhead__due"> · ' +
      esc(due.map(function (c) { return c.title; }).join(', ')) + '</span>'
    : '';

  /* Only for a day that has been and gone: the difference between "I
     did nothing" and "nobody ever wrote this day down" is one a person
     has to state, and the app used to guess at it. */
  var mark = '';
  if (!ahead && !here) {
    if (!accounted) {
      mark = '<button class="chipbtn" type="button" id="day-mark">Nothing got done — count it</button>';
    } else if (!Object.keys(values).length) {
      mark = '<button class="chipbtn" type="button" id="day-unmark">Counted as empty — undo</button>';
    }
  }

  /* The events of the day already show at the top of the Today card, so
     here they are only repeated for other days. */
  var line = esc(note) + (here ? '' : dueLine);

  el.innerHTML = '' +
    '<div class="dayhead__main">' +
      '<p class="label">' + (here ? 'Habits' : esc(prettyDay(key))) + '</p>' +
      (line ? '<p class="dayhead__note muted">' + line + '</p>' : '') +
    '</div>' +
    '<div class="dayhead__side">' +
      mark +
      (here ? '' : '<button class="pill" type="button" id="day-back">Back to today</button>') +
    '</div>';

  var back = document.getElementById('day-back');
  if (back) back.addEventListener('click', function () { goToDay(todayKey); });

  var markBtn = document.getElementById('day-mark');
  if (markBtn) {
    markBtn.addEventListener('click', function () {
      Storage.closeDay(key, true);
      goToDay(key);
      repaint();
    });
  }

  var unmarkBtn = document.getElementById('day-unmark');
  if (unmarkBtn) {
    unmarkBtn.addEventListener('click', function () {
      Storage.closeDay(key, false);
      goToDay(key);
      repaint();
    });
  }
}

/* Clock and theme ---------------------------------------------------- */

/* Hours and minutes only. A seconds counter ticking in the corner of
   something you glance at all day is movement that means nothing, and
   the eye goes to movement. Still checked every second, so the minute
   turns over on time rather than up to a minute late. */
function renderClock() {
  var now = new Date();
  var text = pad(now.getHours()) + ':' + pad(now.getMinutes());
  var el = document.getElementById('clock-time');
  if (el.textContent !== text) el.textContent = text;
}

function renderDate() {
  document.getElementById('date').textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());
}

function renderTheme() {
  var hour = new Date().getHours();
  var choice = Storage.load().settings.theme || 'auto';
  var theme = choice === 'auto'
    ? (hour >= 7 && hour < 19 ? 'light' : 'dark')
    : choice;

  document.getElementById('greeting').textContent = greetingForToday();
  document.documentElement.setAttribute('data-theme', theme);

  var buttons = document.querySelectorAll('[data-theme-set]');
  for (var i = 0; i < buttons.length; i++) {
    var active = buttons[i].getAttribute('data-theme-set') === choice;
    buttons[i].classList.toggle('is-active', active);
  }

  tellWindowTheme(theme);
}

/* The window's own title strip takes the page's colours, so a dark page
   does not sit under a white bar. Only the desktop app has a window to
   tell; the values come from the theme itself, so the two can never
   disagree. */
var lastWindowTheme = null;

function tellWindowTheme(theme) {
  if (!window.desktop || !window.desktop.setTheme) return;
  theme = theme || document.documentElement.getAttribute('data-theme');
  var css = getComputedStyle(document.documentElement);
  var bg = css.getPropertyValue('--bg').trim();
  var text = css.getPropertyValue('--text').trim();
  var key = theme + bg + text;
  if (key === lastWindowTheme) return;
  lastWindowTheme = key;
  window.desktop.setTheme({ theme: theme, bg: bg, text: text });
}


/* The dashboard's blocks, in the order the person put them -------------

   In edit mode each block shows a handle, and dragging by it moves the
   block. Only the handle starts a drag: a whole block made draggable
   would steal the mouse from every text box inside it, and the habit
   editor is full of them. */

function applyBoardOrder() {
  var board = document.getElementById('board');
  var order = Storage.load().settings.boardOrder;
  if (!board || !Array.isArray(order)) return;
  order.forEach(function (name) {
    var block = board.querySelector('[data-block="' + name + '"]');
    if (block) board.appendChild(block);
  });
}

function saveBoardOrder() {
  var board = document.getElementById('board');
  Storage.load().settings.boardOrder = Array.prototype.map.call(
    board.querySelectorAll(':scope > [data-block]'),
    function (b) { return b.getAttribute('data-block'); }
  );
  Storage.save();
}

/* Called by habits.js whenever edit mode is switched. */
function onEditMode(on) {
  var blocks = document.querySelectorAll('#board > [data-block]');
  for (var i = 0; i < blocks.length; i++) {
    var grip = blocks[i].querySelector(':scope > .block__grip');
    if (on && !grip) {
      grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'block__grip';
      grip.setAttribute('aria-label', 'Drag to move this block');
      grip.innerHTML = '<span aria-hidden="true">&#8942;&#8942;</span> Move';
      blocks[i].insertBefore(grip, blocks[i].firstChild);
    }
    if (!on && grip) grip.remove();
    blocks[i].removeAttribute('draggable');
  }
}

function wireBoard() {
  var board = document.getElementById('board');
  if (!board) return;
  var dragging = null;

  /* Pressing the handle arms that one block; letting go disarms it. */
  board.addEventListener('mousedown', function (event) {
    var grip = event.target.closest('.block__grip');
    if (grip) grip.parentNode.setAttribute('draggable', 'true');
  });
  document.addEventListener('mouseup', function () {
    if (dragging) return;
    var armed = board.querySelectorAll('[data-block][draggable]');
    for (var i = 0; i < armed.length; i++) armed[i].removeAttribute('draggable');
  });

  board.addEventListener('dragstart', function (event) {
    var block = event.target;
    if (!block.matches || !block.matches('#board > [data-block][draggable]')) return;
    dragging = block;
    block.classList.add('is-moving');
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', block.getAttribute('data-block')); } catch (err) {}
  });

  board.addEventListener('dragover', function (event) {
    if (!dragging) return;
    var target = event.target.closest('#board > [data-block]');
    if (!target || target === dragging) return;
    event.preventDefault();

    /* Before or after, by which half of the target the pointer is in:
       left or right for a half-width block, top or bottom for a full one. */
    var r = target.getBoundingClientRect();
    var half = target.classList.contains('block--full')
      ? event.clientY < r.top + r.height / 2
      : event.clientX < r.left + r.width / 2;
    var place = half ? target : target.nextSibling;
    if (place === dragging || place === dragging.nextSibling) return;
    Habits.glide(board, function () { board.insertBefore(dragging, place); });
  });

  board.addEventListener('drop', function (event) {
    if (dragging) event.preventDefault();
  });

  board.addEventListener('dragend', function () {
    if (!dragging) return;
    dragging.classList.remove('is-moving');
    dragging.removeAttribute('draggable');
    dragging = null;
    saveBoardOrder();
  });
}

function setTheme(choice) {
  Storage.load().settings.theme = choice;
  Storage.save();
  renderTheme();
}

/* Menu and views ------------------------------------------------------ */

function showView(name) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) {
    var match = views[i].getAttribute('data-view') === name;
    if (match) {
      /* A section that was not on screen comes in from a little below. */
      if (views[i].hasAttribute('hidden') && typeof Motion !== 'undefined') {
        views[i].removeAttribute('hidden');
        Motion.play(views[i], 'is-entering');
      }
      views[i].removeAttribute('hidden');
    } else {
      views[i].setAttribute('hidden', '');
    }
  }

  var items = document.querySelectorAll('.nav__item');
  for (var j = 0; j < items.length; j++) {
    items[j].classList.toggle('is-active', items[j].getAttribute('data-view') === name);
  }

  /* The habit editor belongs to the dashboard and nowhere else. On
     Settings or Notes the button was still on screen offering to finish
     an edit that was not, which reads as a stray control. */
  var edit = document.getElementById('habits-toggle');
  if (name === 'dashboard') edit.removeAttribute('hidden');
  else edit.setAttribute('hidden', '');

  /* The spending line is drawn to the width it has, which it only has
     once History is on screen. */
  if (name === 'history' && typeof Money !== 'undefined') Money.renderHistory();
}

/* And again when the window changes width while History is open. */
window.addEventListener('resize', function () {
  var hist = document.querySelector('.view[data-view="history"]');
  if (hist && !hist.hidden && typeof Money !== 'undefined') Money.renderHistory();
});

/* Settings for the vault: which folder holds the data file, and the
   handful of things worth doing with it. The path is shown in full and
   can be copied, because moving to another machine means typing it in
   there — and because a person should be able to see where their own
   data sits. */
/* Asked once, on the first run, and only when no city is set yet.
   Nothing is looked up before the answer: finding out where somebody is
   should never be the quiet default. */
function wireLocationAsk() {
  var box = document.getElementById('location-ask');
  var settings = Storage.load().settings;

  if (settings.place || Weather.askedAlready()) return;
  box.removeAttribute('hidden');

  /* Two different things, kept apart. Closing the panel puts it away
     for now; the tick box is what says never again. Answering 'not now'
     without ticking it means the question comes back next time, which is
     the honest reading of 'not now'. */
  function dismiss(forGood) {
    if (forGood || document.getElementById('location-never').checked) {
      Weather.rememberAsked();
    }
    box.setAttribute('hidden', '');
  }

  document.getElementById('location-yes').addEventListener('click', function () {
    var button = this;
    button.textContent = 'Looking…';
    button.disabled = true;

    Weather.detect().then(function (where) {
      if (where) return dismiss(true);

      /* Failure must hand the button back. Leaving it stuck on 'Looking…'
         is worse than the failure itself: nothing says what went wrong
         and there is no way to try again. */
      button.textContent = 'Try again';
      button.disabled = false;
      var note = box.querySelector('.ask__note');
      note.textContent = 'That did not work — this device would not say where it is, ' +
        'and the lookup by internet address did not answer either. ' +
        'Try again, or type the city in Settings.';
      note.classList.add('is-warning');
    });
  });

  document.getElementById('location-no').addEventListener('click', function () {
    dismiss(false);
  });
}

/* The reminder is the one thing here that reaches outside the window,
   so it is off until it is switched on, and it says plainly that it is
   this computer talking and not a service. */
function wireReminder() {
  var card = document.getElementById('reminder-card');
  var toggle = document.getElementById('remind-toggle');
  var at = document.getElementById('remind-at');

  var settings = Storage.load().settings;
  if (!settings.reminder) settings.reminder = { on: false, at: '21:00' };
  var plan = settings.reminder;

  card.removeAttribute('hidden');
  at.value = plan.at || '21:00';

  function paint() {
    toggle.classList.toggle('is-active', !!plan.on);
    toggle.textContent = plan.on ? 'Reminding me at' : 'Remind me at';
  }
  paint();

  toggle.addEventListener('click', function () {
    plan.on = !plan.on;
    /* Switching it on should not be silently overruled by a flag saying
       today's nudge already went out. */
    delete plan.sent;
    Storage.save();
    paint();
  });

  at.addEventListener('change', function () {
    plan.at = /^\d{2}:\d{2}$/.test(this.value) ? this.value : '21:00';
    this.value = plan.at;
    delete plan.sent;
    Storage.save();
  });
}

/* Said out loud, because the alternative is what used to happen: a
   folder synced from another machine quietly won, and a day's work was
   gone with nothing on screen to suggest it had ever existed. */
function showReplacedNote() {
  var info = Storage.replacedCopy();
  if (!info) return;

  var box = document.getElementById('replaced-note');
  box.innerHTML = '' +
    '<div>' +
      '<p class="ask__title">Your folder held a newer copy</p>' +
      '<p class="ask__note muted">' +
        'Another machine — or this one before a reinstall — wrote the data file more ' +
        'recently than this computer did, so the file was taken. ' +
        (info.file
          ? 'What was here first was saved beside it as <span class="vault__path is-set">' +
            esc(info.file) + '</span>, so nothing is lost.'
          : 'What was here first could not be written out, so check the folder before ' +
            'making more changes.') +
      '</p>' +
    '</div>' +
    '<div class="ask__side"><div class="ask__buttons">' +
      '<button class="pill pill--solid" type="button" id="replaced-ok">Understood</button>' +
    '</div></div>';

  box.removeAttribute('hidden');
  document.getElementById('replaced-ok').addEventListener('click', function () {
    Storage.clearReplaced();
    box.setAttribute('hidden', '');
  });
}

function wireVault() {
  var card = document.getElementById('vault-card');
  var pathLine = document.getElementById('vault-path');
  var whenLine = document.getElementById('vault-when');
  var copyBtn = document.getElementById('vault-copy');
  var openBtn = document.getElementById('vault-open');
  var forgetBtn = document.getElementById('vault-forget');
  var pickBtn = document.getElementById('vault-pick');

  card.removeAttribute('hidden');

  function show(info) {
    var set = !!(info && info.folder);

    pathLine.textContent = set ? info.file : 'Not set up yet';
    pathLine.classList.toggle('is-set', set);

    if (!set) {
      whenLine.textContent = '';
    } else if (info.exists) {
      whenLine.textContent = 'Last written ' +
        new Date(info.savedAt).toLocaleString('en-US') +
        ' · ' + Math.max(1, Math.round(info.size / 1024)) + ' KB';
    } else {
      whenLine.textContent = 'The file will appear on your next change.';
    }

    [copyBtn, openBtn, forgetBtn].forEach(function (button) {
      if (set) button.removeAttribute('hidden');
      else button.setAttribute('hidden', '');
    });

    pickBtn.textContent = set ? 'Choose a different folder' : 'Choose a folder';
  }

  window.desktop.vault.info().then(show);

  pickBtn.addEventListener('click', function () {
    window.desktop.vault.pick().then(function (info) {
      show(info);
      if (!info.folder) return;

      /* A folder that already holds a file is being rejoined — another
         machine's history, or this one's from before a reinstall. Take
         whichever side was written last. */
      Storage.adoptVault(function (adopted) {
        if (adopted) {
          Habits.render();
          Panel.render();
        } else {
          Storage.save();
        }
        window.desktop.vault.info().then(show);
      });
    });
  });

  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(pathLine.textContent).then(function () {
      var was = copyBtn.textContent;
      copyBtn.textContent = 'Copied';
      setTimeout(function () { copyBtn.textContent = was; }, 1200);
    });
  });

  openBtn.addEventListener('click', function () { window.desktop.vault.reveal(); });

  forgetBtn.addEventListener('click', function () {
    /* Only the app stops using the folder. The file stays where it is —
       deleting somebody's data because they changed their mind about a
       setting would be unforgivable. */
    if (!window.confirm('Stop saving to that folder? The file stays where it is.')) return;
    window.desktop.vault.forget().then(show);
  });
}

/* A safety net nobody can reach is not a safety net. The copy taken
   before the data was rewritten into the new shape is offered as a
   plain file, for as long as it is there. */
function wirePreviousCopy() {
  var button = document.getElementById('prev-btn');
  var text = Storage.backupBeforeV2();
  if (!text) return;

  button.removeAttribute('hidden');
  button.addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'daybook-before-upgrade.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
}

/* The widget's face and look (Settings → Desktop widget). Kept with the
   other settings, so the widget window — reading the same storage — hears
   of each change through the storage event and redraws. */
function wireWidgetPrefs() {
  function prefs() {
    var s = Storage.load().settings;
    if (!s.widget) s.widget = {};
    return s.widget;
  }

  function mark() {
    var w = prefs();
    var face = w.face || 'today';
    var dial = w.dial || 'classic';
    function radio(attr, value) {
      document.querySelectorAll('[' + attr + ']').forEach(function (b) {
        var on = b.getAttribute(attr) === value;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      });
    }
    radio('data-wface', face);
    radio('data-wdial', dial);
    radio('data-waccent', w.accent || 'orange');
    radio('data-wbackdrop', w.backdrop === 'plain' ? 'plain' : 'glow');

    var sec = document.getElementById('wseconds-btn');
    sec.classList.toggle('is-active', w.seconds !== false);
    /* Only the dials with hands have a second hand to show. */
    sec.hidden = ['minimal', 'classic', 'roman', 'modern', 'mono'].indexOf(dial) === -1;
    document.getElementById('wdate-btn').classList.toggle('is-active', w.date !== false);
    document.getElementById('wopts-clock').hidden = face !== 'clock';
  }

  function set(key, value) {
    prefs()[key] = value;
    Storage.save();
    mark();
  }

  [['data-wface', 'face'], ['data-wdial', 'dial'], ['data-waccent', 'accent'], ['data-wbackdrop', 'backdrop']].forEach(function (pair) {
    document.querySelectorAll('[' + pair[0] + ']').forEach(function (b) {
      b.addEventListener('click', function () { set(pair[1], b.getAttribute(pair[0])); });
    });
  });
  document.getElementById('wseconds-btn').addEventListener('click', function () {
    set('seconds', prefs().seconds === false);
  });
  document.getElementById('wdate-btn').addEventListener('click', function () {
    set('date', prefs().date === false);
  });

  mark();
}

function wireChrome() {
  var items = document.querySelectorAll('.nav__item');
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener('click', function () {
      showView(this.getAttribute('data-view'));
    });
  }

  var themeButtons = document.querySelectorAll('[data-theme-set]');
  for (var j = 0; j < themeButtons.length; j++) {
    themeButtons[j].addEventListener('click', function (event) {
      var choice = this.getAttribute('data-theme-set');
      /* The new theme spreads as a circle from the button pressed. */
      if (typeof Motion !== 'undefined') Motion.reveal(event, function () { setTheme(choice); });
      else setTheme(choice);
    });
  }

  /* The picker lives on the dashboard, so reaching for it from another
     view has to bring that view along. */
  document.getElementById('habits-toggle').addEventListener('click', function () {
    showView('dashboard');
  });

  /* Only meaningful inside the Electron shell; in a plain browser the
     bridge is not there and the whole card stays hidden. */
  if (window.desktop && window.desktop.vault) wireVault();

  if (window.desktop) {
    wireReminder();

    UpdateUI.start({
      buttons: [document.getElementById('update-btn'), document.getElementById('updates-act')],
      status: document.getElementById('updates-status'),
      checkBtn: document.getElementById('updates-check'),
      card: document.getElementById('updates-card'),
      version: document.getElementById('updates-version')
    });

    var card = document.getElementById('desktop-card');
    var autoBtn = document.getElementById('autostart-btn');
    var topBtn = document.getElementById('ontop-btn');
    var pinBtn = document.getElementById('pinned-btn');
    card.removeAttribute('hidden');
    wireWidgetPrefs();

    window.desktop.getWindowSettings().then(function (settings) {
      autoBtn.classList.toggle('is-active', settings.openAtLogin);
      topBtn.classList.toggle('is-active', settings.onTop);
      pinBtn.classList.toggle('is-active', settings.pinned);
    });

    autoBtn.addEventListener('click', function () {
      window.desktop.toggleAutostart().then(function (on) {
        autoBtn.classList.toggle('is-active', on);
      });
    });

    /* The two are opposite answers to the same question — above
       everything, or behind everything — so each switches the other
       off, and the buttons have to say so. */
    topBtn.addEventListener('click', function () {
      window.desktop.toggleOnTop().then(function (on) {
        topBtn.classList.toggle('is-active', on);
        if (on) pinBtn.classList.remove('is-active');
      });
    });

    pinBtn.addEventListener('click', function () {
      window.desktop.togglePinned().then(function (on) {
        pinBtn.classList.toggle('is-active', on);
        if (on) topBtn.classList.remove('is-active');
      });
    });
  }

  /* The same lookup the first-run question offers, available any time —
     after a move, or for anyone who said "not now" and changed their
     mind. */
  var detectBtn = document.getElementById('city-detect');
  var cityNow = document.getElementById('city-now');

  function showCity() {
    var place = Storage.load().settings.place;
    cityNow.textContent = place && place.name ? 'Now: ' + place.name : '';
  }
  showCity();

  detectBtn.addEventListener('click', function () {
    var box = document.getElementById('city-error');
    detectBtn.disabled = true;
    detectBtn.textContent = 'Looking…';
    box.textContent = '';

    Weather.detect().then(function (where) {
      detectBtn.disabled = false;
      detectBtn.textContent = 'Find my city automatically';
      if (where) {
        Weather.rememberAsked();
        document.getElementById('location-ask').setAttribute('hidden', '');
        showCity();
      } else {
        box.textContent = 'Could not find it — this device would not say, and the lookup by ' +
          'internet address did not answer. Type the city below instead.';
      }
    });
  });

  document.getElementById('city-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var box = document.getElementById('city-error');
    var name = document.getElementById('city-input').value.trim();

    if (!name) {
      box.textContent = 'Type a city name first.';
      return;
    }

    box.textContent = 'Looking…';
    Weather.lookUpCity(name).then(function (error) {
      box.textContent = error || '';
      if (!error) {
        document.getElementById('city-input').value = '';
        showCity();
      }
    });
  });
}

function start() {
  /* The desktop app draws its own title strip (see css), so the page
     needs to know it is inside one, and on which system. */
  if (window.desktop) {
    document.documentElement.classList.add('is-desktop');
    if (window.desktop.platform) document.documentElement.classList.add('is-' + window.desktop.platform);
  }

  applyBoardOrder();
  wireBoard();
  renderDate();
  renderClock();
  renderTheme();

  Habits.start();
  HistoryView.start();
  Dashboard.render();
  Panel.start();
  Notes.start();
  Insights.render();
  Money.start();
  Weather.start();

  wireChrome();
  wireLocationAsk();

  if (typeof Motion !== 'undefined') {
    Motion.start();
    Motion.arrive();
  }
  wirePreviousCopy();

  /* Before anything else touches the folder: if the data on this
     machine was written by an older version of the app, the untouched
     original goes in beside it. */
  Storage.keepPreMigrationCopy();

  /* If a vault folder is set and its file is newer than what this
     browser holds, take the file and redraw. That is what makes a
     reinstalled machine come back with its history. */
  Storage.adoptVault(function (adopted) {
    if (!adopted) return;
    Habits.render();
    Panel.render();
    Notes.render();
    Money.render();
    renderTheme();
    showReplacedNote();
  });

  /* The desktop widget writes to the same storage from its own window.
     Without this the panel only saw its own changes: a tick in the panel
     reached the widget, but a tick in the widget left the panel showing
     stale numbers until it was reloaded. */
  window.addEventListener('storage', function (event) {
    if (event.key !== 'dayPanel') return;
    Storage.reload();
    Habits.render();
    Panel.render();
    Notes.render();
    if (typeof Insights !== 'undefined') Insights.render();
    Money.render();
  });

  setInterval(renderClock, 1000);

  /* Re-checked every minute: a page left open at 18:59 would otherwise
     stay light until it is reloaded, and the date would not roll over. */
  setInterval(function () {
    renderDate();
    renderTheme();
  }, 60 * 1000);
}

start();
