'use strict'
// The network side of GRP Click: newline-delimited JSON over TCP, one reply line per command.
// No Electron in here, so the tests can run it with a fake driver.
//
// While Companion is connected (or the window is open) it also reads where the show is and sends
//   {"event":"status","app":"keynote","open":true,"playing":true,"slide":2,"total":6,"end":false}
// to every connection whenever that changes.

const net = require('net')

const COMMANDS = new Set(['ping', 'next', 'prev', 'first', 'last', 'start', 'stop', 'goto'])
const MAX_LINE = 4096
const STATUS_EVERY_MS = 1000
const RECENT_MAX = 8

// "::ffff:192.168.1.5" -> "192.168.1.5"
const cleanAddress = (a) => String(a || '').replace(/^::ffff:/, '')

function createServer({ driver, version, log = () => {}, onChange = () => {}, statusEveryMs = driver.statusEveryMs || STATUS_EVERY_MS }) {
  const sockets = new Map() // socket -> address
  const recent = [] // newest first: { at, cmd, slide, from, ok, error }
  let status = null // last status, as an object
  let statusText = null // ... and as the JSON line sent to Companion
  let watching = false // the window is open: keep reading even with nobody connected

  // ---- slide position ----
  // Reads don't wait behind commands (they only look), and only one runs at a time.
  let reading = false
  let again = false
  let timer = null
  const wanted = () => !!driver.status && (sockets.size > 0 || watching)

  function sendLine(socket, text) {
    if (!socket.destroyed) socket.write(text + '\n')
  }

  async function readStatus() {
    if (!wanted()) return
    if (reading) {
      again = true // something just changed: read once more after this one
      return
    }
    reading = true
    clearTimeout(timer)
    try {
      const s = await driver.status()
      const text = JSON.stringify({ event: 'status', ...s })
      if (text !== statusText) {
        statusText = text
        status = s
        for (const sock of sockets.keys()) sendLine(sock, text)
        onChange()
      }
    } catch {
      // e.g. the app is busy or permission not given yet: keep the last position
    } finally {
      reading = false
      if (again) {
        again = false
        readStatus()
      } else if (wanted()) {
        timer = setTimeout(readStatus, statusEveryMs)
      }
    }
  }

  // ---- commands ----
  // Commands run one at a time, in the order they arrive.
  let chain = Promise.resolve()
  function enqueue(task) {
    const result = chain.then(task)
    chain = result.catch(() => {})
    return result
  }

  // Runs one command (from Companion or the window's test buttons) and remembers the result.
  async function run(cmd, slide, from) {
    const entry = { at: Date.now(), cmd, slide, from, ok: true, error: '' }
    try {
      await enqueue(() => driver.exec(cmd, { slide }))
      log(`${cmd}${slide ? ` ${slide}` : ''} (from ${from})`)
    } catch (err) {
      entry.ok = false
      entry.permission = err.message.startsWith('NEEDS_PERMISSION: ') // the window shows how to fix it
      entry.error = err.message.replace(/^NEEDS_PERMISSION: /, '')
      log(`${cmd}${slide ? ` ${slide}` : ''} failed: ${err.message}`)
    }
    recent.unshift(entry)
    recent.length = Math.min(recent.length, RECENT_MAX)
    onChange()
    readStatus() // show the new position straight away
    return entry
  }

  function reply(socket, obj) {
    sendLine(socket, JSON.stringify(obj))
  }

  async function handle(socket, line) {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return reply(socket, { ok: false, error: 'invalid JSON' })
    }

    const cmd = msg && msg.cmd
    if (!COMMANDS.has(cmd)) return reply(socket, { ok: false, cmd, error: `unknown command "${cmd}"` })
    if (cmd === 'ping') return reply(socket, { ok: true, cmd, app: driver.name, platform: process.platform, version })

    let slide
    if (cmd === 'goto') {
      slide = Number(msg.slide)
      if (!Number.isInteger(slide) || slide < 1 || slide > 9999) {
        return reply(socket, { ok: false, cmd, error: 'slide must be a whole number from 1 to 9999' })
      }
    }

    const r = await run(cmd, slide, sockets.get(socket) || 'network')
    reply(socket, r.ok ? { ok: true, cmd } : { ok: false, cmd, error: r.error })
  }

  const server = net.createServer((socket) => {
    const address = cleanAddress(socket.remoteAddress)
    sockets.set(socket, address)
    log(`Companion connected: ${address}`)
    socket.setEncoding('utf8')
    socket.setKeepAlive(true, 10000)
    let buffer = ''
    if (statusText) sendLine(socket, statusText)
    onChange()
    readStatus()

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
    socket.on('error', (err) => log(`Connection error (${address}): ${err.message}`))
    socket.on('close', () => {
      sockets.delete(socket)
      log(`Companion disconnected: ${address}`)
      onChange()
    })
  })

  server.runLocal = (cmd, slide) => run(cmd, slide, 'this computer')

  server.setWatching = (on) => {
    watching = !!on
    if (watching) readStatus()
  }

  // What the window shows.
  server.info = () => ({
    clients: [...new Set(sockets.values())],
    status,
    recent: recent.slice(),
  })

  // Closes the listener AND every open connection. (server.close() alone waits for Companion's
  // connection to end, which it never does, so quitting would hang.)
  server.shutdown = (cb) => {
    clearTimeout(timer)
    watching = false
    server.close(cb)
    for (const s of sockets.keys()) s.destroy()
  }

  return server
}

module.exports = { createServer, COMMANDS, cleanAddress }
