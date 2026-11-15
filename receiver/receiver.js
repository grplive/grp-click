#!/usr/bin/env node
'use strict'
// GRP Click Receiver: listens for newline-delimited JSON commands over TCP
// and drives PowerPoint or Keynote on this machine.
// No token: intended for a private network only.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { createDriver } = require('./drivers')
const { createServer } = require('./server')

const VERSION = require('./package.json').version
const DEFAULTS = { bind: '0.0.0.0', port: 8765, app: 'auto' }
const LOG_MAX = 1024 * 1024

// Per-user location, so the receiver never needs admin rights to write its config.
function dataDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'GRP Click')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'GRP Click')
  return path.join(os.homedir(), '.grp-click')
}

const CONFIG_PATH = process.env.GRP_CLICK_CONFIG || path.join(dataDir(), 'config.json')
const LOG_PATH = path.join(path.dirname(CONFIG_PATH), 'receiver.log')

// Logs go to the console and to receiver.log next to the config (on Windows the receiver runs
// with no window, so the file is the only place to read them). The file rolls over at 1 MB.
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX) fs.renameSync(LOG_PATH, LOG_PATH + '.old')
    fs.appendFileSync(LOG_PATH, line + '\n')
  } catch {
    // logging must never stop the receiver
  }
}

// Creates the config with default settings on first run.
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + '\n')
    log(`Created new config at ${CONFIG_PATH}`)
    return { ...DEFAULTS }
  }
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
  } catch (err) {
    throw new Error(`Could not read ${CONFIG_PATH}: ${err.message}`)
  }
}

if (process.argv.includes('--version')) {
  console.log(VERSION)
  process.exit(0)
}

if (process.argv.includes('--show-config')) {
  const cfg = loadConfig()
  console.log(`GRP Click Receiver ${VERSION}`)
  console.log(`Config: ${CONFIG_PATH}`)
  console.log(`Log:    ${LOG_PATH}`)
  console.log(`Port:   ${cfg.port}`)
  console.log(`App:    ${cfg.app}`)
  process.exit(0)
}

const config = loadConfig()
const driver = createDriver(config.app) // throws now if the app/platform combo is unsupported
const server = createServer({ driver, version: VERSION, log })

server.on('error', (err) => {
  log(`Server error: ${err.message}`)
  process.exit(1)
})

server.listen(config.port, config.bind, () => {
  log(`GRP Click Receiver ${VERSION} ready on ${config.bind}:${config.port} controlling ${driver.name}`)
  log(`Config: ${CONFIG_PATH}`)
})

function quit() {
  log('Shutting down')
  server.shutdown(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGINT', quit)
process.on('SIGTERM', quit)
