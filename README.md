# GRP Click

Change slides in **PowerPoint** (Mac and Windows) and **Keynote** (Mac) from Bitfocus Companion and a Stream Deck, from [GRP Live](https://grp.live).

- Next, back, first, last, go to slide, start and end the show
- Up to 10 presentation machines from one Companion connection
- Buttons turn red when a machine can't be reached and amber when a press didn't work
- Never opens PowerPoint or Keynote and never sends key presses: it only talks to the show that's open

Goes with [GRP Stage Timer](https://github.com/grplive/grp-stage-timer) and [GRP Notes](https://github.com/grplive/grp-notes).

## Download

**Receiver**, for each presentation machine:

| | |
|---|---|
| **Mac – Apple Silicon** (M1 and later) | [GRP-Click-Receiver-Mac-Apple-Silicon.pkg](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Receiver-Mac-Apple-Silicon.pkg) |
| **Mac – Intel** | [GRP-Click-Receiver-Mac-Intel.pkg](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Receiver-Mac-Intel.pkg) |
| **Windows** (64-bit) · *not tested yet, see below* | [GRP-Click-Receiver-Windows.zip](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Receiver-Windows.zip) |

**Companion module**, for the Companion machine: [GRP-Click-Companion-Module.tgz](https://github.com/grplive/grp-click/releases/latest/download/GRP-Click-Companion-Module.tgz)

Not sure which Mac? Apple menu → About This Mac: "Chip: Apple M…" is Apple Silicon, "Processor: Intel" is Intel.

Older versions and release notes: [Releases](https://github.com/grplive/grp-click/releases).

### Installing the receiver

The receiver has no window. It starts by itself when you log in. Install it while logged in as the person who runs PowerPoint or Keynote.

The installers aren't signed with Apple or Microsoft yet, so the first install needs one extra step:

- **Mac:** double-click the .pkg. When macOS says it can't check it, click **Done**. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**, then follow the installer. The first time Companion sends a command, macOS asks whether *grp-click-receiver* may control PowerPoint or Keynote: click **OK**. Do one test press before the show. After an update macOS may ask again.
- **Windows:** unzip, then double-click **install.bat** and approve the administrator prompt. If "Windows protected your PC" appears, click **More info → Run anyway**. The window shows the machine's IP address at the end.

Updating: install the new version over the top.

### Windows: not tested yet

The Windows receiver (PowerPoint for Windows) hasn't been tried on a Windows machine yet. Use a Mac for shows until it has; problems are welcome via grp.live.

## Bitfocus Companion

1. Companion → Modules → **Import module package** → the .tgz (until it's in Companion's own module list).
2. Add a **GRP Live: Click** connection.
3. Enter each presentation machine's IP address (Machine 1–10). Leave the port at 8765.
4. Drag the presets onto your buttons. They target Machine 1 or 2; change the **Machine** option for others.

Mac IP address: System Settings → Network → your connection → Details. Windows: shown at the end of install.bat, or run `ipconfig`.

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

No password and no encryption: anyone on the same network who can reach port 8765 can change the slides. Use it on a private show network, never on guest or venue Wi-Fi. The Windows installer opens port 8765 for the receiver only.

## Network API

The receiver listens on TCP port **8765**. Send one JSON object per line; each gets a one-line reply.

```
{"cmd":"next"}            {"ok":true,"cmd":"next"}
{"cmd":"goto","slide":4}  {"ok":false,"cmd":"goto","error":"There is no slide 4"}
{"cmd":"ping"}            {"ok":true,"cmd":"ping","app":"…","platform":"darwin","version":"1.1.0"}
```

Commands: `ping`, `next`, `prev`, `first`, `last`, `goto` (with `slide`), `start`, `stop`.

Settings are in `config.json` next to the log (`~/Library/Application Support/GRP Click/` on Mac, `%APPDATA%\GRP Click\` on Windows): `port`, `bind`, and `app` (`auto`, `powerpoint` or `keynote`). Restart the receiver (log out and in) after changing them.

## Source

- `receiver/`: `receiver.js` (start-up, config, log), `server.js` (network), `drivers.js` (PowerPoint and Keynote), `send-test.js` (send one command by hand), `build/` (installers). `npm test` runs the tests; on a Mac with PowerPoint and Keynote it also checks every AppleScript compiles.
- `companion-module/`: the Companion module (`src/main.js`), built with `npm run package`.
- `scripts/release.sh --build` tests and builds everything into `release/GRP Click/` for the NAS. `scripts/publish-github.sh` publishes the GitHub release (commit and push first, and write `scripts/release-notes/<version>.md`).

## Help

Questions or problems: [grp.live](https://grp.live).

© GRP Live. Free to download and use. MIT licence.
