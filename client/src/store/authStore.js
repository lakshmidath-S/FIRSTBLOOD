import { create } from "zustand";

// Minimal in-memory + localStorage-backed auth state. Storing the JWT in
// localStorage keeps this simple for the MVP; the token is short-lived
// (2h access / 30d refresh) per the server config.
const STORAGE_KEY = "firstblood_auth";

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { user: null, accessToken: null };
  } catch {
    return { user: null, accessToken: null };
  }
}

export const useAuthStore = create((set) => ({
  ...loadInitial(),

  setAuth: (user, accessToken) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, accessToken }));
    set({ user, accessToken });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ user: null, accessToken: null });
  },
}));
