const { Server, Session } = require('../server.js')
const { Client } = require('../client.js')
const test = require('brittle')

test('messages format', async (t) => {
  const server = new Server()
  const client = new Client()
  const session = new Session()
  t.plan(3)

  const payload = Buffer.from('hello from client')
  server.on('message', rcv => {
    t.ok(payload.equals(rcv))
    t.is(session.buffer.length, 0)
    t.is(session.messageLength, null)
  })

  server._ondata(client._format(payload), session)
})

test('splitted message', async (t) => {
  const server = new Server()
  const client = new Client()
  const session = new Session()
  t.plan(3)

  const payload = Buffer.from('hello again from client, message splited')
  const msg = client._format(payload)
  const msgA = msg.slice(0, Math.floor(msg.length / 2))
  const msgB = msg.slice(Math.floor(msg.length / 2), msg.length)

  server.on('message', rcv => {
    t.ok(payload.equals(rcv))
    t.is(session.buffer.length, 0)
    t.is(session.messageLength, null)
  })

  server._ondata(msgA, session)
  server._ondata(msgB, session)
})

test('multi message', async (t) => {
  const server = new Server()
  const client = new Client()
  const session = new Session()
  t.plan(6)

  const payloadA = Buffer.from('this is payloadA')
  const payloadB = Buffer.from('and this is payloadB')
  const msgA = client._format(payloadA)
  const msgB = client._format(payloadB)

  let messages = 0

  server.on('message', rcv => {
    if (messages === 0) {
      t.ok(rcv.equals(payloadA))
      messages++
    } else if (messages === 1) {
      t.ok(rcv.equals(payloadB))
    }
    t.is(session.buffer.length, 0)
    t.is(session.messageLength, null)
  })

  server._ondata(Buffer.concat([msgA, msgB]), session)
})
