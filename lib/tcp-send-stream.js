const { Transform } = require('streamx')

const tcpSendStream = () => new Transform({
  transform (data, cb) {
    const buffer = Buffer.from(data)
    const length = Buffer.alloc(4) // UInt32 bytes
    length.writeUInt32BE(buffer.length)
    this.push(Buffer.concat([length, buffer]))
    cb()
  }
})

module.exports = { tcpSendStream }
