import { create } from "zustand";
import { persist } from "zustand/middleware";

// Access-token in localStorage, refresh-token in an HttpOnly cookie (see /api/auth/refresh).
// Persisting the short-lived access token avoids a refresh round-trip on every page reload.
type AuthState = {
  token: string | null;
  email: string | null;
  setAuth: (token: string, email: string) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      setAuth: (token, email) => set({ token, email }),
      clear: () => set({ token: null, email: null }),
    }),
    { name: "askmyarchive-auth" },
  ),
);
