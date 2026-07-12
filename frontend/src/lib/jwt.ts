export function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  return !payload || (typeof payload.exp === "number" && payload.exp * 1000 < Date.now());
}

export function readEmailFromJwt(token: string): string | null {
  const payload = decodeJwt(token);
  return payload && typeof payload.email === "string" ? payload.email : null;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}
