# Day Panel

A start page and habit tracker that also lives on the desktop. Habits,
a month calendar, tasks, countdowns, a note, and patterns it finds in
your own history.

Everything is stored in the browser — no account, no server, nothing
leaves the machine.

## Running it

**In a browser.** Open `index.html`. That is the whole setup.

**On the desktop.** Needs Node.js 20 or later:

```
npm install
npm start
```

That opens a small widget on the desktop; the button in its corner opens
the full panel. `Ctrl+Shift+D` hides and brings the widget back.

## What it does

**Habits.** Every habit is a number with a goal — a yes/no habit is just
a goal of 1. Click a tile to add, right-click to take away. Goals can be
retuned at any time under *Edit habits*.

**The day's score.** One figure across habits measured in different
units: each habit's progress against its own goal, averaged, and capped
at 1 so overshooting one cannot hide skipping another.

**Calendar.** Red under 15%, yellow to 60%, green above. Months in the
year view open their own calendar.

**Patterns.** Under *History*: how the weather and the day of the week
line up with what actually got done. These stay silent until the numbers
earn it — at least ten days on each side of a comparison, a gap of 25
points, and a two-proportion z-test at z ≥ 3. Without that last gate a
panel with four habits invents a pattern almost every time.

**Weather** comes from Open-Meteo: no key, no sign-up. Today's weather
code is written into the log beside the habits, because the patterns
above need it recorded on the day it happened.

## Your data

One key in `localStorage`. Clearing site data wipes it, so *Settings →
Export a backup* writes a JSON file, and *Restore from file* reads it
back.

The browser and the desktop app keep **separate** storage. To move what
you have from one to the other, export from one and import into the
other.

## Layout

```
index.html      the panel
widget.html     the desktop widget
css/theme.css   colours for both themes — every colour lives here
css/app.css     the panel
css/widget.css  the widget
js/storage.js   one localStorage key, plus export and import
js/presets.js   the habit catalogue
js/habits.js    habits, streaks, the day's score
js/dashboard.js the streak card and the calendar
js/history.js   the grid and the figures
js/panel.js     tasks, countdowns, the note
js/insights.js  the patterns, and the rules for staying quiet
js/weather.js   Open-Meteo
js/main.js      clock, theme, menu, views
desktop/main.js Electron
```

Plain scripts, no build step, no framework. The desktop app serves the
same files over local http rather than `file://`, so both windows share
one storage.
