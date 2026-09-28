/* The rest of the day beside the habits: today's tasks, countdowns to
   dates that matter, and a couple of lines about the day. */

var Panel = (function () {
  var noteTimer = null;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function state() { return Storage.load(); }

  /* Tasks ------------------------------------------------------------ */

  function todaysTasks() {
    var key = Storage.today();
    return state().tasks.filter(function (t) { return t.date === key; });
  }

  /* Anything left open on an earlier day. Yesterday's unfinished work
     does not vanish just because the clock rolled over — but it does not
     silently pile onto today either. The person decides. */
  function leftovers() {
    var key = Storage.today();
    return state().tasks.filter(function (t) { return t.date < key && !t.done; });
  }

  function addTask(text) {
    text = String(text || '').trim();
    if (!text) return;

    state().tasks.push({
      id: 'task-' + Date.now(),
      text: text,
      done: false,
      date: Storage.today()
    });
    Storage.save();
    render();
  }

  function toggleTask(id) {
    state().tasks.forEach(function (task) {
      if (task.id === id) task.done = !task.done;
    });
    Storage.save();
    render();
  }

  function removeTask(id) {
    var list = state().tasks;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list.splice(i, 1);
        break;
      }
    }
    Storage.save();
    render();
  }

  function pullForward() {
    var key = Storage.today();
    leftovers().forEach(function (task) { task.date = key; });
    Storage.save();
    render();
  }

  function renderTasks() {
    var list = todaysTasks();
    var old = leftovers();

    var rows = list.map(function (task) {
      return '' +
        '<li class="task' + (task.done ? ' is-done' : '') + '">' +
          '<button class="task__tick" type="button" data-toggle="' + escapeHtml(task.id) + '"' +
            ' aria-label="' + (task.done ? 'Mark as not done' : 'Mark as done') + '">' +
            (task.done ? '&#10003;' : '') +
          '</button>' +
          '<span class="task__text">' + escapeHtml(task.text) + '</span>' +
          '<button class="task__drop" type="button" data-drop="' + escapeHtml(task.id) + '"' +
            ' aria-label="Delete">&#215;</button>' +
        '</li>';
    }).join('');

    var carry = old.length
      ? '<button class="pill carry" type="button" id="carry-btn">Move ' + old.length +
        (old.length === 1 ? ' task' : ' tasks') + ' from earlier</button>'
      : '';

    document.getElementById('tasks').innerHTML =
      (rows ? '<ul class="tasks__list">' + rows + '</ul>' : '<p class="soft">Nothing planned yet.</p>') +
      carry;

    if (old.length) {
      document.getElementById('carry-btn').addEventListener('click', pullForward);
    }
  }

  /* Countdowns -------------------------------------------------------- */

  function daysUntil(dateKey) {
    var parts = dateKey.split('-');
    var then = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var now = new Date();
    then.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.round((then - now) / 86400000);
  }

  function addCountdown(title, date) {
    title = String(title || '').trim();
    if (!title) return 'Give it a name.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick a date.';

    state().countdowns.push({ id: 'cd-' + Date.now(), title: title, date: date });
    Storage.save();
    render();
    return null;
  }

  function removeCountdown(id) {
    var list = state().countdowns;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list.splice(i, 1);
        break;
      }
    }
    Storage.save();
    render();
  }

  function renderCountdowns() {
    var items = state().countdowns.slice();

    /* Upcoming first and nearest at the top; dates that have gone by sink
       to the bottom rather than disappearing — a passed anniversary is
       still worth seeing. */
    items.sort(function (a, b) {
      var da = daysUntil(a.date);
      var db = daysUntil(b.date);
      if (da >= 0 && db < 0) return -1;
      if (da < 0 && db >= 0) return 1;
      return da - db;
    });

    if (!items.length) {
      document.getElementById('countdowns').innerHTML = '<p class="soft">No dates yet.</p>';
      return;
    }

    document.getElementById('countdowns').innerHTML = '<ul class="cds">' + items.map(function (item) {
      var left = daysUntil(item.date);
      var label;
      if (left === 0) label = 'today';
      else if (left === 1) label = 'tomorrow';
      else if (left > 0) label = left + ' days';
      else label = 'passed';

      return '' +
        '<li class="cd' + (left < 0 ? ' is-past' : '') + '">' +
          '<span class="cd__title">' + escapeHtml(item.title) + '</span>' +
          '<span class="cd__left">' + label + '</span>' +
          '<button class="task__drop" type="button" data-cd="' + escapeHtml(item.id) + '"' +
            ' aria-label="Delete">&#215;</button>' +
        '</li>';
    }).join('') + '</ul>';
  }

  /* Note -------------------------------------------------------------- */

  function renderNote() {
    var box = document.getElementById('note');
    var key = Storage.today();

    /* Only refill it when it is not being typed into, or the caret would
       jump to the end on every repaint. */
    if (document.activeElement !== box) {
      box.value = state().notes[key] || '';
    }

    var lastYear = String(Number(key.slice(0, 4)) - 1) + key.slice(4);
    var then = state().notes[lastYear];
    var el = document.getElementById('year-ago');

    if (then) {
      el.innerHTML = '<p class="label">One year ago</p><p class="soft">' + escapeHtml(then) + '</p>';
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  }

  function saveNote(text) {
    var key = Storage.today();
    if (text.trim()) state().notes[key] = text;
    else delete state().notes[key];
    Storage.save();
  }

  /* Wiring ------------------------------------------------------------ */

  function render() {
    renderTasks();
    renderCountdowns();
    renderNote();
  }

  function start() {
    render();

    document.getElementById('task-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('task-input');
      addTask(input.value);
      input.value = '';
    });

    document.getElementById('tasks').addEventListener('click', function (event) {
      var tick = event.target.closest('[data-toggle]');
      if (tick) return toggleTask(tick.getAttribute('data-toggle'));

      var drop = event.target.closest('[data-drop]');
      if (drop) removeTask(drop.getAttribute('data-drop'));
    });

    document.getElementById('cd-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var error = addCountdown(
        document.getElementById('cd-title').value,
        document.getElementById('cd-date').value
      );
      document.getElementById('cd-error').textContent = error || '';
      if (!error) this.reset();
    });

    document.getElementById('countdowns').addEventListener('click', function (event) {
      var drop = event.target.closest('[data-cd]');
      if (drop) removeCountdown(drop.getAttribute('data-cd'));
    });

    /* Saved a beat after typing stops, not on every keystroke — writing
       the whole state to storage on each letter is needless work. */
    document.getElementById('note').addEventListener('input', function () {
      var text = this.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { saveNote(text); }, 500);
    });

    document.getElementById('note').addEventListener('blur', function () {
      clearTimeout(noteTimer);
      saveNote(this.value);
    });
  }

  return { start: start, render: render, daysUntil: daysUntil };
})();
