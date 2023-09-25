const net = require('net')
const { Sender } = require('./lib/sender.js')
const encodings = require('./lib/encodings.js')
const c = require('compact-encoding')

module.exports = class Client {
  constructor (keyPair) {
    this.keyPair = keyPair
    this._netClient = new net.Socket()
    this._sender = new Sender()
  }

  connect (port, address = '127.0.0.1') {
    return new Promise((resolve) => this._netClient.connect(port, address, () => {
      this._handshake()
    }))
  }

  write (msg) {
    this._netClient.write(this.sender._format(msg))
  }

  _handshake () {
    this.write(c.encode(encodings.handshake, [this.keyPair.publicKey]))
  }
}
