'use strict'
// Platform drivers that control the presentation app.
// Each driver exposes exec(cmd, { slide }) and throws an Error with a short, readable message
// if the command can't be done.
//
// Rules for every driver:
// - Never start PowerPoint or Keynote. If the app isn't open, say so.
// - Never send key presses. A key press goes to whichever app is in front, which on a show
//   machine could be anything (the timer, a browser, the notes app).

const { execFile } = require('child_process')

function run(file, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()))
      resolve(stdout.trim())
    })
  })
}

// ---------- macOS: AppleScript ----------

// Turns osascript's "123:456: execution error: Keynote isn't open (9001)" into "Keynote isn't open".
function cleanAppleScriptError(text) {
  if (/\(-1743\)/.test(text) || /Not authori[sz]ed to send Apple events/i.test(text)) {
    return 'macOS has not allowed GRP Click to control this app. System Settings > Privacy & Security > Automation: turn on PowerPoint/Keynote under grp-click-receiver.'
  }
  const m = text.match(/execution error: (?:[^:]+ got an error: )?([\s\S]*?) \(-?\d+\)\s*$/)
  return (m ? m[1] : text).trim()
}

// Each line is passed as its own -e argument, so no shell quoting is involved.
async function osascript(lines) {
  try {
    return await run('osascript', lines.flatMap((line) => ['-e', line]))
  } catch (err) {
    throw new Error(cleanAppleScriptError(err.message))
  }
}

// `is running` checks without launching the app.
const notOpen = (app, label) => `if application "${app}" is not running then error "${label} isn't open" number 9001`

const PPT = 'Microsoft PowerPoint'
const pptShow = (body) => [
  notOpen(PPT, 'PowerPoint'),
  `tell application "${PPT}"`,
  '  if (count of slide show windows) = 0 then error "No PowerPoint slideshow is running" number 9002',
  '  set v to slideshow view of slide show window 1',
  ...body.map((l) => `  ${l}`),
  'end tell',
]

const macPowerPointScripts = {
  next: () => pptShow(['go to next slide v']),
  prev: () => pptShow(['go to previous slide v']),
  first: () => pptShow(['go to first slide v']),
  last: () => pptShow(['go to last slide v']),
  // PowerPoint for Mac's AppleScript can only jump to a slide in the editing view, not in a
  // running show (tested 2026-11-15, PowerPoint 16.115). The workarounds either flash through
  // slides on screen or need key presses, so say plainly that it isn't there.
  goto: () => pptShow(['error "Go to slide is not available in PowerPoint for Mac (it works in Keynote and PowerPoint for Windows)" number 9005']),
  start: () => [
    notOpen(PPT, 'PowerPoint'),
    `tell application "${PPT}"`,
    '  if (count of slide show windows) > 0 then return',
    '  if (count of presentations) = 0 then error "No presentation is open in PowerPoint" number 9004',
    '  run slide show slide show settings of active presentation',
    'end tell',
  ],
  stop: () => [
    notOpen(PPT, 'PowerPoint'),
    `tell application "${PPT}"`,
    '  if (count of slide show windows) > 0 then exit slide show slideshow view of slide show window 1',
    'end tell',
  ],
}

// Keynote only accepts "show next/previous" while it is the frontmost app ("No window" otherwise),
// so those two bring Keynote to the front first. Jumping to a slide works without that.
const kn = (body, { needsPlaying = true } = {}) => [
  notOpen('Keynote', 'Keynote'),
  'tell application "Keynote"',
  ...(needsPlaying ? ['  if not playing then error "No Keynote slideshow is running" number 9002'] : []),
  ...body.map((l) => `  ${l}`),
  'end tell',
]
const knStep = (cmd) => kn(['if not frontmost then', '  activate', '  delay 0.1', 'end if', cmd])
// Slide numbers are Keynote's own: skipped slides have no number, as in Keynote's slide navigator.
const knJump = (target) => kn(['set d to front document', `set current slide of d to (${target})`])

