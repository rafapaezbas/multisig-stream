const net = require('net')
const { EventEmitter } = require('events')

class Server extends EventEmitter {
  constructor () {
    super()
    this.server = net.createServer((socket) => {
      const session = new Session()
      socket.on('data', (data) => this._ondata(data, session))
    })
  }

  listen (port, address = '127.0.0.1') {
    this.server.listen(port, address)
  }

  _ondata (data, session) {
    session.readIndex = 0
    while (session.readIndex < data.length) {
      let offset = 0
      if (session.messageLength === null) {
        session.messageLength = data.slice(session.readIndex).readUInt32BE() // first two bytes of a message represent message length
        offset = 4 // UInt32BE bytes
      }

      const start = session.readIndex + offset
      const end = start + (session.messageLength - session.buffer.length)
      const chunk = data.slice(start, end)
      session.buffer = Buffer.concat([session.buffer, chunk])
      session.readIndex += chunk.length + offset

      if (session.buffer.length === session.messageLength) {
        const rcv = Buffer.from(session.buffer)
        session.reset()
        this.emit('message', rcv)
      }
    }
  }
}

class Session {
  constructor () {
    this.messageLength = null
    this.buffer = Buffer.alloc(0)
    this.readIndex = 0
  }

  reset () {
    this.messageLength = null
    this.buffer = Buffer.alloc(0)
  }
}

module.exports = { Server, Session }
