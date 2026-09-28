# Day Panel

A start page and habit tracker that also lives on the desktop. Habits,
a month calendar, tasks, countdowns, a note, and patterns it finds in
your own history.

Everything is stored on your own machine — no account, no server,
nothing leaves the computer.

## Installing it on Windows

Download from [the latest
release](https://github.com/blickff/plan_C/releases/latest):

- **`DayPanel-Setup-1.0.0.exe`** — installs it properly, with a Start
  menu entry and a desktop shortcut. Installs for you alone, so it does
  not ask for an administrator.
- **`DayPanel-1.0.0-portable.exe`** — no installation. Double-click and
  it runs. Handy for trying it, or for a USB stick.

Both keep their data in the same place, so you can start with the
portable one and install later without losing anything.

### Windows will warn you about it

The first time you run either file, Windows shows a blue box:
*"Windows protected your PC"*. Press **More info**, then **Run anyway**.

This is not a sign that something is wrong with the download. Windows
says it about every program that has not been signed with a code
signing certificate, and those certificates are bought yearly from a
handful of companies. This one is not signed, and the warning is
Windows being honest about that rather than about the program.

If you would rather not take that on faith, the source is all here and
you can build it yourself with the two commands under
[Building](#building-it-yourself) below — the result is the same file.

### What you get

A small widget on the desktop and an icon by the clock.

- Click the icon by the clock to hide or show the widget; right-click it
  for the full panel, or to quit.
- `Ctrl+Shift+D` also hides and brings back the widget.
- The widget's own buttons appear when the pointer is over it: keep
  above other windows, open the panel, hide.
- Drag the widget by any empty part of it.

### Uninstalling

Settings → Apps → Day Panel, as with anything else. **Your history is
left behind on purpose** — uninstalling an app should not delete what
you wrote in it. It sits in `%APPDATA%\day-panel`, and installing again
picks it back up. To be rid of it as well, delete that folder by hand.

## Running it without installing

**In a browser.** Open `index.html`. That is the whole setup, though
there is no widget and no reminder that way.

**From the source.** Needs Node.js 20 or later:

```
npm install
npm start
```

## Building it yourself

```
npm install
npm run dist
```

The two files land in `release/`. `npm run icon` redraws the app icon
from `scripts/make-icon.js` if you want a different one.

## What it does

**Habits.** Every habit is a number with a goal — a yes/no habit is just
a goal of 1. Click a tile to add, right-click to take away. Goals and
schedules are set under *Edit habits*.

**Schedules.** Every day, certain weekdays, or a number of times a week.
A weekly habit only counts against you once the week can no longer be
made: three times a week does not mean Monday, it means the week is not
lost yet.

**The day's score.** One figure across habits measured in different
units: each habit's progress against its own goal, averaged, and capped
at 1 so overshooting one cannot hide skipping another. Under the streak
sits *met on N of the last 30 days*, because one missed day takes a
streak to zero and that is not a verdict on the month.

**Filling in a day you missed.** Press any day on the calendar and edit
it there. A day nobody filled in is drawn as unknown rather than failed,
and left out of every figure — the app not being open on Sunday is not
the same as failing on Sunday.

**Tasks** can be put on today, tomorrow or any date, corrected by
double-clicking, reordered by dragging, and un-deleted for ten seconds.

**Calendar.** Red under 15%, yellow to 60%, green above. Months in the
year view open their own calendar.

**Patterns.** Under *History*: how the weather, the day of the week, how
full the day was, and whether you wrote anything down line up with what
actually got done. These stay silent until the numbers earn it — at
least ten days on each side of a comparison, a gap of 25 points, and a
two-proportion z-test at z ≥ 3. Without that last gate a panel with four
habits invents a pattern almost every time. When it has nothing to say
it says what it is still counting towards.

**A reminder.** Settings → *Daily reminder*: one notification a day, at
an hour you pick, and only if the day is unfinished when it arrives.

**Weather** comes from Open-Meteo: no key, no sign-up. Today's weather
code is written into the log beside the habits, because the patterns
above need it recorded on the day it happened.

## Your data

It lives in the app's own storage, under `%APPDATA%\day-panel`.

*Settings → Export a backup* writes a JSON file and *Restore from file*
reads it back. The browser and the desktop app keep **separate**
storage, so moving between them means exporting from one and importing
into the other.

*Settings → Where your data lives* is the better answer for keeping it:
point it at a folder inside OneDrive, Google Drive, Dropbox or anything
else that already syncs, and the history survives a new Windows or a new
computer. Point the app at the same folder again and everything is back.

If two machines share that folder and both write, the later file wins —
and the copy that lost is written out beside it as
`day-panel-replaced-<date>.json`, with a notice in the panel saying so.
Nothing is thrown away in silence.

## Layout

```
index.html       the panel
widget.html      the desktop widget
css/theme.css    colours for both themes — every colour lives here
css/app.css      the panel
css/widget.css   the widget
js/storage.js    one storage key, the vault file, export and import
js/presets.js    the habit catalogue
js/habits.js     habits, schedules, streaks, the day's score
js/dashboard.js  the streak card and the calendar
js/dayview.js    one day, opened from the calendar and editable
js/history.js    the grid and the figures
js/notes.js      the notes archive
js/panel.js      tasks, countdowns, the note
js/insights.js   the patterns, and the rules for staying quiet
js/weather.js    Open-Meteo
js/widget.js     the widget, and the daily reminder
js/main.js       clock, theme, menu, views
desktop/main.js  Electron: windows, tray, the app:// scheme
desktop/vault.js the data file in a folder you choose
scripts/         the icon, drawn in code
```

Plain scripts, no build step, no framework. The desktop app serves the
same files from `app://panel` rather than `file://` or a local port, so
both windows share one storage and that storage is the same on every
launch.
