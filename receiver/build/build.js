#!/usr/bin/env node
'use strict'
// Builds the installers for GRP Click Receiver.
//   Windows: dist/GRP-Click-Receiver-Windows.zip   (any OS can build this)
//   Mac:     dist/GRP-Click-Receiver-Mac-AppleSilicon.pkg and -Mac-Intel.pkg (macOS only: uses pkgbuild)

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

function buildWindows() {
  const dir = path.join(WORK, 'win')
  fs.mkdirSync(dir, { recursive: true })
  run(PKG_BIN, ['receiver.js', '--targets', `${NODE_TARGET}-win-x64`, '--output', path.join(dir, 'grp-click-receiver.exe')])

  const winSrc = path.join(__dirname, 'win')
  for (const file of ['install.bat', 'uninstall.bat']) {
    fs.writeFileSync(path.join(dir, file), toCrlf(fs.readFileSync(path.join(winSrc, file), 'utf8')))
  }
  for (const file of ['install.ps1', 'uninstall.ps1']) {
    fs.copyFileSync(path.join(winSrc, file), path.join(dir, file))
  }
  fs.writeFileSync(path.join(dir, 'README.txt'), toCrlf(
    `GRP Click Receiver ${VERSION}\r\n\r\n` +
    '1. Double-click install.bat and approve the administrator prompt.\r\n' +
    '2. At the end it prints this computer IP address. Enter it in the GRP Click module in Companion.\r\n' +
    '3. To remove it, double-click uninstall.bat.\r\n\r\n' +
    'Windows will say "unknown publisher" because this build is not code-signed. Click More info, then Run anyway.\r\n'
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
    { arch: 'arm64', pkgTarget: 'macos-arm64', label: 'AppleSilicon' },
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
    run('codesign', ['--sign', '-', '--force', binary])

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
