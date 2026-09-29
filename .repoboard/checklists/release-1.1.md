# Release 1.1

Everything that has to be true before Daybook 1.1.0 ships, and before
every version after it. The version is renamed from Day Panel in this
release, gains a Mac build and an in-app updater, so most of what can go
wrong is about data surviving the change and the update path working.

## Data

- [?] The app opens onto the history it had before the rename
  - Verify: install 1.1.0 over 1.0.0 (or run it after the development copy) and check the habits, calendar and notes are all there.
  - Source: Electron names its data folder after the product. Renaming "Day Panel" to "Daybook" would otherwise have opened every existing user onto an empty profile.
  - Proof: desktop/main.js pins userData to "day-panel". Ran the packaged build (release/win-unpacked/Daybook.exe): %APPDATA%\day-panel was used and no %APPDATA%\Daybook folder was created.
- [ ] Quitting completely and starting again keeps everything
  - Verify: pick a habit, quit from the icon by the clock, start again — the habit is there.
  - Source: until 1.0 every launch was a new origin and an empty panel. This is the check that would have caught it.
- [?] Only one copy of the app can run at a time
  - Verify: start it, double-click the shortcut again — no second widget or tray icon.
  - Source: two copies would each hold their own idea of the data and overwrite each other.
  - Proof: verified on 1.0.0 (process count unchanged on a second launch); the lock in desktop/main.js is unchanged in 1.1.
- [ ] Uninstalling leaves the history behind
  - Verify: uninstall, check %APPDATA%\day-panel still holds the data.
  - Source: uninstalling an app must never be what destroys what somebody wrote in it.
- [?] The sync file keeps its name, so a chosen data folder still connects
  - Verify: with a vault folder set in 1.0, open 1.1 — Settings still shows the same file, and it keeps being written.
  - Source: the vault finds its file by name; renaming day-panel.json would have silently cut every synced setup loose.
  - Proof: desktop/vault.js FILE_NAME is still "day-panel.json"; only downloaded backups were renamed to daybook-*.json.

## Money

- [?] Amounts are exact to the cent
  - Verify: add 0.10 and 0.20 — the total is 0.30.
  - Source: a money page that drifts by a cent is one nobody trusts.
  - Proof: 19 parse cases checked in the browser, including "12,50", "1 240,50", "1.240,50"; 0.10 + 0.20 came to exactly 30 cents.
- [?] A running period is compared with the same stretch of the one before
  - Verify: part-way through a month, the comparison says "at this point last month" and the numbers match the same dates.
  - Source: comparing a half-finished month with a whole one says "less" every day until the month ends.
  - Proof: on test data the page showed +48% where a whole-month comparison would have shown -5%; hand sums matched.
- [ ] Example data can be removed without touching real entries
  - Verify: add one real entry, load the example, remove the example — the real entry is still there.
  - Source: example spending mixed into real spending would make the whole page untrustworthy.

## Updates

- [?] latest.yml and the blockmap are attached to the release beside the installer
  - Verify: open the 1.1.0 release page — Daybook-Setup-1.1.0.exe, its .blockmap and latest.yml are all listed.
  - Source: an installed app finds and downloads an update by reading latest.yml; without it the update button never appears.
  - Proof: release v1.1.0 lists all five files. Downloaded latest.yml and the installer without credentials: latest.yml says 1.1.0, size 80453727, and its sha512 matches the downloaded Daybook-Setup-1.1.0.exe exactly, so the updater's integrity check will pass.
- [?] An installed 1.1.0 asks GitHub and correctly finds nothing newer
  - Verify: Settings → Updates says "Up to date".
  - Source: an updater that reports an update that is not there, or an error, trains people to ignore it.
  - Proof: ran the packaged build with its log to a file: "update: checking" then "update: latest" against the release page that still had 1.0.0 as newest.
- [ ] An installed 1.1.0 finds, downloads and installs the next version
  - Verify: once 1.1.1 or 1.2.0 is out, the button appears, downloads, and restarts into it with the data intact.
  - Source: this can only be proven with a version after this one; 1.0.0 had no updater, so people on it download 1.1.0 by hand once.

## Mac

- [ ] The Mac build opens on an Apple-silicon Mac after "Open Anyway"
  - Verify: on a real Mac, open the dmg, drag to Applications, allow it in Privacy & Security, and it starts.
  - Source: built by GitHub on a Mac runner with ad-hoc signing ("identity": "-"). Nobody on this project has a Mac to try it on.
  - Note: the build log (run 36537513803) shows "packaging platform=darwin arch=universal" and "signing file=release/mac-universal/Daybook.app ... identityName=-", so it is a universal binary and ad-hoc signed. Notarization skipped, as expected without an Apple account. Whether it opens is still for a person on a Mac to confirm.
- [ ] Copy and paste work in the Mac version
  - Verify: Cmd+V pastes an amount into the money tab.
  - Source: on a Mac the edit shortcuts come from the app menu; the menu is kept there for exactly this.

## The release page

- [?] The page explains the Windows and Mac warnings
  - Verify: both are described, with what to press, and why it happens.
  - Source: an unsigned download with an unexplained warning reads as malware.
  - Proof: .github/release-notes/v1.1.0.md and the README both explain SmartScreen and Gatekeeper, and point to building from source.
- [?] The version in package.json matches the tag and the file names
  - Verify: package.json, the tag and all three downloads say 1.1.0.
  - Source: the file names come from package.json; a mismatch means bug reports against a version that does not exist.
  - Proof: package.json is 1.1.0, the tag is v1.1.0, and the release holds Daybook-Setup-1.1.0.exe, Daybook-1.1.0-portable.exe and Daybook-1.1.0-mac.dmg.
