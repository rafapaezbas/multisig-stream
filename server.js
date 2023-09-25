const net = require('net')
const { Receiver, Session } = require('./lib/receiver.js')
const encodings = require('./lib/encodings')
const c = require('compact-encoding')

module.exports = class Server {
  constructor () {
    this.sessions = []
    this._netServer = net.createServer((socket) => {
      const session = new AuthenticatedSession(socket, (msg) => console.log('signed:', msg))
      this.sessions.push(session)
    })
  }

  listen (port, address = '127.0.0.1') {
    this._netServer.listen(port, address)
  }
}

class AuthenticatedSession {
  constructor (socket, cb) {
    this.publicKeys = []
    const session = new Session()
    const receiver = new Receiver()
    socket.on('data', (data) => receiver.ondata(data, session))
    receiver.on('message', this._onmessage)
  }

  async _onmessage (msg) {
    if (this.publicKeys.length === 0) {
      this._handshake(msg)
    } else {
      const { payload } = c.decode(encodings.message, msg)
      // check signatures
      await this.cb(payload)
    }
  }

  _handshake (msg) {
    const { publicKeys } = c.decode.encodings(encodings.handshake, msg)
    this.publicKeys = publicKeys
  }
}
