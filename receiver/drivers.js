'use strict'
// Platform drivers that control the presentation app.
// Each driver exposes exec(cmd, { slide }) and throws if the command can't be done.

const { execFile } = require('child_process')

function run(file, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()))
      resolve(stdout.trim())
    })
  })
}

// Each AppleScript line is passed as its own -e argument, so no shell quoting is involved.
function osascript(lines) {
  return run('osascript', lines.flatMap((line) => ['-e', line]))
}

// Script is sent base64-encoded so quotes and newlines survive intact.
function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded])
}

const unsupported = (cmd, name) => new Error(`"${cmd}" is not supported by ${name}`)

// ---------- macOS: AppleScript, with System Events key presses as a fallback ----------

// Key codes: 123 = left arrow, 124 = right arrow, 115 = Home, 119 = End
const MAC_KEYS = { next: 124, prev: 123, first: 115, last: 119 }

function macDriver({ name, processName, scripts, keys = MAC_KEYS }) {
  return {
    name,
    async exec(cmd, { slide } = {}) {
      const build = scripts[cmd]
      if (!build) throw unsupported(cmd, name)
      try {
        await osascript(build(slide))
      } catch (err) {
        // Dictionary call failed (version differences, no show running, etc.).
        // Fall back to a key press. This needs Accessibility permission for the receiver.
        if (!keys[cmd]) throw err
        await osascript([`tell application "System Events" to tell process "${processName}" to key code ${keys[cmd]}`])
      }
    },
  }
}

const macPowerPoint = macDriver({
  name: 'PowerPoint (Mac)',
  processName: 'Microsoft PowerPoint',
  scripts: {
    next: () => ['tell application "Microsoft PowerPoint"', '  tell slide show view of slide show window 1 to go to next slide', 'end tell'],
    prev: () => ['tell application "Microsoft PowerPoint"', '  tell slide show view of slide show window 1 to go to previous slide', 'end tell'],
    first: () => ['tell application "Microsoft PowerPoint"', '  tell slide show view of slide show window 1 to go to first slide', 'end tell'],
    last: () => ['tell application "Microsoft PowerPoint"', '  tell slide show view of slide show window 1 to go to last slide', 'end tell'],
    goto: (slide) => ['tell application "Microsoft PowerPoint"', `  tell slide show view of slide show window 1 to go to slide slide index ${slide}`, 'end tell'],
    start: () => ['tell application "Microsoft PowerPoint"', '  run slide show slide show settings of active presentation', 'end tell'],
    stop: () => ['tell application "Microsoft PowerPoint"', '  exit slide show slide show view of slide show window 1', 'end tell'],
  },
})

const macKeynote = macDriver({
  name: 'Keynote (Mac)',
  processName: 'Keynote',
  scripts: {
    next: () => ['tell application "Keynote" to show next'],
    prev: () => ['tell application "Keynote" to show previous'],
    start: () => ['tell application "Keynote" to start front document'],
    stop: () => ['tell application "Keynote" to stop front document'],
    // Keynote has no reliable "go to slide N" in AppleScript, so first/last/goto are not offered.
  },
  keys: { next: 124, prev: 123 },
})

// ---------- Windows: PowerPoint COM automation through PowerShell ----------

// Attaches to the PowerPoint that is already running (does not start a new one).
const PPT_WIN_PRELUDE = `
$ErrorActionPreference = 'Stop'
$app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
$windows = $app.SlideShowWindows
if ($windows.Count -lt 1) { throw 'No slide show is running' }
$view = $windows.Item(1).View
`

const winPowerPointScripts = {
  next: () => `${PPT_WIN_PRELUDE}$view.Next()`,
  prev: () => `${PPT_WIN_PRELUDE}$view.Previous()`,
  first: () => `${PPT_WIN_PRELUDE}$view.First()`,
  last: () => `${PPT_WIN_PRELUDE}$view.Last()`,
  goto: (slide) => `${PPT_WIN_PRELUDE}$view.GotoSlide(${slide})`,
  stop: () => `${PPT_WIN_PRELUDE}$view.Exit()`,
  start: () => `
$ErrorActionPreference = 'Stop'
$app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
$null = $app.ActivePresentation.SlideShowSettings.Run()`,
}

const winPowerPoint = {
  name: 'PowerPoint (Windows)',
  async exec(cmd, { slide } = {}) {
    const build = winPowerPointScripts[cmd]
    if (!build) throw unsupported(cmd, this.name)
    await powershell(build(slide))
  },
}

// ---------- Selection ----------

function isRunning(processName) {
  return run('pgrep', ['-x', processName]).then(() => true, () => false)
}

// Mac "auto": use Keynote only when it is running and PowerPoint is not.
// Otherwise PowerPoint. The choice is made per command, so you can switch apps freely.
const macAuto = {
  name: 'Auto (Mac: Keynote or PowerPoint)',
  async exec(cmd, args) {
    const keynoteUp = await isRunning('Keynote')
    const pptUp = await isRunning('Microsoft PowerPoint')
    const target = keynoteUp && !pptUp ? macKeynote : macPowerPoint
    return target.exec(cmd, args)
  },
}

function createDriver(app) {
  const platform = process.platform
  if (platform === 'darwin') {
    if (app === 'auto') return macAuto
    if (app === 'powerpoint') return macPowerPoint
    if (app === 'keynote') return macKeynote
  }
  if (platform === 'win32' && (app === 'auto' || app === 'powerpoint')) return winPowerPoint
  throw new Error(`app "${app}" is not available on ${platform} (Keynote is Mac only)`)
}

module.exports = { createDriver }
