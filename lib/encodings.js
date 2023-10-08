const c = require('compact-encoding')
const { compile, array, opt } = require('compact-encoding-struct')

const message = {
  id: c.buffer,
  error: opt(c.uint),
  payload: c.buffer,
  signatures: array(c.buffer)
}

const ack = {
  id: c.buffer,
  error: opt(c.uint),
  payload: c.buffer
}

const handshake = {
  noiseHandshake: c.buffer,
  publicKeys: opt(array(c.buffer))
}

module.exports = {
  message: compile(message),
  handshake: compile(handshake),
  ack: compile(ack)
}
