import { create } from "zustand";
import { persist } from "zustand/middleware";

// TODO(auth-hardening): move to an HttpOnly refresh-token cookie once the
// backend exposes /api/auth/refresh; localStorage is acceptable for now.
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
