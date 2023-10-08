const { tcpReceiveStream } = require('../lib/tcp-receive-stream.js')
const { tcpSendStream } = require('../lib/tcp-send-stream.js')
const test = require('brittle')
const b4a = require('b4a')
const sodium = require('sodium-universal')
const { pipeline, Readable } = require('streamx')
const { Client, Server } = require('../index.js')

test('messages format', async (t) => {
  const serverStream = tcpReceiveStream()
  const clientStream = tcpSendStream()
  t.plan(3)

  const payload = b4a.from('hello from receiver')

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

  const payload = b4a.from('hello again from receiver, message splited')
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

  const payloadA = b4a.from('this is payloadA')
  const payloadB = b4a.from('and this is payloadB')
  const msgA = addHeader(payloadA)
  const msgB = addHeader(payloadB)

  let messages = 0

  const stream = pipeline(Readable.from(b4a.concat([msgA, msgB])), serverStream)

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

  const server = new Server((data, reply) => {
    check(data)
  }, noob)
  const client = new Client()

  server.listen(3333)
  await client.connect(3333)

  client.write(payloadA, [])
  client.write(payloadB, [])
  client.write(payloadC, [])

  await new Promise((resolve) => setTimeout(resolve, 500))
  server.close()
  client.close()
})

test('ack', async (t) => {
  t.plan(1)

  const payload = 'hello from client'

  const server = new Server((request, reply, socket) => {
    reply(request) // echo
  }, noob)
  const client = new Client()

  server.listen(3333)
  await client.connect(3333)

  client.write(payload, [], (response) => {
    t.is(response.toString(), payload)
  })

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

  const server = new Server((data) => check(data), noob)
  const clientA = new Client()
  const clientB = new Client()

  server.listen(3333)
  await clientA.connect(3333)
  await clientB.connect(3333)

  clientA.write(payloadA, [])
  clientB.write(payloadB, [])

  await new Promise((resolve) => setTimeout(resolve, 500))
  server.close()
  clientA.close()
  clientB.close()
})

test('signed message', async (t) => {
  t.plan(4)

  const keyPairA = keyPair()
  const keyPairB = keyPair()
  const payload = 'hello from client'

  const checkKeyPairs = (publicKeys) => {
    return publicKeys[0].equals(keyPairA.publicKey) && publicKeys[1].equals(keyPairB.publicKey)
  }

  const echo = (request, reply, socket) => {
    reply(request)
  }

  const server = new Server(echo, checkKeyPairs)
  const client = new Client([keyPairA, keyPairB])

  server.listen(3333)
  await client.connect(3333)

  const signatures = []
  signatures.push(sign(Buffer.from(payload), keyPairA.secretKey))
  signatures.push(sign(Buffer.from(payload), keyPairB.secretKey))

  client.write(payload, signatures, (response) => {
    t.is(response.toString(), payload)
  })

  t.is(server._sessions[0]._remotePublicKeys.length, 2)
  t.ok(keyPairA.publicKey.equals(server._sessions[0]._remotePublicKeys[0]))
  t.ok(keyPairB.publicKey.equals(server._sessions[0]._remotePublicKeys[1]))

  await new Promise((resolve) => setTimeout(resolve, 500))
  server.close()
  client.close()
})

function keyPair (seed) {
  const publicKey = b4a.allocUnsafe(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = b4a.allocUnsafe(sodium.crypto_sign_SECRETKEYBYTES)

  if (seed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
  else sodium.crypto_sign_keypair(publicKey, secretKey)

  return {
    publicKey,
    secretKey
  }
}

// Same as transform of tcp-client-stream

function addHeader (data) {
  const buffer = b4a.from(data)
  const length = b4a.alloc(4) // UInt32 bytes
  length.writeUInt32BE(buffer.length)
  return b4a.concat([length, buffer])
}

function noob (publicKeys) {
  return true
}

function sign (message, secretKey) {
  const signature = b4a.allocUnsafe(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, message, secretKey)
  return signature
}
