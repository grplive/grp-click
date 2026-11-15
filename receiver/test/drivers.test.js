'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { cleanAppleScriptError, macPowerPointScripts, macKeynoteScripts, winPowerPointScripts } = require('../drivers')
const { COMMANDS } = require('../server')

const ACTIONS = [...COMMANDS].filter((c) => c !== 'ping')

test('every app has a script for every command', () => {
  for (const scripts of [macPowerPointScripts, macKeynoteScripts, winPowerPointScripts]) {
    assert.deepStrictEqual(Object.keys(scripts).sort(), [...ACTIONS].sort())
  }
})

test('no script can start an app or press keys', () => {
  for (const scripts of [macPowerPointScripts, macKeynoteScripts]) {
    for (const cmd of ACTIONS) {
      const lines = scripts[cmd](3)
      assert.match(lines[0], /is not running then error/, `${cmd} must check the app is open first`)
      assert.doesNotMatch(lines.join('\n'), /System Events|key code|keystroke/)
    }
  }
})

// Compiling needs the apps' dictionaries, so this only runs on a Mac with both installed.
const haveApps = process.platform === 'darwin' && fs.existsSync('/Applications/Keynote.app') && fs.existsSync('/Applications/Microsoft PowerPoint.app')
test('every Mac AppleScript compiles', { skip: !haveApps && 'needs a Mac with PowerPoint and Keynote' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grp-click-'))
  for (const [app, scripts] of [['PowerPoint', macPowerPointScripts], ['Keynote', macKeynoteScripts]]) {
    for (const cmd of ACTIONS) {
      const file = path.join(dir, `${app}-${cmd}.applescript`)
      fs.writeFileSync(file, scripts[cmd](3).join('\n'))
      try {
        execFileSync('osacompile', ['-o', path.join(dir, 'out.scpt'), file], { stdio: 'pipe' })
      } catch (err) {
        assert.fail(`${app} ${cmd} does not compile: ${err.stderr}`)
      }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true })
})

test('AppleScript errors are made readable', () => {
  assert.strictEqual(cleanAppleScriptError("0:85: execution error: Keynote isn't open (9001)"), "Keynote isn't open")
  assert.strictEqual(cleanAppleScriptError('10:20: execution error: Keynote got an error: There is no slide 9 (9003)'), 'There is no slide 9')
  assert.match(cleanAppleScriptError('execution error: Not authorised to send Apple events to Keynote. (-1743)'), /Privacy & Security > Automation/)
})

test('Mac auto picks the right app', () => {
  const { chooseMacApp, parseMacState } = require('../drivers')
  const st = (s) => chooseMacApp(parseMacState(s))
  assert.strictEqual(st(''), null)
  // The 2026-11-15 case: PowerPoint running with nothing open, Keynote in front with a deck.
  assert.strictEqual(st('powerpoint,false,false,false;keynote,false,true,true;'), 'keynote')
  assert.strictEqual(st('powerpoint,false,true,false;keynote,true,true,false;'), 'keynote') // Keynote playing
  assert.strictEqual(st('powerpoint,true,true,false;keynote,true,true,true;'), 'powerpoint') // both playing
  assert.strictEqual(st('powerpoint,false,true,true;keynote,false,true,false;'), 'powerpoint') // both open: front one
  assert.strictEqual(st('powerpoint,false,true,false;keynote,false,true,true;'), 'keynote')
  assert.strictEqual(st('powerpoint,false,false,false;keynote,false,false,false;'), 'powerpoint')
  assert.strictEqual(st('keynote,false,false,false;'), 'keynote')
})

test('Mac app-choice script compiles', { skip: !haveApps && 'needs a Mac with PowerPoint and Keynote' }, () => {
  const { MAC_STATE_SCRIPT } = require('../drivers')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grp-click-'))
  fs.writeFileSync(path.join(dir, 's.applescript'), MAC_STATE_SCRIPT.join('\n'))
  execFileSync('osacompile', ['-o', path.join(dir, 'out.scpt'), path.join(dir, 's.applescript')], { stdio: 'pipe' })
  fs.rmSync(dir, { recursive: true, force: true })
})
