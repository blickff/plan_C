/* The update button, shared by the panel and the widget.

   It is invisible until there is something to do. When there is, one
   button carries the whole job — "Update to 1.2.0", then the download
   percentage, then "Restart to update" — so there is never a question
   of which of several buttons to press. */

var UpdateUI = (function () {

  /* The words on the button, or '' when it should not show. */
  function label(s) {
    if (!s) return '';
    if (s.status === 'available') {
      return s.inPlace ? 'Update to ' + s.latest : s.latest + ' is out — download';
    }
    if (s.status === 'downloading') return 'Downloading… ' + (s.percent || 0) + '%';
    if (s.status === 'ready') return 'Restart to update';
    if (s.status === 'error' && s.latest) return 'Retry update';
    return '';
  }

  /* "checked at 14:05", so an answer is never mistaken for an old one. */
  function when(s) {
    if (!s || !s.checkedAt) return '';
    var d = new Date(s.checkedAt);
    return ' Checked at ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '.';
  }

  /* The longer sentence for Settings. */
  function describe(s) {
    if (!s) return '';
    switch (s.status) {
      case 'dev': return 'Running from the source folder. Updates are for the installed app.';
      case 'checking': return 'Looking for a newer version…';
      case 'latest': return 'You have the newest version' + (s.version ? ' (' + s.version + ')' : '') + '.' + when(s);
      case 'available':
        return s.inPlace
          ? 'A newer version is out: ' + s.latest + '. Press “Update to ' + s.latest + '” — it downloads, and one more press restarts into it.' + when(s)
          : 'A newer version is out: ' + s.latest + '. This copy cannot replace itself, so the button opens the download page.' + when(s);
      case 'downloading': return 'Downloading version ' + s.latest + '… ' + (s.percent || 0) + '%';
      case 'ready': return 'Version ' + s.latest + ' is downloaded. Restarting installs it; your data stays where it is.';
      case 'error': return 'Could not reach the update server' + (s.message ? ' (' + s.message + ')' : '') + '. It tries again every hour.' + when(s);
      default: return 'Not checked yet.';
    }
  }

  function paint(button, s) {
    if (!button) return;
    var text = label(s);
    button.textContent = text;
    button.hidden = !text;
    button.disabled = s && s.status === 'downloading';
  }

  /* Wires up any set of elements that happen to exist on the page. */
  function start(parts) {
    if (!window.desktop || !window.desktop.updates) return;
    var api = window.desktop.updates;

    function show(s) {
      (parts.buttons || []).forEach(function (b) { paint(b, s); });
      if (parts.status) parts.status.textContent = describe(s);
      if (parts.card) parts.card.hidden = false;
      if (parts.checkBtn) parts.checkBtn.disabled = s.status === 'dev' || s.status === 'checking' || s.status === 'downloading';
    }

    (parts.buttons || []).forEach(function (b) {
      if (!b) return;
      b.addEventListener('click', function () { api.act().then(show); });
    });

    if (parts.checkBtn) {
      parts.checkBtn.addEventListener('click', function () {
        show({ status: 'checking' });
        api.check().then(show);
      });
    }

    api.onChange(show);
    api.state().then(show);

    if (parts.version && window.desktop.version) {
      window.desktop.version().then(function (v) { parts.version.textContent = 'Version ' + v; });
    }
  }

  return { start: start, label: label, describe: describe };
})();
