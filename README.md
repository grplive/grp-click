# GRP Click

Control PowerPoint and Keynote on other computers from Bitfocus Companion: next slide, previous slide, first, last, go to a slide number, start and end the show.

This folder has the source. The ready-to-install files are in [release/](release/).

| File | Install on | What it is |
|---|---|---|
| `GRP-Click-Receiver-Mac-AppleSilicon.pkg` | Mac with Apple silicon (M1 or later) | Receiver installer |
| `GRP-Click-Receiver-Mac-Intel.pkg` | Intel Mac | Receiver installer |
| `GRP-Click-Receiver-Windows.zip` | Windows PC | Receiver installer (unzip, then double-click `install.bat`) |
| `grp-click-1.0.0.tgz` | The Companion computer | GRP Click Companion module |

## 1. Install a receiver on each presentation computer

Each presentation computer runs one receiver. It needs no other software.

**Mac**
1. Double-click the `.pkg` for your Mac. Pick Apple silicon or Intel (Apple menu → About This Mac shows the chip).
2. Follow the installer. It starts the receiver when you log in. Because this build is not notarized, you may need to right-click the `.pkg` and choose **Open** the first time.
3. The first time you send a command, macOS asks whether the receiver may control PowerPoint or Keynote. Click **OK**. Changed your mind later? System Settings → Privacy & Security → Automation.

**Windows**
1. Unzip the file and double-click `install.bat`. Approve the administrator prompt.
2. At the end the window shows this computer's **IP address**. Write it down.
3. Windows may say "unknown publisher" because the build is not code-signed. Click **More info** → **Run anyway**.

Run the installer while logged in to the same account that runs PowerPoint. The receiver controls the apps in your own desktop session.

## 2. Note each machine's IP address

Use the IP address of each presentation computer on your network (not 127.0.0.1).

- **Mac:** System Settings → Network → your connection → Details → TCP/IP shows the IP address.
- **Windows:** the IP is printed at the end of `install.bat`, or run `ipconfig` in a Command Prompt.

## 3. Set up the Companion module

1. Import `grp-click-1.0.0.tgz` into Companion as a connection module. The exact menu depends on your Companion version: look for module import or install from file under Settings or the Connections page.
2. Add a **GRP Click** connection.
3. Fill in the **Port**. Use 8765 unless you changed it on the receiver.
4. For each machine, fill in **Machine N IP**. Machines 1 to 10 are available. Leave unused slots blank.
5. Each action has a **Machine** dropdown (1 to 10). Pick the machine to control. The preset buttons target Machine 1 by default.

The instance status shows how many machines are connected. Each machine reconnects automatically if its receiver restarts.

## Receiver commands

| Command | PowerPoint (Mac and Windows) | Keynote (Mac) |
|---|---|---|
| Next, previous | yes | yes |
| First, last | yes | yes |
| Go to slide N | yes | not supported |
| Start, end show | yes | yes |

**Keynote:** the receiver uses Keynote when Keynote is running and PowerPoint is not. If both are running, it uses PowerPoint.

## Security

- There is no password or token. Anyone on the same network who can reach port 8765 can control the slides.
- Use GRP Click only on a private network you trust. Do not expose the port to the internet or to guest Wi-Fi.
- Commands are not encrypted.

## Source layout

- `receiver/` - receiver source. `receiver.js` is the server, `drivers.js` controls PowerPoint and Keynote, `send-test.js` sends a test command. `build/build.js` builds the installers.
- `companion-module/` - Companion module source in `src/main.js`, manifest in `companion/manifest.json`.

To rebuild: run `npm install` and `npm run build` in `receiver/` (the Mac installers need a Mac), and `npm install` then `npx companion-module-build` in `companion-module/`.

## Known limits

- **Not yet run on real PowerPoint or Keynote.** The command routing and installer packaging were tested here, but the AppleScript and PowerShell calls that actually move slides still need a test run on each app. If a command fails, the receiver prints the reason in its log.
- **Not code-signed or notarized.** macOS and Windows will warn on first install. Signing needs an Apple Developer ID and a Windows code-signing certificate.
- **Companion module not loaded in Companion yet.** It builds and passes a routing test against a live receiver, but has not been loaded in a running Companion instance.
- **Repository and bugs links** in the manifest are placeholders (`https://grp.live`).
