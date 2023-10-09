const net = require('net')
const sodium = require('sodium-universal')
const { tcpReceiveStream } = require('./lib/tcp-receive-stream.js')
const { tcpSendStream } = require('./lib/tcp-send-stream.js')
const encodings = require('./lib/encodings')
const c = require('compact-encoding')
const { pipeline } = require('streamx')
const Noise = require('noise-handshake')
const Cipher = require('noise-handshake/cipher')
const b4a = require('b4a')

module.exports = class Server {
  constructor (onconnection, checkPublicKeys) {
    this._sessions = []
    this._netServer = net.createServer((socket) => {
      const receiveStream = pipeline(socket, tcpReceiveStream())
      const sendStream = tcpSendStream()
      const session = new AuthenticatedSession(receiveStream, sendStream, socket, onconnection, checkPublicKeys)
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
  constructor (receiveStream, sendStream, socket, onconnection, checkPublicKeys, opts = {}) {
    this._receiveStream = receiveStream
    this._sendStream = sendStream
    this._socket = socket
    this._onconnection = onconnection
    this._checkPublicKeys = checkPublicKeys
    this._noiseHandshake = new Noise('XX', false, null)
    this._encryptionCipher = null
    this._decryptionCipher = null
    this._receiveStream.on('data', (data) => this._ondata(data))
    this._sendStream.on('data', (data) => socket.write(data))
  }

  write (msg) {
    if (this._encryptionCipher) {
      this._sendStream.write(this._encryptionCipher.encrypt(b4a.from(msg)))
    } else {
      this._sendStream.write(msg)
    }
  }

  close () {
    this._socket.end()
  }

  _handshake (data) {
    if (this._noiseHandshake.e === null) { // ephemeral key not yet generated
      this._startHandshake(data)
    } else {
      this._endHandshake(data)
    }
  }

  _startHandshake (data) {
    const { noiseHandshake } = c.decode(encodings.handshake, data)
    this._noiseHandshake.initialise(b4a.alloc(0))
    this._noiseHandshake.recv(noiseHandshake)
    this.write(c.encode(encodings.handshake, { noiseHandshake: this._noiseHandshake.send() }))
  }

  _endHandshake (data) {
    const { noiseHandshake, publicKeys } = c.decode(encodings.handshake, data)
    this._noiseHandshake.recv(noiseHandshake)
    this._encryptionCipher = new Cipher(this._noiseHandshake.rx)
    this._decryptionCipher = new Cipher(this._noiseHandshake.tx)
    const remotePublicKeys = publicKeys === null ? null : publicKeys.map(e => this._decryptionCipher.decrypt(e))
    if (this._checkPublicKeys(remotePublicKeys)) {
      const ack = c.encode(encodings.ack, { id: this._publicKeysAckId(), payload: b4a.from('Accepted public keys.') })
      this.write(ack)
      this._remotePublicKeys = remotePublicKeys
    } else {
      const ack = c.encode(encodings.ack, { id: this._publicKeysAckId(), error: 1, payload: b4a.from('Invalid public keys.') })
      this.write(ack)
    }
  }

  async _ondata (data) {
    if (!this._noiseHandshake.complete) {
      this._handshake(data)
    } else {
      const decrypted = this._decryptionCipher.decrypt(data)
      const { id, payload, signatures } = c.decode(encodings.message, decrypted)
      if (this._verifySignatures(signatures, payload)) {
        const reply = (response) => {
          const message = c.encode(encodings.ack, { id, payload: b4a.from(response) })
          this.write(message)
        }
        this._onconnection(payload, reply, this._socket)
      } else {
        // TODO implement failed varification response
      }
    }
  }

  _verifySignatures (signatures, payload) {
    const verifications = signatures.map((e, i) => this._verify(payload, e, this._remotePublicKeys[i]))
    return verifications.length >= this._remotePublicKeys.length && verifications.find(e => !e) === undefined
  }

  _publicKeysAckId () {
    return b4a.alloc(32)
  }

  _verify (message, signature, publicKey) {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey)
  }
}
