/* The rest of the day beside the habits: today's tasks, countdowns to
   dates that matter, and a couple of lines about the day. */

var Panel = (function () {
  var noteTimer = null;
  var undoTimer = null;
  var undone = null;
  var editing = null;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function state() { return Storage.load(); }

  /* Tasks ------------------------------------------------------------ */

  function byOrder(a, b) {
    var x = typeof a.order === 'number' ? a.order : 0;
    var y = typeof b.order === 'number' ? b.order : 0;
    return x - y;
  }

  function tasksOn(key) {
    return state().tasks.filter(function (t) { return t.date === key; }).sort(byOrder);
  }

  /* The list belongs to whichever day the page is showing. */
  function dayTasks() {
    return tasksOn(Storage.viewingDay());
  }

  /* Anything already written down for a day still to come. Planning
     tomorrow is most of what planning is, and a list that only accepts
     today could not do it.

     Only shown while the page is on today: sitting on last Tuesday, a
     list of everything after today is noise. */
  function upcoming() {
    if (!Storage.viewingToday()) return [];
    var key = Storage.today();
    return state().tasks
      .filter(function (t) { return t.date > key && !t.done; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : byOrder(a, b); });
  }

  /* Anything left open on an earlier day. Yesterday's unfinished work
     does not vanish just because the clock rolled over — but it does not
     silently pile onto today either. The person decides. */
  function leftovers() {
    /* Carrying work forward only means anything from today. */
    if (!Storage.viewingToday()) return [];
    var key = Storage.today();
    return state().tasks.filter(function (t) {
      return t.date < key && !t.done && !t.movedTo;
    });
  }

  function nextOrder(key) {
    var list = tasksOn(key);
    if (!list.length) return 0;
    return (list[list.length - 1].order || 0) + 1;
  }

  function addTask(text, date) {
    text = String(text || '').trim();
    if (!text) return 'Write the task first.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = Storage.viewingDay();

    state().tasks.push({
      id: 'task-' + Date.now(),
      text: text,
      done: false,
      date: date,
      order: nextOrder(date)
    });
    Storage.save();
    render();
    return null;
  }

  function toggleTask(id) {
    state().tasks.forEach(function (task) {
      if (task.id === id) task.done = !task.done;
    });
    Storage.save();
    render();
  }

  function editTask(id, text) {
    text = String(text || '').trim();
    editing = null;
    if (text) {
      state().tasks.forEach(function (task) {
        if (task.id === id) task.text = text;
      });
      Storage.save();
    }
    render();
  }

  /* Deleting is the one action here with no trace left to undo it from,
     so the task is held for a few seconds before it really goes. */
  function removeTask(id) {
    var list = state().tasks;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        undone = { task: list[i], at: i };
        list.splice(i, 1);
        break;
      }
    }
    Storage.save();

    clearTimeout(undoTimer);
    undoTimer = setTimeout(function () {
      undone = null;
      render();
    }, 10000);

    render();
  }

  function undoDelete() {
    if (!undone) return;
    clearTimeout(undoTimer);
    state().tasks.splice(Math.min(undone.at, state().tasks.length), 0, undone.task);
    undone = null;
    Storage.save();
    render();
  }

  /* Dropped one task onto another: the list is renumbered so the order
     survives a reload. */
  function reorder(movedId, ontoId) {
    if (movedId === ontoId) return;
    var list = tasksOn(Storage.viewingDay());

    var from = -1;
    var to = -1;
    list.forEach(function (task, i) {
      if (task.id === movedId) from = i;
      if (task.id === ontoId) to = i;
    });
    if (from === -1 || to === -1) return;

    var moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    list.forEach(function (task, i) { task.order = i; });

    Storage.save();
    render();
  }

  /* Carrying a task forward copies it to today and marks the original
     as moved, rather than changing its date.

     Moving the date would rewrite the past: a day that really did have
     three tasks on it would later show none, and looking back at that
     day would be a lie. The old entry stays where it happened. */
  function pullForward() {
    var key = Storage.today();
    var stamp = Date.now();
    var n = 0;
    var order = nextOrder(key);

    leftovers().forEach(function (task) {
      state().tasks.push({
        id: 'task-' + stamp + '-' + (n++),
        text: task.text,
        done: false,
        date: key,
        from: task.date,
        order: order++
      });
      task.movedTo = key;
    });

    Storage.save();
    render();
  }

  function taskRow(task) {
    if (editing === task.id) {
      return '<li class="task is-editing">' +
        '<input class="input input--wide task__edit" type="text" data-edit="' +
          escapeHtml(task.id) + '" value="' + escapeHtml(task.text) + '">' +
      '</li>';
    }

    return '' +
      '<li class="task' + (task.done ? ' is-done' : '') + '" draggable="true" data-row="' +
        escapeHtml(task.id) + '">' +
        '<button class="task__tick" type="button" data-toggle="' + escapeHtml(task.id) + '"' +
          ' aria-label="' + (task.done ? 'Mark as not done' : 'Mark as done') + '">' +
          (task.done ? '&#10003;' : '') +
        '</button>' +
        '<span class="task__text" data-open="' + escapeHtml(task.id) +
          '" title="Double-click to edit">' + escapeHtml(task.text) + '</span>' +
        '<button class="task__drop" type="button" data-drop="' + escapeHtml(task.id) + '"' +
          ' aria-label="Delete">&#215;</button>' +
      '</li>';
  }

  function shortDate(key) {
    var parts = key.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (key === Habits.shiftDate(Storage.today(), 1)) return 'tomorrow';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }

  function renderTasks() {
    var list = dayTasks();
    var old = leftovers();
    var later = upcoming();

    /* The card is headed "Today's tasks" in the markup, which stops
       being true the moment another day is opened. */
    var head = document.getElementById('tasks-title');
    if (head) {
      head.textContent = Storage.viewingToday() ? 'Today' : 'That day';
    }

    /* A new task lands on the day you are looking at unless the date
       box says otherwise, so the box follows the day. Left alone while
       it has the focus — changing a field somebody is using is rude. */
    var when = document.getElementById('task-date');
    if (when && document.activeElement !== when) when.value = Storage.viewingDay();

    var rows = list.map(taskRow).join('');

    var carry = old.length
      ? '<button class="pill carry" type="button" id="carry-btn">Move ' + old.length +
        (old.length === 1 ? ' task' : ' tasks') + ' from earlier</button>'
      : '';

    var laterHtml = later.length
      ? '<p class="label label--tight">Later</p><ul class="tasks__list tasks__later">' +
        later.map(function (task) {
          return '<li class="task task--later">' +
            '<span class="task__when">' + escapeHtml(shortDate(task.date)) + '</span>' +
            '<span class="task__text">' + escapeHtml(task.text) + '</span>' +
            '<button class="task__drop" type="button" data-drop="' + escapeHtml(task.id) +
              '" aria-label="Delete">&#215;</button>' +
          '</li>';
        }).join('') + '</ul>'
      : '';

    var undoHtml = undone
      ? '<p class="undo">Deleted “' + escapeHtml(undone.task.text) + '” · ' +
        '<button class="undo__btn" type="button" id="undo-btn">Undo</button></p>'
      : '';

    /* Nothing planned is an empty list, not a sentence announcing one —
       the box to type in is right below. */
    document.getElementById('tasks').innerHTML =
      (rows ? '<ul class="tasks__list" id="tasks-list">' + rows + '</ul>' : '') +
      carry + laterHtml + undoHtml;

    if (old.length) {
      document.getElementById('carry-btn').addEventListener('click', pullForward);
    }
    if (undone) {
      document.getElementById('undo-btn').addEventListener('click', undoDelete);
    }

    var box = document.querySelector('.task__edit');
    if (box) {
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
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

  /* Events — the dates that used to live in their own Countdowns card —
     sit at the top of the same card as the tasks. On today: everything
     still to come, nearest first. On another day: whatever falls on it.
     A date that has gone by leaves this list and stays findable on its
     own day in the calendar. */
  function renderCountdowns() {
    var key = Storage.viewingDay();
    var items = state().countdowns.filter(function (c) {
      return Storage.viewingToday() ? c.date >= key : c.date === key;
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var box = document.getElementById('countdowns');
    if (!items.length) {
      box.innerHTML = '';
      return;
    }

    box.innerHTML = '<ul class="cds">' + items.map(function (item) {
      var left = daysUntil(item.date);
      var label;
      if (left === 0) label = 'today';
      else if (left === 1) label = 'tomorrow';
      else if (left > 0) label = 'in ' + left + ' days';
      else label = 'passed';

      return '' +
        '<li class="cd' + (left < 0 ? ' is-past' : '') + (left === 0 ? ' is-today' : '') + '">' +
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
    var key = Storage.viewingDay();

    box.placeholder = Storage.viewingToday() ? 'How did today go?'
      : key > Storage.today() ? 'Anything to remember for that day?'
      : 'What happened that day?';

    /* Only refill it when it is not being typed into, or the caret would
       jump to the end on every repaint. */
    if (document.activeElement !== box) {
      box.value = state().notes[key] || '';
    }
    grow(box);

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
    /* The archive lists notes, so it goes stale the moment one is
       written and nothing tells it. */
    var key = Storage.viewingDay();
    if (text.trim()) state().notes[key] = text;
    else delete state().notes[key];
    Storage.save();
    if (typeof Notes !== 'undefined') Notes.render();
    if (typeof Dashboard !== 'undefined') Dashboard.render();
  }

  /* Wiring ------------------------------------------------------------ */

  function render() {
    renderTasks();
    renderCountdowns();
    renderNote();

    /* The calendar stars days that carry a task, a note or a countdown,
       so adding one has to redraw it. Without this the star only turned
       up after a restart, which made it look like nothing was saved. */
    if (typeof Dashboard !== 'undefined') Dashboard.render();
  }

  function openPicker(input) {
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); } catch (err) { /* already open */ }
    }
  }

  /* The note box grows with what is written in it. A list of four points
     in a three-line box meant scrolling inside a box inside a page. */
  function grow(box) {
    box.style.height = 'auto';
    box.style.height = Math.max(box.scrollHeight + 2, 72) + 'px';
  }

  /* What the add box makes: a task, ticked off on its day, or an event —
     a date to count down to, like a trip or a Termin. One box and a
     switch, rather than two cards with two forms. */
  var kind = 'task';

  function setKind(next) {
    kind = next;
    document.querySelectorAll('[data-kind]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-kind') === kind);
    });
    document.getElementById('task-input').placeholder =
      kind === 'event' ? 'Trip to Prague, dentist appointment…' : 'Call the dentist';
  }

  function start() {
    var taskDate = document.getElementById('task-date');

    render();

    document.querySelectorAll('[data-kind]').forEach(function (b) {
      b.addEventListener('click', function () {
        setKind(this.getAttribute('data-kind'));
        document.getElementById('task-input').focus();
      });
    });

    document.getElementById('task-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('task-input');
      var error = kind === 'event'
        ? addCountdown(input.value, taskDate.value)
        : addTask(input.value, taskDate.value);
      document.getElementById('task-error').textContent = error || '';
      if (!error) input.value = '';
    });

    /* Two buttons for the two answers people actually give, and the date
       box for the rest. All three write the same field. */
    document.querySelectorAll('[data-when]').forEach(function (button) {
      button.addEventListener('click', function () {
        taskDate.value = this.getAttribute('data-when') === 'tomorrow'
          ? Habits.shiftDate(Storage.today(), 1)
          : Storage.today();
      });
    });

    taskDate.addEventListener('click', function () { openPicker(this); });

    var tasks = document.getElementById('tasks');

    tasks.addEventListener('click', function (event) {
      var tick = event.target.closest('[data-toggle]');
      if (tick) return toggleTask(tick.getAttribute('data-toggle'));

      var drop = event.target.closest('[data-drop]');
      if (drop) removeTask(drop.getAttribute('data-drop'));
    });

    tasks.addEventListener('dblclick', function (event) {
      var text = event.target.closest('[data-open]');
      if (!text) return;
      editing = text.getAttribute('data-open');
      render();
    });

    tasks.addEventListener('keydown', function (event) {
      var box = event.target.closest('[data-edit]');
      if (!box) return;
      if (event.key === 'Enter') editTask(box.getAttribute('data-edit'), box.value);
      if (event.key === 'Escape') { editing = null; render(); }
    });

    tasks.addEventListener('focusout', function (event) {
      var box = event.target.closest('[data-edit]');
      if (box) editTask(box.getAttribute('data-edit'), box.value);
    });

    /* Dragging one row onto another. Only today's list is draggable —
       the rows for later days are grouped by date, and a hand-made order
       across dates would have nothing to mean. */
    var dragging = null;

    tasks.addEventListener('dragstart', function (event) {
      var row = event.target.closest('[data-row]');
      if (!row) return;
      dragging = row.getAttribute('data-row');
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
    });

    tasks.addEventListener('dragover', function (event) {
      if (!dragging) return;
      var row = event.target.closest('[data-row]');
      if (!row) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      row.classList.add('is-over');
    });

    tasks.addEventListener('dragleave', function (event) {
      var row = event.target.closest('[data-row]');
      if (row) row.classList.remove('is-over');
    });

    tasks.addEventListener('drop', function (event) {
      var row = event.target.closest('[data-row]');
      if (!dragging || !row) return;
      event.preventDefault();
      reorder(dragging, row.getAttribute('data-row'));
      dragging = null;
    });

    tasks.addEventListener('dragend', function () {
      dragging = null;
      var marked = tasks.querySelectorAll('.is-dragging, .is-over');
      for (var i = 0; i < marked.length; i++) {
        marked[i].classList.remove('is-dragging', 'is-over');
      }
    });

    document.getElementById('countdowns').addEventListener('click', function (event) {
      var drop = event.target.closest('[data-cd]');
      if (drop) removeCountdown(drop.getAttribute('data-cd'));
    });

    /* Saved a beat after typing stops, not on every keystroke — writing
       the whole state to storage on each letter is needless work. */
    var note = document.getElementById('note');
    note.addEventListener('input', function () {
      var text = this.value;
      grow(this);
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
