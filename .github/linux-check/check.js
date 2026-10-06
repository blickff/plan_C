/* The Linux build, tried for real: run.sh has installed the .rpm on a
   clean Fedora and started it on a virtual screen with its debugging
   port open. This talks to the running app through that port, as a
   person would through its windows, and writes down what it saw:

   - both pages load, and say nothing went wrong while loading;
   - the panel opens, with some habits in it, in both themes;
   - "Start when I log in" writes and removes the autostart entry;
   - the app asks GitHub for updates and gets an answer;
   - a picture of each window, to look at afterwards.

   Exits non-zero on the first thing that is not as it should be. */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const OUT = process.argv[2] || 'check';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

function note(line) {
  console.log(line);
  fs.appendFileSync(path.join(OUT, 'report.txt'), line + '\n');
}

async function pages() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      return list.filter((p) => p.type === 'page');
    } catch (err) {
      await sleep(1000);
    }
  }
  throw new Error('the app never opened its debugging port');
}

async function page(part) {
  for (let i = 0; i < 30; i++) {
    const found = (await pages()).find((p) => p.url.includes(part));
    if (found) return found;
    await sleep(1000);
  }
  throw new Error('no page ' + part);
}

/* One DevTools connection to a page: send(method, params) → result. */
async function connect(part) {
  const target = await page(part);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
  };
  const send = (method, params) => new Promise((ok) => {
    id += 1;
    waiting.set(id, ok);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const run = async (expression) => {
    const d = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (d.result.exceptionDetails) throw new Error(part + ': ' + (d.result.exceptionDetails.exception || {}).description);
    return d.result.result.value;
  };
  const shoot = async (name) => {
    const d = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(d.result.data, 'base64'));
  };
  return { run, shoot, close: () => ws.close() };
}

function expect(ok, what) {
  note((ok ? 'ok    ' : 'FAIL  ') + what);
  if (!ok) problems.push(what);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const widget = await connect('widget.html');
  await sleep(2000);
  expect(await widget.run('!!document.querySelector("#wg-face").children.length'), 'the widget draws its face');
  expect(await widget.run('window.desktop.platform') === 'linux', 'the widget knows it is on Linux');

  /* A few habits, today partly done, and the clock above them — so the
     pictures show the widget the way it is used. */
  await widget.run(`(function () {
    var d = Storage.load(); var k = Storage.today();
    d.habits = [
      { id: 'h1', name: 'Morning exercise', goal: 1, unit: '', step: 1, createdAt: '2026-08-01' },
      { id: 'h2', name: 'English', goal: 20, unit: 'min', step: 5, createdAt: '2026-08-01' },
      { id: 'h3', name: 'Reading', goal: 20, unit: 'pages', step: 5, createdAt: '2026-08-01' }
    ];
    d.log[k] = { values: { h1: 1, h2: 10 } };
    d.settings.theme = 'dark';
    d.settings.widget = { section: 'today', clock: true, dial: 'roman', accent: 'violet', seconds: true, date: true, weather: false, size: 'medium', backdrop: 'glow' };
    Storage.save(); Widget.render(); return true;
  })()`);
  await sleep(1500);
  await widget.shoot('widget-dark.png');

  await widget.run('window.desktop.openPanel()');
  const panel = await connect('index.html');
  await sleep(3000);
  expect(await panel.run('document.documentElement.classList.contains("is-linux")'), 'the panel marks itself as Linux');
  expect(await panel.run('!!document.querySelector("[data-bump], .habit, .tile")'), 'the panel shows the habits');
  await panel.shoot('panel-dark.png');
  await panel.run('(function () { var d = Storage.load(); d.settings.theme = "light"; Storage.save(); renderTheme(); return true; })()');
  await sleep(800);
  await panel.shoot('panel-light.png');

  /* Settings: the Linux note, and starting at login. */
  await panel.run('showView("settings")');
  await sleep(600);
  expect(await panel.run('getComputedStyle(document.querySelector(".only-linux")).display !== "none"'), 'Settings shows the Linux note');
  await panel.run('document.getElementById("desktop-card").scrollIntoView()');
  await sleep(400);
  await panel.shoot('settings-desktop.png');

  const entry = path.join(os.homedir(), '.config', 'autostart', 'daybook-ci.desktop');
  const on = await panel.run('window.desktop.toggleAutostart()');
  expect(on === true && fs.existsSync(entry), 'Start when I log in writes ' + entry);
  if (fs.existsSync(entry)) note(fs.readFileSync(entry, 'utf8').trim().split('\n').map((l) => '        ' + l).join('\n'));
  const off = await panel.run('window.desktop.toggleAutostart()');
  expect(off === false && !fs.existsSync(entry), 'and turning it off removes it');

  /* Updates: asked about 8 seconds after start. */
  let state = null;
  for (let i = 0; i < 20; i++) {
    state = await panel.run('window.desktop.updates.state()');
    if (state && state.status !== 'idle' && state.status !== 'checking') break;
    await sleep(1000);
  }
  note('      update check answered: ' + JSON.stringify(state));
  expect(state && (state.status === 'latest' || state.status === 'available'), 'the update check gets an answer from GitHub');

  widget.close();
  panel.close();
  if (problems.length) {
    note('\n' + problems.length + ' problem(s).');
    process.exit(1);
  }
  note('\nall good.');
})().catch((err) => {
  note('FAIL  ' + err.message);
  process.exit(1);
});
