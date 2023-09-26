const { Transform } = require('streamx')

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

const tcpReceiveStream = () => new Transform({
  open (cb) {
    this.session = new Session()
    cb()
  },
  transform (data, cb) {
    this.session.readIndex = 0
    while (this.session.readIndex < data.length) {
      let offset = 0
      if (this.session.messageLength === null) {
        this.session.messageLength = data.slice(this.session.readIndex).readUInt32BE() // first two bytes of a message represent message length
        offset = 4 // UInt32BE bytes
      }

      const start = this.session.readIndex + offset
      const end = start + (this.session.messageLength - this.session.buffer.length)
      const chunk = data.slice(start, end)
      this.session.buffer = Buffer.concat([this.session.buffer, chunk])
      this.session.readIndex += chunk.length + offset

      if (this.session.buffer.length === this.session.messageLength) {
        const rcv = Buffer.from(this.session.buffer)
        this.session.reset()
        this.push(rcv)
        cb()
      }
    }
    cb()
  }
})

module.exports = { tcpReceiveStream }
