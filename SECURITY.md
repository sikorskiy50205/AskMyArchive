# Security Rules

Mandatory checklist read at the start of any task that touches user input, DB access,
auth, uploads, an LLM call, or an external HTTP request. Not just when explicitly asked
to "do a security review."

For what is enforced today vs. consciously deferred in the demo, see README.md
§ "Границы демо-версии".

---

## Priority

**Critical** — get these right or don't ship: authentication, ownership/isolation, uploads,
LLM-facing surfaces (prompt injection, cost blast radius).

**High**: API endpoints, input validation, error output, rate limiting.

**Medium**: UI rendering (React auto-escapes — the risk is `dangerouslySetInnerHTML`),
logs, response caching.

If unsure which bucket a change falls into, treat it as the higher one.

---

## Before finishing any task — verify

```
✓ authentication      — is the endpoint under RequireAuthorization when it should be?
✓ authorization       — resource filtered by userId from JWT, not by user_id from body/query?
✓ input validation    — length caps on strings, types checked after JSON decode?
✓ error output        — ex.Message never returned to client; log server-side, generic to user
✓ rate limiting       — RequireRateLimiting("policy") on new sensitive endpoint?
✓ secrets             — nothing hardcoded in appsettings.json, nothing in logs, nothing echoed?
✓ SQL                 — EF Core LINQ or parameterized SqlQuery interpolation only; no string concat
✓ output escaping     — no dangerouslySetInnerHTML on any new render path
✓ LLM prompts         — untrusted text (documents, filenames) never controls prompt structure
✓ CORS/CSRF           — new endpoint's method + auth scheme still consistent with SameSite=Lax
```

---

## Authorization ≠ Authentication

Being logged in only proves *who* the user is, not *what* they may touch.

Every operation that loads or modifies a resource must filter by
`principal.GetUserId()` (helper in `ClaimsPrincipalExtensions`). Never accept a
resource id and skip the ownership check because "the endpoint requires auth" —
that is IDOR, and it is the single most common mistake when adding a new endpoint.

Pattern in this project:
```csharp
var userId = principal.GetUserId();
var doc = await db.Documents.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);
if (doc is null) return Results.NotFound();
```

Never `FirstOrDefaultAsync(d => d.Id == id)` and then check ownership separately —
one branch will eventually forget.

---

## Never

- Never disable a filter, rate limit, or ownership check "to make it work" — fix the actual blocker.
- Never accept `userId` / `ownerId` from the request body or query; resolve from `ClaimsPrincipal`.
- Never return `ex.Message` to the client; log the exception, return generic text.
- Never store production secrets in `appsettings.json`; use environment variables, user-secrets, or Docker secrets.
- Never enable CORS with `AllowAnyOrigin()` while `AllowCredentials()` — combination is a browser-side session steal.
- Never call `.DisableAntiforgery()` on a new endpoint without documenting why. JWT-authed endpoints are safe; anything that reads a cookie-only session is not.
- Never fetch a user-supplied URL server-side without scheme + private-IP validation, a timeout, and a max response size (SSRF).
- Never let user-supplied text (uploaded document body, filename, message content) control an LLM system prompt structure — sanitize whitespace / delimiters and cap length before inclusion.
- Never cache authenticated responses in a shared cache.
- Never log JWT tokens, refresh tokens, API keys, or password hashes — not in exceptions, not in Serilog contexts, not in telemetry.
- Never trust client-side validation as the only validation.
- Never trust a webhook payload without signature verification (n/a today — flag if we add inbound webhooks).

---

## Stack-specific notes

**SPA + JWT + refresh cookie.** Access token lives in the `Authorization` header, so
POST/PUT/DELETE endpoints are CSRF-safe by default. Refresh cookie is HttpOnly +
`SameSite=Lax` + POST-only on `/api/auth/refresh` and `/api/auth/logout` — the
`SameSite=Lax`+POST combination is what makes those two safe. Do not add new
cookie-authed mutating endpoints without an explicit anti-forgery check.

**Rate-limit policies** live in `Program.cs → AddRateLimiter`:
- `auth` — 5/min per IP, for credential endpoints (`/login`, `/register`, `/forgot-password`, `/reset-password`).
- `ask` — 30/min per authenticated user, for LLM-consuming `/api/ask`.

Any new sensitive endpoint gets one of these applied via `.RequireRateLimiting(...)`,
or a new policy in `AddRateLimiter` if the shape differs.

**Behind a reverse proxy**, populate `ForwardedHeaders:KnownProxies` in appsettings so
`RemoteIpAddress` reflects the real client. Without it, per-IP partitioning collapses
to a single bucket for the whole world and the "auth" policy stops working.

**Ownership on raw SQL.** `PgVectorChunkSearcher` uses `SqlQuery` interpolation —
that is parameterized (safe from SQLi), but the `WHERE d."UserId" = {userId}` clause
is the isolation guarantee, and there is an integration test that asserts a stranger's
chunk is invisible. Any change to that query must preserve the `UserId` filter and
keep the test green.

**File storage.** `LocalFileStorage.GetFullPath` composes the on-disk path from a
`{userId}/{documentId}` GUID pair set at upload time — never from user-controlled
input. Any code path that reads a file by a name derived from the request must add
a `Path.GetFullPath(...).StartsWith(root)` check.

---

## If you're not sure

- Ask instead of guessing.
- Implement the safer option by default.
- Never silently weaken an existing protection to unblock yourself — if a security
  mechanism is in your way, that is a signal to ask, not to remove it.
