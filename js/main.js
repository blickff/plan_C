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
  if (typeof Insights !== 'undefined') Insights.render();
}

/* Clock and theme ---------------------------------------------------- */

function renderClock() {
  var now = new Date();
  document.getElementById('clock-time').textContent =
    pad(now.getHours()) + ':' + pad(now.getMinutes());
  document.getElementById('clock-seconds').textContent = pad(now.getSeconds());
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
}

function setTheme(choice) {
  Storage.load().settings.theme = choice;
  Storage.save();
  renderTheme();
}

/* Menu and views ------------------------------------------------------ */

function openMenu(open) {
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');

  if (open) {
    sidebar.removeAttribute('hidden');
    scrim.removeAttribute('hidden');
  } else {
    sidebar.setAttribute('hidden', '');
    scrim.setAttribute('hidden', '');
  }
}

/* The menu always starts closed — it is a way in, not a fixture. */
function showView(name) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) {
    var match = views[i].getAttribute('data-view') === name;
    if (match) {
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

  openMenu(false);
}

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
    link.download = 'day-panel-before-upgrade.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
}

function wireChrome() {
  document.getElementById('menu-btn').addEventListener('click', function () {
    openMenu(document.getElementById('sidebar').hasAttribute('hidden'));
  });

  document.getElementById('scrim').addEventListener('click', function () {
    openMenu(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') openMenu(false);
  });

  var items = document.querySelectorAll('.nav__item');
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener('click', function () {
      showView(this.getAttribute('data-view'));
    });
  }

  var themeButtons = document.querySelectorAll('[data-theme-set]');
  for (var j = 0; j < themeButtons.length; j++) {
    themeButtons[j].addEventListener('click', function () {
      setTheme(this.getAttribute('data-theme-set'));
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

    var card = document.getElementById('desktop-card');
    var autoBtn = document.getElementById('autostart-btn');
    var topBtn = document.getElementById('ontop-btn');
    card.removeAttribute('hidden');

    window.desktop.getWindowSettings().then(function (settings) {
      autoBtn.classList.toggle('is-active', settings.openAtLogin);
      topBtn.classList.toggle('is-active', settings.onTop);
    });

    autoBtn.addEventListener('click', function () {
      window.desktop.toggleAutostart().then(function (on) {
        autoBtn.classList.toggle('is-active', on);
      });
    });

    topBtn.addEventListener('click', function () {
      window.desktop.toggleOnTop().then(function (on) {
        topBtn.classList.toggle('is-active', on);
      });
    });
  }

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
      if (!error) document.getElementById('city-input').value = '';
    });
  });
}

function start() {
  renderDate();
  renderClock();
  renderTheme();

  Habits.start();
  HistoryView.start();
  Dashboard.render();
  Panel.start();
  Notes.start();
  Insights.render();
  Weather.start();

  wireChrome();
  wireLocationAsk();
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
