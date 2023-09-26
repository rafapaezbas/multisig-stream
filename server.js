const net = require('net')
const { tcpReceiveStream } = require('./lib/tcp-receive-stream.js')
const { tcpSendStream } = require('./lib/tcp-send-stream.js')
const encodings = require('./lib/encodings')
const c = require('compact-encoding')
const { pipeline } = require('streamx')
const Noise = require('noise-handshake')
const Cipher = require('noise-handshake/cipher')

module.exports = class Server {
  constructor () {
    this.sessions = []
    this.session = []
    this._netServer = net.createServer((socket) => {
      const receiveStream = pipeline(socket, tcpReceiveStream())
      const sendStream = tcpSendStream()
      const session = new AuthenticatedSession(receiveStream, sendStream)
      sendStream.on('data', (data) => {
        socket.write(data)
      })
      this.sessions.push(session)
    })
  }

  listen (port, address = '127.0.0.1') {
    this._netServer.listen(port, address)
  }

  close () {
    this._netServer.close()
  }
}

class AuthenticatedSession {
  constructor (receiveStream, sendStream, opts = {}) {
    this.receiveStream = receiveStream
    this.sendStream = sendStream
    this.receiveStream.on('data', (data) => this._ondata(data))
    this.noiseHandshake = new Noise('XX', false, null)
    this.cipher = null
  }

  write (msg) {
    if (this.encryptionCipher) {
      this.sendStream.write(this.encryptionCipher.encrypt(Buffer.from(msg)))
    } else {
      this.sendStream.write(msg)
    }
  }

  _handshake (data) {
    const { noiseHandshake } = c.decode(encodings.handshake, data)
    if (this.noiseHandshake.key === null) {
      this.noiseHandshake.initialise(Buffer.alloc(0)) // prelude
      this.noiseHandshake.recv(noiseHandshake)
      const reply = c.encode(encodings.handshake, { noiseHandshake: this.noiseHandshake.send() })
      this.write(reply)
    } else {
      this.noiseHandshake.recv(noiseHandshake)
      this.encryptionCipher = new Cipher(this.noiseHandshake.rx)
      this.decryptionCipher = new Cipher(this.noiseHandshake.tx)
    }
  }

  async _ondata (data) {
    if (!this.noiseHandshake.complete) {
      this._handshake(data)
    } else {
      // TODO change with callback
      const decrypted = this.decryptionCipher.decrypt(data)
      console.log('received', decrypted.toString())
    }
  }
}
