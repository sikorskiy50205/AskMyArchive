"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./auth-store";
import { isTokenExpired } from "./jwt";

/**
 * Client-side guard for protected pages: waits for the persisted auth store
 * to hydrate, then redirects to /login when there is no valid token.
 * Returns true once the user is verified and the page may render.
 */
export function useAuthGuard(): boolean {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.clear);
  // The store hydrates from localStorage on the client only; gate on mount
  // so the first client render matches server-rendered HTML.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated) return;
    if (token && isTokenExpired(token)) {
      clear(); // re-runs this effect with token === null
      return;
    }
    if (!token) {
      router.replace("/login");
    }
  }, [hydrated, token, clear, router]);

  return hydrated && !!token && !isTokenExpired(token);
}
