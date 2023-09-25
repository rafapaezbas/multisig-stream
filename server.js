const net = require('net')
const { tcpServerStream } = require('./lib/tcp-server-stream.js')
const encodings = require('./lib/encodings')
const c = require('compact-encoding')
const { pipeline } = require('streamx')

module.exports = class Server {
  constructor () {
    this.sessions = []
    this.session = []
    this._netServer = net.createServer((socket) => {
      const stream = pipeline(socket, tcpServerStream())
      const session = new AuthenticatedSession(stream)
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
  constructor (stream) {
    this.publicKeys = []
    stream.on('data', (data) => this._ondata(data))
  }

  async _ondata (data) {
    if (this.publicKeys.length === 0) {
      this._handshake(data)
    } else {
      const { payload } = c.decode(encodings.message, data)
    }
  }

  _handshake (data) {
    const { publicKeys } = c.decode.encodings(encodings.handshake, data)
    this.publicKeys = publicKeys
  }
}
