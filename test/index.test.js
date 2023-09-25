const { tcpServerStream } = require('../lib/tcp-server-stream.js')
const { tcpClientStream } = require('../lib/tcp-client-stream.js')
const test = require('brittle')
const { pipeline, Readable } = require('streamx')
const Client = require('../client.js')
const Server = require('../server.js')

test('messages format', async (t) => {
  const serverStream = tcpServerStream()
  const clientStream = tcpClientStream()
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
  const serverStream = tcpServerStream()
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
  const serverStream = tcpServerStream()
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

test.skip('client/server', async (t) => {
  const server = new Server()
  const client = new Client()

  server.listen(3333)
  await client.connect(3333)

  client.write('hello world')
})

// Same as transform of tcp-client-stream

function addHeader (data) {
  const buffer = Buffer.from(data)
  const length = Buffer.alloc(4) // UInt32 bytes
  length.writeUInt32BE(buffer.length)
  return Buffer.concat([length, buffer])
}
