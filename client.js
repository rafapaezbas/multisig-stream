const net = require('net')
const { tcpSendStream } = require('./lib/tcp-send-stream.js')
const { tcpReceiveStream } = require('./lib/tcp-receive-stream.js')
const encodings = require('./lib/encodings.js')
const c = require('compact-encoding')
const { pipeline } = require('streamx')
const Noise = require('noise-handshake')
const Cipher = require('noise-handshake/cipher')
const sodium = require('sodium-universal')
const b4a = require('b4a')

module.exports = class Client {
  constructor (publicKeys, opts = {}) {
    this._netClient = new net.Socket()
    this._sendStream = tcpSendStream()
    this._noiseHandshake = new Noise('XX', true, null)
    this._encryptionCipher = null
    this._handshakeFinished = false // needs this flag for encryption only after handshake (except publicKeys in handshake)
    this._handshakeReady = null // this is the resolve callback
    this._publicKeys = publicKeys || []
    this._acks = new Map()
  }

  connect (port, address = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      this._netClient.connect(port, address, () => {
        this._receiveStream = pipeline(this._netClient, tcpReceiveStream())
        this._sendStream.on('data', (data) => this._netClient.write(data)) // pipeline does not work with socket for some reason
        this._receiveStream.on('data', (data) => this._ondata(data))
        this._netClient.on('end', () => this.close())
        this._startHandshake()
        this._handshakeReady = resolve
        this._handshakeFailed = reject
      })
    })
  }

  close () {
    return this._netClient.end()
  }

  write (payload, signatures, callback) {
    if (this._encryptionCipher && this._handshakeFinished) {
      const id = this._randomId()
      const message = c.encode(encodings.message, { id, payload: b4a.from(payload), signatures })
      this._acks.set(id.readUInt32BE(), callback)
      this._sendStream.write(this._encryptionCipher.encrypt(message))
    } else {
      this._sendStream.write(payload)
      if (callback) this._acks.set(0, callback) // 0 is the id for handshake messages
    }
  }

  _startHandshake () {
    this._noiseHandshake.initialise(b4a.alloc(0))
    const noiseHandshake = this._noiseHandshake.send()
    const data = c.encode(encodings.handshake, { noiseHandshake })
    this.write(data)
  }

  /*
    This receives noiseHandshake reply, initialises encrypt/decrypt ciphers,
    sends initiator reply (see https://github.com/holepunchto/noise-handshake/blob/main/test/handshake.js#L46-L49)
    and sends encrypted public keys request
  */

  _endHandshake (data) {
    const { noiseHandshake } = c.decode(encodings.handshake, data)
    this._noiseHandshake.recv(noiseHandshake)
    const noiseHandshakeSend = this._noiseHandshake.send()
    this._encryptionCipher = new Cipher(this._noiseHandshake.rx)
    this._decryptionCipher = new Cipher(this._noiseHandshake.tx)
    const handshake = { noiseHandshake: noiseHandshakeSend, publicKeys: this._encryptedPublicKeys() }
    this.write(c.encode(encodings.handshake, handshake), null, this._handlePublicKeysResponse.bind(this))
  }

  async _ondata (data) {
    if (!this._noiseHandshake.complete) {
      this._endHandshake(data)
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

  _handlePublicKeysResponse (response) {
    this._handshakeFinished = true
    this._handshakeReady()
  }

  _handleError (error, id, payload) {
    if (id.equals(b4a.alloc(32))) {
      this._handshakeFailed(new Error('Invalid public keys.'))
    }
    // TODO add hook?
  }

  _randomId () {
    const id = b4a.allocUnsafe(32)
    sodium.randombytes_buf(id)
    return id
  }

  _encryptedPublicKeys () {
    return this._publicKeys.map(e => this._encryptionCipher.encrypt(e.publicKey))
  }
}
