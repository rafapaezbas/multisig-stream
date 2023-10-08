const net = require('net')
const { tcpSendStream } = require('./lib/tcp-send-stream.js')
const { tcpReceiveStream } = require('./lib/tcp-receive-stream.js')
const encodings = require('./lib/encodings.js')
const c = require('compact-encoding')
const { pipeline } = require('streamx')
const Noise = require('noise-handshake')
const Cipher = require('noise-handshake/cipher')
const { randombytes_buf } = require('sodium-universal')

module.exports = class Client {
  constructor (publicKeys, opts = {}) {
    this._netClient = new net.Socket()
    this._sendStream = tcpSendStream()
    this._noiseHandshake = new Noise('XX', true, null)
    this._encryptionCipher = null
    this._handshakeReady = null
    this._publicKeys = publicKeys || []
    this._acks = new Map()
  }

  connect (port, address = '127.0.0.1') {
    return new Promise((resolve) => {
      this._netClient.connect(port, address, () => {
        this._receiveStream = pipeline(this._netClient, tcpReceiveStream())
        this._sendStream.on('data', (data) => this._netClient.write(data)) // pipeline does not work with socket for some reason
        this._receiveStream.on('data', (data) => this._ondata(data))
        this._netClient.on('end', () => this.close())
        this._handshake()
        this._handshakeReady = resolve
      })
    })
  }

  close () {
    return this._netClient.end()
  }

  write (payload, callback) {
    if (this._encryptionCipher) {
      const id = this._randomId()
      const signatures = [] // TODO add signature
      const message = c.encode(encodings.message, { id, payload: Buffer.from(payload), signatures })
      this._acks.set(id.readUInt32BE(), callback)
      this._sendStream.write(this._encryptionCipher.encrypt(message))
    } else {
      this._sendStream.write(payload)
    }
  }

  _handshake () {
    this._noiseHandshake.initialise(Buffer.alloc(0))
    const noiseHandshake = this._noiseHandshake.send()
    const data = c.encode(encodings.handshake, { noiseHandshake })
    this.write(data)
  }

  async _ondata (data) {
    if (!this._noiseHandshake.complete) {
      const { noiseHandshake } = c.decode(encodings.handshake, data)
      this._noiseHandshake.recv(noiseHandshake)
      this.write(c.encode(encodings.handshake, { noiseHandshake: this._noiseHandshake.send(), publicKeys: this._publicKeys }))
      this._encryptionCipher = new Cipher(this._noiseHandshake.rx)
      this._decryptionCipher = new Cipher(this._noiseHandshake.tx)
      this._handshakeReady() // resolves connect promise
    } else {
      const decryptedData = this._decryptionCipher.decrypt(data)
      const { id, error, payload } = c.decode(encodings.ack, decryptedData)
      if (error) {
        this._handleError(error, id, payload)
      } else {
        const callback = this._acks.get(id.readUInt32BE())
        if (callback) await callback(payload)
      }
    }
  }

  _handleError (error, id, payload) {
    // TODO add hook?
    console.log(`Received error code: ${error}. ${payload}`)
  }

  _randomId () {
    const id = Buffer.allocUnsafe(32)
    randombytes_buf(id)
    return id
  }
}
