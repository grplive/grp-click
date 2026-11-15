'use strict'
// The network side of the receiver: newline-delimited JSON over TCP, one reply line per command.
// Kept apart from receiver.js so the tests can run it with a fake driver.

const net = require('net')

const COMMANDS = new Set(['ping', 'next', 'prev', 'first', 'last', 'start', 'stop', 'goto'])
const MAX_LINE = 4096

function createServer({ driver, version, log = () => {} }) {
  const sockets = new Set()

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

    try {
      await enqueue(() => driver.exec(cmd, { slide }))
      log(`${cmd}${slide ? ` ${slide}` : ''} (from ${socket.remoteAddress})`)
      reply(socket, { ok: true, cmd })
    } catch (err) {
      log(`${cmd}${slide ? ` ${slide}` : ''} failed: ${err.message}`)
      reply(socket, { ok: false, cmd, error: err.message })
    }
  }

  const server = net.createServer((socket) => {
    sockets.add(socket)
    log(`Client connected: ${socket.remoteAddress}`)
    socket.setEncoding('utf8')
    socket.setKeepAlive(true, 10000)
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
    socket.on('close', () => {
      sockets.delete(socket)
      log(`Client disconnected: ${socket.remoteAddress}`)
    })
  })

  // Closes the listener AND every open connection. (server.close() alone waits for Companion's
  // connection to end, which it never does, so the process would hang on quit.)
  server.shutdown = (cb) => {
    server.close(cb)
    for (const s of sockets) s.destroy()
  }

  return server
}

module.exports = { createServer, COMMANDS }
