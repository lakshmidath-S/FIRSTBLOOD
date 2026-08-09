const { getIo } = require("./io");

// Every emit helper is a safe no-op if sockets haven't initialized yet
// (e.g. during a script run) — real-time delivery is a bonus on top of the
// notifications row that's always written to the DB.
function emitToDonor(donorId, event, payload) {
  getIo()?.to(`donor:${donorId}`).emit(event, payload);
}

function emitToHospital(hospitalId, event, payload) {
  getIo()?.to(`hospital:${hospitalId}`).emit(event, payload);
}

function emitToRequestRoom(requestId, event, payload) {
  getIo()?.to(`request:${requestId}`).emit(event, payload);
}

function emitToAdmins(event, payload) {
  getIo()?.to("admins").emit(event, payload);
}

module.exports = { emitToDonor, emitToHospital, emitToRequestRoom, emitToAdmins };
