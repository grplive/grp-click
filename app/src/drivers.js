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
    return "NEEDS_PERMISSION: macOS hasn't let GRP Click control this app yet. System Settings > Privacy & Security > Automation > GRP Click: turn on PowerPoint and Keynote."
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

// What's open right now, in one call. One entry per running app:
//   "<app>,<show running>,<deck open>,<frontmost>,<slide>,<total>;"
// slide/total are 0 when no show runs; slide is "missing value" on PowerPoint's end-of-show screen.
// Numbering follows each app (as GRP Notes does): PowerPoint counts every slide, hidden ones too;
// Keynote uses its own slide numbers, which skip skipped slides.
// Only asks apps that are already running, so it never launches either.
const MAC_STATE_SCRIPT = [
  'set r to ""',
  `if application "${PPT}" is running then`,
  `  tell application "${PPT}"`,
  '    set showing to (count of slide show windows) > 0',
  '    set cur to 0',
  '    set tot to 0',
  '    if showing then',
  '      try',
  '        set cur to slide index of slide of slideshow view of slide show window 1',
  '      end try',
  '      try',
  '        set tot to count of slides of presentation of slide show window 1',
  '      end try',
  '    end if',
  '    set r to r & "powerpoint," & showing & "," & ((count of presentations) > 0) & "," & frontmost & "," & cur & "," & tot & ";"',
  '  end tell',
  'end if',
  'if application "Keynote" is running then',
  '  tell application "Keynote"',
  '    set showing to playing',
  '    set cur to 0',
  '    set tot to 0',
  '    if showing then',
  '      try',
  '        set d to front document',
  '        set cur to slide number of current slide of d',
  '        set tot to count of (slides of d whose skipped is false)',
  '      end try',
  '    end if',
  '    set r to r & "keynote," & showing & "," & ((count of documents) > 0) & "," & frontmost & "," & cur & "," & tot & ";"',
  '  end tell',
  'end if',
  'return r',
]

function parseMacState(text) {
  return text
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [app, playing, open, front, slide, total] = part.split(',')
      const n = Number(slide)
      return {
        app,
        playing: playing === 'true',
        open: open === 'true',
        front: front === 'true',
        slide: Number.isInteger(n) ? n : 0,
        total: Number(total) || 0,
        end: playing === 'true' && !Number.isInteger(n), // PowerPoint's black "end of slide show" screen
      }
    })
}

// Mac "auto": which app to control, decided per command so you can switch freely.
//   1. the one with a slideshow running (PowerPoint if both)
//   2. else the one with a presentation open (the one in front if both)
//   3. else the one in front, else PowerPoint
function chooseMacApp(apps) {
  if (!apps.length) return null
  const pick = (list) => (list.find((a) => a.front) || list.find((a) => a.app === 'powerpoint') || list[0]).app
  const playing = apps.filter((a) => a.playing)
  if (playing.length) return (playing.find((a) => a.app === 'powerpoint') || playing[0]).app
  const open = apps.filter((a) => a.open)
  if (open.length) return pick(open)
  return pick(apps)
}

// The shape every driver's status() returns, and what the receiver sends to Companion.
const NO_APP = { app: '', open: false, playing: false, slide: 0, total: 0, end: false }
const toStatus = (a) => (a ? { app: a.app, open: a.open, playing: a.playing, slide: a.slide, total: a.total, end: a.end } : NO_APP)

async function macStatus(only) {
  const apps = parseMacState(await osascript(MAC_STATE_SCRIPT))
  const app = only || chooseMacApp(apps)
  return toStatus(apps.find((a) => a.app === app))
}
macPowerPoint.status = () => macStatus('powerpoint')
macKeynote.status = () => macStatus('keynote')

const macAuto = {
  name: 'Auto (Mac: Keynote or PowerPoint)',
  async exec(cmd, args) {
    const app = chooseMacApp(parseMacState(await osascript(MAC_STATE_SCRIPT)))
    if (!app) throw new Error('Neither PowerPoint nor Keynote is open')
    return (app === 'keynote' ? macKeynote : macPowerPoint).exec(cmd, args)
  },
  status: () => macStatus(null),
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

// Prints "<deck open>,<show running>,<slide>,<total>" (slide is empty on the end-of-show screen).
const WIN_STATUS_SCRIPT = `
$ErrorActionPreference = 'Stop'
try { $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { 'none'; exit }
$open = $app.Presentations.Count -gt 0
if ($app.SlideShowWindows.Count -lt 1) { "$open,False,0,0"; exit }
$w = $app.SlideShowWindows.Item(1)
$cur = ''
try { if ($w.View.State -ne 5) { $cur = $w.View.Slide.SlideIndex } } catch {}
"$open,True,$cur,$($w.Presentation.Slides.Count)"
`

function parseWinStatus(text) {
  if (!text || text.trim() === 'none') return NO_APP
  const [open, playing, slide, total] = text.trim().split(',')
  const n = slide === '' ? NaN : Number(slide)
  const isPlaying = playing === 'True'
  return { app: 'powerpoint', open: open === 'True', playing: isPlaying, slide: Number.isInteger(n) ? n : 0, total: Number(total) || 0, end: isPlaying && !Number.isInteger(n) }
}

const winPowerPoint = {
  name: 'PowerPoint (Windows)',
  scripts: winPowerPointScripts,
  statusEveryMs: 2000, // each check starts PowerShell, which is slow on Windows
  async status() {
    return parseWinStatus(await powershell(WIN_STATUS_SCRIPT))
  },
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

module.exports = { createDriver, cleanAppleScriptError, chooseMacApp, parseMacState, parseWinStatus, MAC_STATE_SCRIPT, macPowerPointScripts, macKeynoteScripts, winPowerPointScripts }
