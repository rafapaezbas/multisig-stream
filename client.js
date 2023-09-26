const net = require('net')
const { tcpSendStream } = require('./lib/tcp-send-stream.js')
const { tcpReceiveStream } = require('./lib/tcp-receive-stream.js')
const encodings = require('./lib/encodings.js')
const c = require('compact-encoding')
const { pipeline } = require('streamx')
const Noise = require('noise-handshake')
const Cipher = require('noise-handshake/cipher')

module.exports = class Client {
  constructor (opts = {}) {
    this._netClient = new net.Socket()
    this._sendStream = tcpSendStream()
    this._noiseHandshake = new Noise('XX', true, null)
    this._encryptionCipher = null
    this._handshakeReady = null
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

  write (msg) {
    if (this._encryptionCipher) {
      this._sendStream.write(this._encryptionCipher.encrypt(Buffer.from(msg)))
    } else {
      this._sendStream.write(msg)
    }
  }

  _handshake () {
    this._noiseHandshake.initialise(Buffer.alloc(0))
    const noiseHandshake = this._noiseHandshake.send()
    const data = c.encode(encodings.handshake, { noiseHandshake })
    this.write(data)
  }

  _ondata (data) {
    if (!this._noiseHandshake.complete) {
      const { noiseHandshake } = c.decode(encodings.handshake, data)
      this._noiseHandshake.recv(noiseHandshake)
      const initiatorReply = this._noiseHandshake.send()
      this.write(c.encode(encodings.handshake, { noiseHandshake: initiatorReply }))
      this._encryptionCipher = new Cipher(this._noiseHandshake.rx)
      this._decryptionCipher = new Cipher(this._noiseHandshake.tx)
      this._handshakeReady() // resolves connect promise
    }
  }
}
