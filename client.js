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
    this.sendStream = tcpSendStream()
    this.noiseHandshake = new Noise('XX', true, null)
    this.encryptionCipher = null
    this.handshakeReady = null
  }

  connect (port, address = '127.0.0.1') {
    return new Promise((resolve) => {
      this._netClient.connect(port, address, () => {
        this.sendStream.on('data', (data) => { // pipeline does not work with socket for some reason
          this._netClient.write(data)
        })
        this.receiveStream = pipeline(this._netClient, tcpReceiveStream())
        this.receiveStream.on('data', (data) => this._ondata(data))
        this._handshake()
        this.handshakeReady = resolve
      })
    })
  }

  close () {
    this.sendStream.close()
  }

  write (msg) {
    if (this.encryptionCipher) {
      this.sendStream.write(this.encryptionCipher.encrypt(Buffer.from(msg)))
    } else {
      this.sendStream.write(msg)
    }
  }

  _handshake () {
    this.noiseHandshake.initialise(Buffer.alloc(0)) // prelude
    const noiseHandshake = this.noiseHandshake.send()
    const data = c.encode(encodings.handshake, { noiseHandshake })
    this.write(data)
  }

  _ondata (data) {
    if (!this.noiseHandshake.complete) {
      const { noiseHandshake } = c.decode(encodings.handshake, data)
      this.noiseHandshake.recv(noiseHandshake)
      const initiatorReply = this.noiseHandshake.send()
      this.write(c.encode(encodings.handshake, { noiseHandshake: initiatorReply }))
      this.encryptionCipher = new Cipher(this.noiseHandshake.rx)
      this.decryptionCipher = new Cipher(this.noiseHandshake.tx)
      this.handshakeReady() // resolves connect promise
    }
  }
}
