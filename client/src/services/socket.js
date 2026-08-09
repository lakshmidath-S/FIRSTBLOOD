import { io } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

let socket = null;

// Lazily create (or reuse) a single authenticated socket connection for the
// currently logged-in user. Call this after login/OTP-verify.
export function getSocket() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;

  if (!socket) {
    socket = io(SOCKET_URL, { auth: { token }, autoConnect: true });
  } else if (socket.auth?.token !== token) {
    socket.auth = { token };
    socket.disconnect().connect();
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
