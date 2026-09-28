/* Clock, theme, the slide-out menu and switching between the three views.
   Plain script on purpose: ES modules are blocked when the page is opened
   from disk with a double click, which is how this project runs. */

var GREETINGS = {
  morning: 'Good morning',
  day: 'Good afternoon',
  evening: 'Good evening',
  night: 'Still up?'
};

function greetingForHour(hour) {
  if (hour >= 5 && hour < 11) return GREETINGS.morning;
  if (hour >= 11 && hour < 17) return GREETINGS.day;
  if (hour >= 17 && hour < 22) return GREETINGS.evening;
  return GREETINGS.night;
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
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

  document.getElementById('greeting').textContent = greetingForHour(hour);
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

  openMenu(false);
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
  if (window.desktop) {
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
  Insights.render();
  Weather.start();

  wireChrome();

  setInterval(renderClock, 1000);

  /* Re-checked every minute: a page left open at 18:59 would otherwise
     stay light until it is reloaded, and the date would not roll over. */
  setInterval(function () {
    renderDate();
    renderTheme();
  }, 60 * 1000);
}

start();
