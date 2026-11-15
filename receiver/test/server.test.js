'use strict'
const test = require('node:test')
const assert = require('node:assert')
const net = require('net')
const { createServer } = require('../server')

// Starts a server with a fake driver on a free port; returns helpers to talk to it.
async function start(exec) {
  const calls = []
  const driver = { name: 'Fake', exec: async (cmd, args) => { calls.push([cmd, args.slide]); if (exec) await exec(cmd, args) } }
  const server = createServer({ driver, version: '9.9.9' })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const client = net.createConnection({ host: '127.0.0.1', port })
  client.setEncoding('utf8')
  await new Promise((r) => client.on('connect', r))
  let buf = ''
  const waiting = []
  client.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) !== -1) { const line = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiting.shift(); if (w) w(JSON.parse(line)) }
  })
  const send = (raw) => new Promise((r) => { waiting.push(r); client.write(raw + '\n') })
  const close = () => new Promise((r) => { client.destroy(); server.shutdown(r) })
  return { server, client, send, close, calls }
}

test('ping reports app and version', async () => {
  const t = await start()
  assert.deepStrictEqual(await t.send('{"cmd":"ping"}'), { ok: true, cmd: 'ping', app: 'Fake', platform: process.platform, version: '9.9.9' })
  await t.close()
})

test('rejects bad input without calling the driver', async () => {
  const t = await start()
  assert.strictEqual((await t.send('not json')).error, 'invalid JSON')
  assert.match((await t.send('{"cmd":"explode"}')).error, /unknown command/)
  assert.match((await t.send('null')).error, /unknown command/)
  for (const slide of [0, -1, 1.5, 'x', 10000]) assert.strictEqual((await t.send(JSON.stringify({ cmd: 'goto', slide }))).ok, false)
  assert.deepStrictEqual(t.calls, [])
  await t.close()
})

test('passes commands and slide numbers to the driver', async () => {
  const t = await start()
  for (const cmd of ['next', 'prev', 'first', 'last', 'start', 'stop']) assert.deepStrictEqual(await t.send(JSON.stringify({ cmd })), { ok: true, cmd })
  assert.deepStrictEqual(await t.send('{"cmd":"goto","slide":"7"}'), { ok: true, cmd: 'goto' })
  assert.deepStrictEqual(t.calls.at(-1), ['goto', 7])
  await t.close()
})

test('driver errors come back as ok:false with the message', async () => {
  const t = await start(async () => { throw new Error("Keynote isn't open") })
  assert.deepStrictEqual(await t.send('{"cmd":"next"}'), { ok: false, cmd: 'next', error: "Keynote isn't open" })
  await t.close()
})

test('commands run one at a time, in order', async () => {
  const order = []
  const t = await start(async (cmd) => { order.push(`${cmd}+`); await new Promise((r) => setTimeout(r, cmd === 'next' ? 40 : 1)); order.push(`${cmd}-`) })
  t.client.write('{"cmd":"next"}\n{"cmd":"prev"}\n')
  await new Promise((r) => setTimeout(r, 120))
  assert.deepStrictEqual(order, ['next+', 'next-', 'prev+', 'prev-'])
  await t.close()
})

test('shutdown closes even while a client is connected', async () => {
  const t = await start()
  const done = await Promise.race([new Promise((r) => t.server.shutdown(() => r(true))), new Promise((r) => setTimeout(() => r(false), 500))])
  assert.strictEqual(done, true)
  t.client.destroy()
})
