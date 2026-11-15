# GRP Click

Change slides in **PowerPoint** (Mac and Windows) and **Keynote** (Mac) from Bitfocus Companion and a Stream Deck, from [GRP Live](https://grp.live).

- Next, back, first, last, go to slide, start and end the show
- Up to 10 presentation machines from one Companion connection
- Shows where each show is (e.g. 2/12) on a button, even when the presenter uses their own clicker
- Buttons turn red when a machine can't be reached and amber when a press didn't work
- A window on each presentation machine shows it's connected and working
- Never opens PowerPoint or Keynote and never sends key presses: it only talks to the show that's open

Goes with [GRP Stage Timer](https://github.com/grplive/grp-stage-timer) and [GRP Notes](https://github.com/grplive/grp-notes).

## Download

**GRP Click**, for each presentation machine:

| | |
|---|---|
| **Mac – Apple Silicon** (M1 and later) | [GRP-Click-Mac-Apple-Silicon.dmg](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Mac-Apple-Silicon.dmg) |
| **Mac – Intel** | [GRP-Click-Mac-Intel.dmg](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Mac-Intel.dmg) |
| **Windows** (64-bit) · *not tested yet, see below* | [GRP-Click-Windows-Setup.exe](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Windows-Setup.exe) |

**Companion module**, for the Companion machine: [GRP-Click-Companion-Module.tgz](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Companion-Module.tgz)

Not sure which Mac? Apple menu → About This Mac: "Chip: Apple M…" is Apple Silicon, "Processor: Intel" is Intel.

Older versions and release notes: [Releases](https://github.com/grplive/grp-click/releases).

### The app

GRP Click opens a window that shows:

- **Companion connected** (green) or **Waiting for Companion**
- the app and slide on the presentation machine, e.g. *Keynote · 2 / 12*
- this computer's IP addresses, to type into Companion
- the last few commands, with ✓ or the reason one didn't work

Close the window and it keeps running in the menu bar (Mac) or system tray (Windows), showing the slide there too. It opens when the computer starts (untick that in the window if you don't want it).

### First time you open it

The app isn't signed with Apple or Microsoft yet, so the first launch needs one extra step:

- **Mac:** open the .dmg and drag GRP Click to Applications, then open it. When macOS says it can't verify the app, click **Done**. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. You only do this once. The first time it controls PowerPoint or Keynote, macOS asks whether GRP Click may: click **OK**. Open the deck with GRP Click running before the show, so this is out of the way.
- **Windows:** if "Windows protected your PC" appears, click **More info → Run anyway**, and allow network access when Windows Firewall asks.

Updating: install the new version over the top. The app tells you when a new version is out.

### Windows: not tested yet

The Windows version (PowerPoint for Windows) hasn't been tried on a Windows machine yet. Use a Mac for shows until it has; problems are welcome via grp.live.

## Bitfocus Companion

The module comes with GRP Click rather than through Companion's built-in module list.

1. Companion → Modules → **Import module package** → [GRP-Click-Companion-Module.tgz](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Companion-Module.tgz). Import a newer .tgz the same way to update.
2. Add a **GRP Live: Click** connection.
3. Enter each presentation machine's IP address (Machine 1–10). Leave the port at 8765.
4. Drag the presets onto your buttons. They target Machine 1 or 2; change the **Machine** option for others.

The IP addresses are shown in the GRP Click window on each machine.

## What works where

| | PowerPoint (Mac) | PowerPoint (Windows) | Keynote (Mac) |
|---|---|---|---|
| Next, back | yes | yes | yes |
| First, last | yes | yes | yes |
| Go to slide | no (PowerPoint for Mac can't) | yes | yes |
| Start, end show | yes | yes | yes |

- Open the presentation first. GRP Click never opens an app.
- On a Mac with both open, it controls the one with a slideshow running; otherwise the one with a presentation open; otherwise the one in front.
- Keynote only takes Next/Back while it's the front app, so a press brings the show to the front if something else was clicked.
- Keynote slide numbers are Keynote's own: skipped slides have no number.

## Security

No password and no encryption: anyone on the same network who can reach port 8765 can change the slides. Use it on a private show network, never on guest or venue Wi-Fi. The window's *Last commands* shows where every command came from.

## Network API

GRP Click listens on TCP port **8765**. Send one JSON object per line; each gets a one-line reply.

```
{"cmd":"next"}            {"ok":true,"cmd":"next"}
{"cmd":"goto","slide":4}  {"ok":false,"cmd":"goto","error":"There is no slide 4"}
{"cmd":"ping"}            {"ok":true,"cmd":"ping","app":"…","platform":"darwin","version":"1.1.0"}
```

Commands: `ping`, `next`, `prev`, `first`, `last`, `goto` (with `slide`), `start`, `stop`.

While connected, GRP Click also sends the slide position whenever it changes (checked every second, and straight after each command; every 2 seconds on Windows):

```
{"event":"status","app":"keynote","open":true,"playing":true,"slide":2,"total":12,"end":false}
```

Numbering follows each app, as in GRP Notes: PowerPoint counts every slide (hidden ones too), Keynote uses its own numbers (skipped slides have none). `end` is true on PowerPoint's black end-of-show screen.

## Source

- `app/`: the Electron app. `main.js` (window, menu bar / tray), `src/server.js` (network), `src/drivers.js` (PowerPoint and Keynote), `src/window.html` / `window.js` (the window), `send-test.js` (send one command by hand). `npm test` runs the tests; on a Mac with PowerPoint and Keynote it also checks every AppleScript compiles. `npm start` runs it from source.
- `companion-module/`: the Companion module (`src/main.js`), built with `npm run package`.
- `scripts/release.sh --build` tests and builds everything into `release/GRP Click/` for the NAS. `scripts/publish-github.sh` publishes the GitHub release (commit and push first, and write `scripts/release-notes/<version>.md`).

## Help

Questions or problems: [grp.live](https://grp.live).

© GRP Live. Free to download and use. MIT licence.
