const c = require('compact-encoding')
const { compile } = require('compact-encoding-struct')

const message = {
  id: c.buffer,
  payload: c.buffer
}

const handshake = {
  noiseHandshake: c.buffer
}

module.exports = {
  message: compile(message),
  handshake: compile(handshake)
}