const macKeynoteScripts = {
  next: () => knStep('show next'),
  prev: () => knStep('show previous'),
  first: () => knJump('first slide of d whose skipped is false'),
  last: () => knJump('last slide of d whose skipped is false'),
  goto: (slide) =>
    kn([
      'set d to front document',
      `if not (exists (first slide of d whose slide number is ${slide})) then error "There is no slide ${slide}" number 9003`,
      `set current slide of d to (first slide of d whose slide number is ${slide})`,
    ]),
  start: () =>
    kn(
      [
        'if playing then return',
        'if (count of documents) = 0 then error "No presentation is open in Keynote" number 9004',
        'set d to front document',
        'start d from (first slide of d whose skipped is false)',
      ],
      { needsPlaying: false }
    ),
  stop: () => kn(['if playing then stop front document'], { needsPlaying: false }),
}

const macDriver = (name, scripts) => ({
  name,
  scripts,
  async exec(cmd, { slide } = {}) {
    await osascript(scripts[cmd](slide))
  },
})

const macPowerPoint = macDriver('PowerPoint (Mac)', macPowerPointScripts)
const macKeynote = macDriver('Keynote (Mac)', macKeynoteScripts)

function isRunning(processName) {
  return run('pgrep', ['-x', processName]).then(
    () => true,
    () => false
  )
}

// Mac "auto": use Keynote only when it is open and PowerPoint is not. Otherwise PowerPoint.
// Decided per command, so you can switch apps freely.
const macAuto = {
  name: 'Auto (Mac: Keynote or PowerPoint)',
  async exec(cmd, args) {
    const [keynoteUp, pptUp] = await Promise.all([isRunning('Keynote'), isRunning(PPT)])
    if (!keynoteUp && !pptUp) throw new Error("Neither PowerPoint nor Keynote is open")
    const target = keynoteUp && !pptUp ? macKeynote : macPowerPoint
    return target.exec(cmd, args)
  },
}

// ---------- Windows: PowerPoint COM automation through PowerShell ----------

// Script is sent base64-encoded so quotes and newlines survive intact.
async function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  try {
    return await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded])
  } catch (err) {
    // PowerShell adds "At line:3 char:1 ..." after the message; keep the first line.
    throw new Error(err.message.split(/\r?\n/)[0].replace(/^Exception calling .*?: "(.*)"$/, '$1'))
  }
}

// Attaches to the PowerPoint that is already open (never starts a new one).
const PPT_WIN_APP = `
$ErrorActionPreference = 'Stop'
try { $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') }
catch { throw "PowerPoint isn't open" }
`
const PPT_WIN_VIEW = `${PPT_WIN_APP}
if ($app.SlideShowWindows.Count -lt 1) { throw 'No PowerPoint slideshow is running' }
$win = $app.SlideShowWindows.Item(1)
$view = $win.View
`

const winPowerPointScripts = {
  next: () => `${PPT_WIN_VIEW}$view.Next()`,
  prev: () => `${PPT_WIN_VIEW}$view.Previous()`,
  first: () => `${PPT_WIN_VIEW}$view.First()`,
  last: () => `${PPT_WIN_VIEW}$view.Last()`,
  goto: (slide) => `${PPT_WIN_VIEW}
if (${slide} -gt $win.Presentation.Slides.Count) { throw 'There is no slide ${slide}' }
$view.GotoSlide(${slide})`,
  start: () => `${PPT_WIN_APP}
if ($app.SlideShowWindows.Count -gt 0) { return }
if ($app.Presentations.Count -lt 1) { throw 'No presentation is open in PowerPoint' }
$null = $app.ActivePresentation.SlideShowSettings.Run()`,
  stop: () => `${PPT_WIN_APP}
if ($app.SlideShowWindows.Count -gt 0) { $app.SlideShowWindows.Item(1).View.Exit() }`,
}

const winPowerPoint = {
  name: 'PowerPoint (Windows)',
  scripts: winPowerPointScripts,
  async exec(cmd, { slide } = {}) {
    await powershell(winPowerPointScripts[cmd](slide))
  },
}

// ---------- Selection ----------

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

module.exports = { createDriver, cleanAppleScriptError, macPowerPointScripts, macKeynoteScripts, winPowerPointScripts }
