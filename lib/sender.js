class Sender {
  _format (msg) {
    const buffer = Buffer.from(msg)
    const length = Buffer.alloc(4) // UInt32 bytes
    length.writeUInt32BE(buffer.length)
    return Buffer.concat([length, buffer])
  }
}

module.exports = { Sender }
