#!/usr/bin/env node
'use strict'
// Builds the installers for GRP Click Receiver.
//   Windows: dist/GRP-Click-Receiver-Windows.zip   (any OS can build this)
//   Mac:     dist/GRP-Click-Receiver-Mac-Apple-Silicon.pkg and -Mac-Intel.pkg (macOS only: uses pkgbuild)

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const WORK = path.join(DIST, 'work')
const VERSION = require('../package.json').version
const PKG_BIN = path.join(ROOT, 'node_modules', '.bin', 'pkg')
const NODE_TARGET = 'node22'

const run = (file, args) => {
  console.log(`> ${file} ${args.join(' ')}`)
  execFileSync(file, args, { cwd: ROOT, stdio: 'inherit' })
}

// Converts LF to CRLF so the .bat files run cleanly on Windows.
const toCrlf = (text) => text.replace(/\r?\n/g, '\r\n')

// Marks a Windows .exe as a windowed (GUI) program instead of a console one, so it runs with no
// black command window. Same idea as the create-nodew-exe package. Node still works normally;
// the receiver writes its log to %APPDATA%\GRP Click\receiver.log.
function makeWindowless(exe) {
  const buf = fs.readFileSync(exe)
  const pe = buf.readUInt32LE(0x3c)
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error(`${exe} is not a PE file`)
  const subsystem = pe + 24 + 68 // optional header + Subsystem (same offset for PE32 and PE32+)
  if (buf.readUInt16LE(subsystem) !== 3) throw new Error(`${exe}: expected a console subsystem`)
  buf.writeUInt16LE(2, subsystem) // 2 = Windows GUI
  fs.writeFileSync(exe, buf)
}

function buildWindows() {
  const dir = path.join(WORK, 'win')
  fs.mkdirSync(dir, { recursive: true })
  run(PKG_BIN, ['receiver.js', '--targets', `${NODE_TARGET}-win-x64`, '--output', path.join(dir, 'grp-click-receiver.exe')])
  makeWindowless(path.join(dir, 'grp-click-receiver.exe'))

  const winSrc = path.join(__dirname, 'win')
  for (const file of ['install.bat', 'uninstall.bat']) {
    fs.writeFileSync(path.join(dir, file), toCrlf(fs.readFileSync(path.join(winSrc, file), 'utf8')))
  }
  for (const file of ['install.ps1', 'uninstall.ps1']) {
    fs.copyFileSync(path.join(winSrc, file), path.join(dir, file))
  }
  fs.writeFileSync(path.join(dir, 'README.txt'), toCrlf(
    `GRP Click Receiver ${VERSION}\r\n\r\n` +
    '1. Unzip this folder first (right-click > Extract All). Do not run it from inside the zip.\r\n' +
    '2. Double-click install.bat and approve the administrator prompt.\r\n' +
    '   If Windows says "unknown publisher" or "Windows protected your PC": More info > Run anyway.\r\n' +
    '3. At the end it shows this computer\'s IP address. Enter it in the GRP Click connection in Companion.\r\n' +
    '4. It starts by itself when you log in. It has no window.\r\n\r\n' +
    'Log: %APPDATA%\\GRP Click\\receiver.log\r\n' +
    'To remove it, double-click uninstall.bat.\r\n'
  ))

  const zip = path.join(DIST, 'GRP-Click-Receiver-Windows.zip')
  fs.rmSync(zip, { force: true })
  execFileSync('zip', ['-j', zip, ...fs.readdirSync(dir).map((f) => path.join(dir, f))], { stdio: 'inherit' })
  console.log(`Built ${zip}`)
}

function buildMac() {
  if (process.platform !== 'darwin') {
    console.log('Skipping Mac installers: they must be built on a Mac (pkgbuild is macOS only).')
    return
  }
  const arches = [
    { arch: 'arm64', pkgTarget: 'macos-arm64', label: 'Apple-Silicon' },
    { arch: 'x64', pkgTarget: 'macos-x64', label: 'Intel' },
  ]

  for (const { arch, pkgTarget, label } of arches) {
    const root = path.join(WORK, `mac-${arch}`, 'root')
    const binDir = path.join(root, 'usr', 'local', 'grp-click')
    const agentDir = path.join(root, 'Library', 'LaunchAgents')
    fs.mkdirSync(binDir, { recursive: true })
    fs.mkdirSync(agentDir, { recursive: true })

    const binary = path.join(binDir, 'grp-click-receiver')
    run(PKG_BIN, ['receiver.js', '--targets', `${NODE_TARGET}-${pkgTarget}`, '--output', binary])
    // Ad-hoc signature so the binary can run on Apple Silicon. This is not a Developer ID signature.
    run('codesign', ['--sign', '-', '--force', '--identifier', 'com.grp.click.receiver', binary])

    fs.copyFileSync(path.join(__dirname, 'mac', 'com.grp.click.receiver.plist'), path.join(agentDir, 'com.grp.click.receiver.plist'))

    const out = path.join(DIST, `GRP-Click-Receiver-Mac-${label}.pkg`)
    run('pkgbuild', [
      '--root', path.join(WORK, `mac-${arch}`, 'root'),
      '--scripts', path.join(__dirname, 'mac', 'scripts'),
      '--identifier', 'com.grp.click.receiver',
      '--version', VERSION,
      '--install-location', '/',
      '--ownership', 'recommended',
      out,
    ])
    console.log(`Built ${out}`)
  }
}

fs.rmSync(DIST, { recursive: true, force: true })
fs.mkdirSync(DIST, { recursive: true })
buildWindows()
buildMac()
