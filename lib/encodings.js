const c = require('compact-encoding')
const { compile, array } = require('compact-encoding-struct')

const message = {
  payload: c.buffer,
  signature: array(c.buffer)
}

const handshake = {
  publicKeys: array(c.buffer)
}

module.exports = {
  message: compile(message),
  handshake
}
