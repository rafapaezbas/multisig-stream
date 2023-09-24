const { Receiver, Session } = require('../lib/receiver.js')
const { Sender } = require('../lib/sender.js')
const test = require('brittle')

test('messages format', async (t) => {
  const receiver = new Receiver()
  const sender = new Sender()
  const session = new Session()
  t.plan(3)

  const payload = Buffer.from('hello from receiver')
  receiver.on('message', rcv => {
    t.ok(payload.equals(rcv))
    t.is(session.buffer.length, 0)
    t.is(session.messageLength, null)
  })

  receiver._ondata(sender._format(payload), session)
})

test('splitted message', async (t) => {
  const receiver = new Receiver()
  const sender = new Sender()
  const session = new Session()
  t.plan(3)

  const payload = Buffer.from('hello again from receiver, message splited')
  const msg = sender._format(payload)
  const msgA = msg.slice(0, Math.floor(msg.length / 2))
  const msgB = msg.slice(Math.floor(msg.length / 2), msg.length)

  receiver.on('message', rcv => {
    t.ok(payload.equals(rcv))
    t.is(session.buffer.length, 0)
    t.is(session.messageLength, null)
  })

  receiver._ondata(msgA, session)
  receiver._ondata(msgB, session)
})

test('multi message', async (t) => {
  const receiver = new Receiver()
  const sender = new Sender()
  const session = new Session()
  t.plan(6)

  const payloadA = Buffer.from('this is payloadA')
  const payloadB = Buffer.from('and this is payloadB')
  const msgA = sender._format(payloadA)
  const msgB = sender._format(payloadB)

  let messages = 0

  receiver.on('message', rcv => {
    if (messages === 0) {
      t.ok(rcv.equals(payloadA))
      messages++
    } else if (messages === 1) {
      t.ok(rcv.equals(payloadB))
    }
    t.is(session.buffer.length, 0)
    t.is(session.messageLength, null)
  })

  receiver._ondata(Buffer.concat([msgA, msgB]), session)
})
