#!/usr/bin/env bash
# The Linux build, installed and started on a clean Fedora (the release
# workflow runs this in a fedora container, as root, with the built files
# in $1). Everything it finds goes to check/: a report, the app's own
# log, and pictures of its windows.
set -uo pipefail

DIST=${1:-dist}
OUT=check
mkdir -p "$OUT"
say() { echo "$*" | tee -a "$OUT/report.txt"; }
fail=0

say "== Fedora: $(cat /etc/fedora-release)"

# What Fedora needs to install the package, and a screen to run it on.
dnf -y -q install "$DIST"/Daybook-*.x86_64.rpm \
  xorg-x11-server-Xvfb xwininfo ImageMagick nodejs dbus-daemon dbus-x11 mesa-dri-drivers >/dev/null \
  || { say "FAIL  the .rpm did not install"; exit 1; }

PKG=$(rpm -qp --qf '%{NAME}' "$DIST"/Daybook-*.x86_64.rpm)
say "ok    installed package '$PKG' $(rpm -q --qf '%{VERSION}' "$PKG")"
DESKTOP=$(rpm -ql "$PKG" | grep '/usr/share/applications/.*\.desktop$' | head -1)
say "      menu entry: $DESKTOP"
sed 's/^/        /' "$DESKTOP" | tee -a "$OUT/report.txt"
BIN=$(grep '^Exec=' "$DESKTOP" | head -1 | sed 's/^Exec=//; s/ %U$//; s/^"//; s/"$//')
ICON=$(grep '^Icon=' "$DESKTOP" | sed 's/^Icon=//')
say "      icons installed for '$ICON':"
rpm -ql "$PKG" | grep "/icons/.*/$ICON\.png$" | sed 's/^/        /' | tee -a "$OUT/report.txt"
if rpm -ql "$PKG" | grep -q "/icons/hicolor/256x256/apps/$ICON\.png$"; then
  say "ok    the icon comes in the usual sizes"
else
  say "FAIL  no 256x256 icon, so the dock may show none"; fail=1
fi

# A screen, and a session bus as a desktop would have.
Xvfb :99 -screen 0 1600x1000x24 >/dev/null 2>&1 &
export DISPLAY=:99
eval "$(dbus-launch --sh-syntax)"
sleep 2

# Root inside a container needs --no-sandbox; nothing else is changed.
export DAYBOOK_PROFILE=ci
"$BIN" --no-sandbox --remote-debugging-port=9333 >"$OUT/app.log" 2>&1 &
APP=$!
sleep 12

node "$(dirname "$0")/check.js" "$OUT" || fail=1

# The windows as the X server has them: their names and WM_CLASS, which
# the desktop matches against StartupWMClass to give them the app's icon.
# Only the two real windows, titled "Daybook": Chromium also keeps tiny
# helper windows, with a class of their own, that the dock never sees.
xwininfo -root -tree | grep '"Daybook": ' | sed 's/^ */        /' | tee "$OUT/windows.txt"
WMCLASS=$(grep '^StartupWMClass=' "$DESKTOP" | sed 's/^StartupWMClass=//')
if [ "$(grep -c . "$OUT/windows.txt")" -ge 2 ] && ! grep -v "\"$WMCLASS\")" "$OUT/windows.txt" | grep -q .; then
  say "ok    both windows' class matches the menu entry ($WMCLASS)"
else
  say "FAIL  not every window has the class '$WMCLASS' the menu entry expects"; fail=1
fi
import -window root "$OUT/screen.png" 2>/dev/null

kill $APP 2>/dev/null; sleep 2

say ""
say "== the app's own log"
cat "$OUT/app.log"
if grep -qE 'failed to load|Uncaught|\] (TypeError|ReferenceError|SyntaxError)' "$OUT/app.log"; then
  say "FAIL  errors in the app's log"; fail=1
fi

# The AppImage: started the way a person would, apart from unpacking
# itself instead of mounting (there is no FUSE inside a container).
APPIMAGE_FILE=$(ls "$DIST"/Daybook-*.AppImage | head -1)
say ""
say "== AppImage: $(basename "$APPIMAGE_FILE")"
if head -c 3000000 "$APPIMAGE_FILE" | grep -q 'libfuse.so.2'; then
  say "note  its runtime wants libfuse.so.2 (Fedora: sudo dnf install fuse-libs)"
else
  say "ok    its runtime does not need libfuse.so.2"
fi
chmod +x "$APPIMAGE_FILE"
DAYBOOK_PROFILE=ci-appimage "$APPIMAGE_FILE" --appimage-extract-and-run --no-sandbox >"$OUT/appimage.log" 2>&1 &
AI=$!
sleep 15
if grep -q 'widget loaded' "$OUT/appimage.log"; then
  say "ok    the AppImage starts and loads the widget"
else
  say "FAIL  the AppImage did not load the widget"; fail=1
fi
grep '^update:' "$OUT/appimage.log" | sed 's/^/      /' | tee -a "$OUT/report.txt"
kill $AI 2>/dev/null

exit $fail
