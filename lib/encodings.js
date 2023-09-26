const c = require('compact-encoding')
const { compile, array } = require('compact-encoding-struct')

const message = {
  payload: c.buffer,
  signatures: array(c.buffer)
}

const handshake = {
  noiseHandshake: c.buffer
}

module.exports = {
  message: compile(message),
  handshake: compile(handshake)
}
