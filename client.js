const net = require('net')
const { tcpClientStream } = require('./lib/tcp-client-stream.js')
const encodings = require('./lib/encodings.js')
const c = require('compact-encoding')

module.exports = class Client {
  constructor (keyPair) {
    this.keyPair = keyPair
    this._netClient = new net.Socket()
    this.stream = tcpClientStream()
  }

  connect (port, address = '127.0.0.1') {
    return new Promise((resolve) => {
      this._netClient.connect(port, address, () => {
        this.stream.on('data', (data) => {
          this._netClient.write(data)
        })
        resolve()
      })
    })
  }

  close () {
    this.stream.close()
  }

  write (msg) {
    this.stream.write(msg)
  }

  _handshake () {
    this.write(c.encode(encodings.handshake, [this.keyPair.publicKey]))
  }
}
