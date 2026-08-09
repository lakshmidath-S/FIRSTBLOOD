// Holds the single Socket.io server instance so any module (services,
// cron jobs) can emit without importing sockets/index.js directly and
// risking a circular require with the route modules.
let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function getIo() {
  return ioInstance;
}

module.exports = { setIo, getIo };
