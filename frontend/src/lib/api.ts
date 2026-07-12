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

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const token = useAuthStore.getState().token;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (response.status === 401 && token) {
    // Token expired or revoked: drop it so the auth guard redirects to login.
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
};
