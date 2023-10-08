# Multisig-stream

Multisig stream over tcp. Each message is encrypted using [Noise Protocol](http://www.noiseprotocol.org/) and includes signatures by public keys agreed during the handshake.

## Example

``` javascript
const keyPairA = keyPair()
const keyPairB = keyPair()
const payload = 'hello world'

const keyPairsVerification = (publicKeys) => {
  return publicKeys[0].equals(keyPairA.publicKey) && publicKeys[1].equals(keyPairB.publicKey)
}

const echo = (request, reply, socket) => {
  console.log('Client request:', request)
  reply(request)
}

const server = new Server(echo, keyPairsVerification)
const client = new Client([keyPairA, keyPairB])

const port = 33
server.listen(port)
await client.connect(port) // awaits for handshake to be finished

const signatures = []
signatures.push(sign(Buffer.from(payload), keyPairA.secretKey))
signatures.push(sign(Buffer.from(payload), keyPairB.secretKey))

client.write(payload, signatures, (response) => {
  console.log('Server reply:', response)
})

server.close()
client.close()

```

