const { tcpReceiveStream } = require('../lib/tcp-receive-stream.js')
const { tcpSendStream } = require('../lib/tcp-send-stream.js')
const test = require('brittle')
const { pipeline, Readable } = require('streamx')
const Client = require('../client.js')
const Server = require('../server.js')

test('messages format', async (t) => {
  const serverStream = tcpReceiveStream()
  const clientStream = tcpSendStream()
  t.plan(3)

  const payload = Buffer.from('hello from receiver')

  const stream = pipeline(clientStream, serverStream)

  stream.on('data', rcv => {
    t.ok(payload.equals(rcv))
    t.is(serverStream.session.buffer.length, 0)
    t.is(serverStream.session.messageLength, null)
  })

  stream.push(payload)
})

test('splitted message', async (t) => {
  const serverStream = tcpReceiveStream()
  t.plan(3)

  const payload = Buffer.from('hello again from receiver, message splited')
  const msg = addHeader(payload)
  const msgA = msg.slice(0, Math.floor(msg.length / 2))
  const msgB = msg.slice(Math.floor(msg.length / 2), msg.length)

  const stream = pipeline(Readable.from([msgA, msgB]), serverStream)

  stream.on('data', rcv => {
    t.ok(payload.equals(rcv))
    t.is(serverStream.session.buffer.length, 0)
    t.is(serverStream.session.messageLength, null)
  })
})

test('multi message', async (t) => {
  const serverStream = tcpReceiveStream()
  t.plan(6)

  const payloadA = Buffer.from('this is payloadA')
  const payloadB = Buffer.from('and this is payloadB')
  const msgA = addHeader(payloadA)
  const msgB = addHeader(payloadB)

  let messages = 0

  const stream = pipeline(Readable.from(Buffer.concat([msgA, msgB])), serverStream)

  stream.on('data', rcv => {
    if (messages === 0) {
      t.ok(rcv.equals(payloadA))
      messages++
    } else if (messages === 1) {
      t.ok(rcv.equals(payloadB))
    }
    t.is(serverStream.session.buffer.length, 0)
    t.is(serverStream.session.messageLength, null)
  })
})

test('encrypted client/server', async (t) => {
  t.plan(3)

  const payloadA = 'hello world from client'
  const payloadB = 'again'
  const payloadC = 'and again'

  let messages = 0
  const check = (data) => {
    if (messages === 0) t.is(payloadA, data.toString())
    if (messages === 1) t.is(payloadB, data.toString())
    if (messages === 2) t.is(payloadC, data.toString())
    messages++
  }

  const server = new Server((data) => check(data))
  const client = new Client()

  server.listen(3333)
  await client.connect(3333)

  client.write(payloadA)
  client.write(payloadB)
  client.write(payloadC)

  await new Promise((resolve) => setTimeout(resolve, 500))
  server.close()
  client.close()
})

test('multi client', async (t) => {
  t.plan(2)

  const payloadA = 'hello world from client A'
  const payloadB = 'hello world from client B'

  let messages = 0
  const check = (data) => {
    if (messages === 0) t.is(payloadA, data.toString())
    if (messages === 1) t.is(payloadB, data.toString())
    messages++
  }

  const server = new Server((data) => check(data))
  const clientA = new Client()
  const clientB = new Client()

  server.listen(3333)
  await clientA.connect(3333)
  await clientB.connect(3333)

  clientA.write(payloadA)
  clientB.write(payloadB)

  await new Promise((resolve) => setTimeout(resolve, 500))
  server.close()
  clientA.close()
  clientB.close()
})

// Same as transform of tcp-client-stream

function addHeader (data) {
  const buffer = Buffer.from(data)
  const length = Buffer.alloc(4) // UInt32 bytes
  length.writeUInt32BE(buffer.length)
  return Buffer.concat([length, buffer])
}
