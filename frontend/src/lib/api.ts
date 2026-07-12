import { useAuthStore } from "./auth-store";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5014";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Single-flight guard: many concurrent 401s must trigger only one /refresh call.
let refreshInFlight: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { token?: unknown };
        return typeof data.token === "string" ? data.token : null;
      } catch {
        return null;
      }
    })().finally(() => {
      // Release the guard after the microtask so concurrent callers share this run,
      // but subsequent 401s (e.g. a later expiry) get a fresh /refresh attempt.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return apiFetchImpl<T>(path, init, false);
}

async function apiFetchImpl<T>(
  path: string,
  init: RequestInit,
  isRetry: boolean,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const token = useAuthStore.getState().token;
  const hadToken = !!token;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    // Send the HttpOnly refresh cookie on /api/auth/* and any other same-site request.
    credentials: "include",
  });

  if (response.status === 401 && hadToken && !isRetry && !isAuthPath(path)) {
    const newToken = await attemptRefresh();
    if (newToken) {
      const email = useAuthStore.getState().email ?? "";
      useAuthStore.getState().setAuth(newToken, email);
      return apiFetchImpl<T>(path, init, true);
    }
    // Refresh failed — session is dead. Drop the token so the auth guard redirects to login.
    useAuthStore.getState().clear();
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      // Response body is not JSON; keep the status text.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

// Auth endpoints run without a bearer token, so a 401 from them is a real credential failure —
// don't waste a /refresh call on it and don't loop on /refresh itself.
function isAuthPath(path: string): boolean {
  return (
    path === "/api/auth/login" ||
    path === "/api/auth/register" ||
    path === "/api/auth/google" ||
    path === "/api/auth/refresh" ||
    path === "/api/auth/logout"
  );
}

export const authApi = {
  register: (email: string, password: string) =>
    apiFetch<{ id: string; email: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  google: (idToken: string) =>
    apiFetch<{ token: string }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  logout: () =>
    apiFetch<void>("/api/auth/logout", { method: "POST" }),
};
