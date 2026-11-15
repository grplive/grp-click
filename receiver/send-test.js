#!/usr/bin/env node
'use strict'
// Send one command to a GRP Click Receiver without Companion, for testing.
// Usage: node send-test.js <host> <ping|next|prev|first|last|start|stop|goto> [slide] [--port 8765]

const net = require('net')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : fallback
}
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const [host, cmd, slide] = positional
const port = Number(flag('--port', 8765))

if (!host || !cmd) {
  console.error('Usage: node send-test.js <host> <ping|next|prev|first|last|start|stop|goto> [slide] [--port 8765]')
  process.exit(1)
}

const socket = net.createConnection({ host, port }, () => {
  const msg = { cmd, ...(slide !== undefined && { slide: Number(slide) }) }
  socket.write(JSON.stringify(msg) + '\n')
})

let out = ''
socket.setEncoding('utf8')
// Skips {"event":"status"} lines (slide position updates) and prints the reply to our command.
socket.on('data', (data) => {
  out += data
  let idx
  while ((idx = out.indexOf('\n')) !== -1) {
    const line = out.slice(0, idx)
    out = out.slice(idx + 1)
    if (line.includes('"event"')) continue
    console.log(line)
    socket.end()
  }
})
socket.on('error', (err) => {
  console.error(`Could not reach ${host}:${port}: ${err.message}`)
  process.exit(1)
})
