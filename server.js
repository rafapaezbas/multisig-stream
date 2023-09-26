const net = require('net')
const { tcpReceiveStream } = require('./lib/tcp-receive-stream.js')
const { tcpSendStream } = require('./lib/tcp-send-stream.js')
const encodings = require('./lib/encodings')
const c = require('compact-encoding')
const { pipeline } = require('streamx')
const Noise = require('noise-handshake')
const Cipher = require('noise-handshake/cipher')

module.exports = class Server {
  constructor (onconnection) {
    this._sessions = []
    this._netServer = net.createServer((socket) => {
      const receiveStream = pipeline(socket, tcpReceiveStream())
      const sendStream = tcpSendStream()
      const session = new AuthenticatedSession(receiveStream, sendStream, socket, onconnection)
      this._sessions.push(session)
    })
  }

  listen (port, address = '127.0.0.1') {
    this._netServer.listen(port, address)
  }

  close () {
    this._sessions.forEach(e => e.close())
    this._netServer.close()
  }
}

class AuthenticatedSession {
  constructor (receiveStream, sendStream, socket, onconnection, opts = {}) {
    this._receiveStream = receiveStream
    this._sendStream = sendStream
    this._socket = socket
    this._onconnection = onconnection
    this._noiseHandshake = new Noise('XX', false, null)
    this._encryptionCipher = null
    this._decryptionCipher = null
    this._receiveStream.on('data', (data) => this._ondata(data))
    this._sendStream.on('data', (data) => socket.write(data))
  }

  write (msg) {
    if (this._encryptionCipher) {
      this._sendStream.write(this._encryptionCipher.encrypt(Buffer.from(msg)))
    } else {
      this._sendStream.write(msg)
    }
  }

  close () {
    this._socket.end()
  }

  _handshake (data) {
    const { noiseHandshake } = c.decode(encodings.handshake, data)
    if (this._noiseHandshake.e === null) { // ephemeral key not yet generated
      this._noiseHandshake.initialise(Buffer.alloc(0))
      this._noiseHandshake.recv(noiseHandshake)
      this.write(c.encode(encodings.handshake, { noiseHandshake: this._noiseHandshake.send() }))
    } else {
      this._noiseHandshake.recv(noiseHandshake)
      this._encryptionCipher = new Cipher(this._noiseHandshake.rx)
      this._decryptionCipher = new Cipher(this._noiseHandshake.tx)
    }
  }

  async _ondata (data) {
    if (!this._noiseHandshake.complete) {
      this._handshake(data)
    } else {
      const decrypted = this._decryptionCipher.decrypt(data)
      const { id, payload } = c.decode(encodings.message, decrypted)
      const reply = (response) => {
        const message = c.encode(encodings.message, { id, payload: Buffer.from(response) })
        this.write(message)
      }
      this._onconnection(payload, reply)
    }
  }
}
