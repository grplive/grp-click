#!/usr/bin/env node
'use strict'
// GRP Click Receiver: listens for newline-delimited JSON commands over TCP
// and drives PowerPoint or Keynote on this machine.
// No token: intended for a private network only.

const net = require('net')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createDriver } = require('./drivers')

const VERSION = require('./package.json').version
const DEFAULTS = { bind: '0.0.0.0', port: 8765, app: 'auto' }
const COMMANDS = new Set(['ping', 'next', 'prev', 'first', 'last', 'start', 'stop', 'goto'])
const MAX_LINE = 4096

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`)

// Per-user location, so the receiver never needs admin rights to write its config.
function dataDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'GRP Click')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'GRP Click')
  return path.join(os.homedir(), '.grp-click')
}

const CONFIG_PATH = process.env.GRP_CLICK_CONFIG || path.join(dataDir(), 'config.json')

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

if (process.argv.includes('--show-config')) {
  const cfg = loadConfig()
  console.log(`Config: ${CONFIG_PATH}`)
  console.log(`Port:   ${cfg.port}`)
  process.exit(0)
}

const config = loadConfig()
const driver = createDriver(config.app) // throws now if the app/platform combo is unsupported

// Commands run one at a time, in the order they arrive.
let chain = Promise.resolve()
function enqueue(task) {
  const result = chain.then(task)
  chain = result.catch(() => {})
  return result
}

function reply(socket, obj) {
  if (!socket.destroyed) socket.write(JSON.stringify(obj) + '\n')
}

async function handle(socket, line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return reply(socket, { ok: false, error: 'invalid JSON' })
  }

  const { cmd } = msg
  if (!COMMANDS.has(cmd)) return reply(socket, { ok: false, cmd, error: `unknown command "${cmd}"` })
  if (cmd === 'ping') return reply(socket, { ok: true, cmd, app: driver.name, platform: process.platform, version: VERSION })

  let slide
  if (cmd === 'goto') {
    slide = Number(msg.slide)
    if (!Number.isInteger(slide) || slide < 1) {
      return reply(socket, { ok: false, cmd, error: 'slide must be a positive integer' })
    }
  }

  try {
    await enqueue(() => driver.exec(cmd, { slide }))
    log(`${cmd}${slide ? ` ${slide}` : ''} (from ${socket.remoteAddress})`)
    reply(socket, { ok: true, cmd })
  } catch (err) {
    log(`${cmd} failed: ${err.message}`)
    reply(socket, { ok: false, cmd, error: err.message })
  }
}

const server = net.createServer((socket) => {
  log(`Client connected: ${socket.remoteAddress}`)
  socket.setEncoding('utf8')
  let buffer = ''

  socket.on('data', (chunk) => {
    buffer += chunk
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line) handle(socket, line)
    }
    if (buffer.length > MAX_LINE) socket.destroy() // refuse runaway lines
  })
  socket.on('error', (err) => log(`Socket error: ${err.message}`))
  socket.on('close', () => log(`Client disconnected: ${socket.remoteAddress}`))
})

server.on('error', (err) => {
  log(`Server error: ${err.message}`)
  process.exit(1)
})

server.listen(config.port, config.bind, () => {
  log(`GRP Click Receiver ${VERSION} ready on ${config.bind}:${config.port} controlling ${driver.name}`)
  log(`Config: ${CONFIG_PATH}`)
})

process.on('SIGINT', () => {
  log('Shutting down')
  server.close(() => process.exit(0))
})
process.on('SIGTERM', () => server.close(() => process.exit(0)))
