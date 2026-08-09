import axios from "axios";
import { useAuthStore } from "../store/authStore";

// Must include the /api suffix — routes are mounted under /api/* on the
// server, while Socket.IO (see socket.js) attaches to the bare origin.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(err.response?.data?.error ? new Error(err.response.data.error) : err);
  }
);
