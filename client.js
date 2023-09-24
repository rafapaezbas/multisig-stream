const net = require('net')

class Client {
  constructor () {
    this._client = new net.Socket()
  }

  async connect (port, address = '127.0.0.1') {
    return new Promise((resolve) => this._client.connect(1337, '127.0.0.1', resolve))
  }

  write (msg) {
    this._client.write(this._format(msg))
  }

  _format (msg) {
    const buffer = Buffer.from(msg)
    const length = Buffer.alloc(4) // UInt32 bytes
    length.writeUInt32BE(buffer.length)
    return Buffer.concat([length, buffer])
  }
}

module.exports = { Client }
