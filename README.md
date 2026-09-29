# Daybook

Your day, your habits, your notes and your spending, in one calm place
on the desktop. Habits on a schedule, a month calendar you can fill in
after the fact, tasks, countdowns, a note for every day, a record of
what you spent, and patterns it finds in your own history.

Everything is stored on your own machine — no account, no server,
nothing leaves the computer.

## Installing it

Download from [the latest
release](https://github.com/blickff/plan_C/releases/latest).

### Windows

- **`Daybook-Setup-1.1.0.exe`** — installs it properly, with a Start
  menu entry and a desktop shortcut. Installs for you alone, so it does
  not ask for an administrator. **This is the one that updates itself.**
- **`Daybook-1.1.0-portable.exe`** — no installation. Double-click and
  it runs. Handy for trying it, or for a USB stick.

Both keep their data in the same place, so you can start with the
portable one and install later without losing anything.

The first time you run either file, Windows shows a blue box:
*"Windows protected your PC"*. Press **More info**, then **Run anyway**.

That is not a sign that something is wrong with the download. Windows
says it about every program that has not been signed with a code
signing certificate, and those are bought yearly from a handful of
companies. This one is not signed, and the warning is Windows being
honest about that rather than about the program.

### Mac

- **`Daybook-1.1.0-mac.dmg`** — one file for every Mac, Intel or Apple
  silicon. Open it and drag Daybook into Applications.

The first time, macOS will refuse to open it: *"Daybook cannot be
opened because Apple cannot check it for malicious software."* Press
**Done**, then open **System Settings → Privacy & Security**, scroll
down to the line about Daybook and press **Open Anyway**. It only asks
once.

The reason is the same as on Windows, with a bigger bill: Apple only
vouches for apps signed with its developer certificate, which costs a
yearly fee. This one is signed without it — enough for the Mac to run
it, not enough for the Mac to vouch for it.

If *Open Anyway* is not offered, this in the Terminal does the same
thing:

```
xattr -dr com.apple.quarantine /Applications/Daybook.app
```

### Either way

If you would rather not take any of that on faith, the source is all
here and the two commands under [Building](#building-it-yourself)
produce the same files.

## Updating

When a newer version is out, a button appears — in the panel next to
*Edit habits*, and in the corner of the widget. On Windows with the
installer, pressing it downloads the update and pressing it again
restarts into it. The portable exe and the Mac version cannot replace
themselves, so there the button opens the download page instead.
*Settings → Updates* shows the version you have and checks on demand.

Your data is never part of an update: it lives in its own folder, and
a new version opens onto the same history.

## What you get

A small widget on the desktop and an icon by the clock (on a Mac, in
the menu bar).

- Click the icon to hide or show the widget; right-click it for the
  full panel, or to quit.
- `Ctrl+Shift+D` (`Cmd+Shift+D` on a Mac) also hides and brings back
  the widget.
- The widget's own buttons appear when the pointer is over it: keep
  above other windows, open the panel, hide.
- Settings → *Desktop widget* → **Pin to the desktop** takes it out of
  the taskbar and Alt+Tab, keeps it behind whatever you are working in
  rather than over it, and brings it back after "show desktop". Windows
  has no real way to fasten a window to the wallpaper, so this is as
  close as it gets without machinery this app does not otherwise need.
- Drag the widget by any empty part of it.

## Uninstalling

Windows: Settings → Apps → Daybook. Mac: drag it from Applications to
the Bin. **Your history is left behind on purpose** — uninstalling an
app should not delete what you wrote in it. It sits in
`%APPDATA%day-panel` on Windows and
`~/Library/Application Support/day-panel` on a Mac, and installing
again picks it back up. (The folder keeps the app's first name, Day
Panel, so that renaming the app never lost anyone's data.) To be rid of
it as well, delete that folder by hand.

## Running it without installing

**In a browser.** Open `index.html`. That is the whole setup, though
there is no widget, no reminder and no updates that way.

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

That builds for the system you are on. Windows builds on Windows; the
Mac version has to be built on a Mac, because only there can it be
signed well enough to open. Releases are built by GitHub on both (see
`.github/workflows/release.yml`) whenever a version tag is pushed.

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

**Filling in a day you missed.** Press any day on the calendar and the
page moves to it: the habit tiles, the task list and the note all
become that day's, edited exactly as today is. A day nobody filled in
is drawn as unknown rather than failed, and left out of every figure —
the app not being open on Sunday is not the same as failing on Sunday.
Days still to come take notes and tasks but not habit values, because
nothing has happened on them yet.

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

**Money.** A tab of its own for what you spend. Pick a category, type
the amount — `12.50`, `12,50` and `1 240,50` all work — add a word about
what it was if you like, and press Enter. The category stays picked, so
three coffees in a row are three quick entries.

Below that, Day / Week / Month / Year with arrows to step back. The total
leads, with how it compares: while a period is still running it is set
against the same stretch of the one before — this month so far against
last month *to the same date* — because comparing a half-finished month
with a whole one says "you spent less" every day until the month ends.
A ring shows where it went, one piece highlighted and the rest in grey;
point at a category in the list beside it and the centre says what share
it took. Bars show the periods before, the current one in the accent.

The ring is grey on purpose. Measured against these card colours, no
more than three hues stay reliably tell-apart-able once any two
categories can land side by side — and a spending list needs six or
eight. So the names are in the list, where colour never has to carry
them. Amounts are kept in whole cents, so nothing drifts.

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
js/history.js    the grid and the figures
js/notes.js      the notes archive
js/panel.js      tasks, countdowns, the note
js/insights.js   the patterns, and the rules for staying quiet
js/money.js      spending: entry, the ring, the trend, categories
js/weather.js    Open-Meteo
js/widget.js     the widget, and the daily reminder
js/update-ui.js  the update button, shared by the panel and the widget
js/main.js       clock, theme, menu, views
desktop/main.js  Electron: windows, tray, the app:// scheme
desktop/vault.js the data file in a folder you choose
desktop/updates.js  finding, downloading and installing a new version
.github/         the release build for Windows and Mac
scripts/         the icon, drawn in code
```

Plain scripts, no build step, no framework. The desktop app serves the
same files from `app://panel` rather than `file://` or a local port, so
both windows share one storage and that storage is the same on every
launch.
