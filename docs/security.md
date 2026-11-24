# Security model

Security was the top priority for this project. This document lists the threats considered and where each
mitigation lives in the code, so reviewers can verify it.

## Authentication & sessions

| Concern                           | Mitigation                                                                                                                                                                                    | Code                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Password storage                  | argon2id (m=19 MiB, t=2, p=1 — OWASP); min 12 chars for provisioned admins; well-known weak values rejected                                                                                   | `api/src/modules/auth/password.ts`, `api/src/bootstrap/seed.ts` |
| User enumeration                  | Identical error for unknown email / wrong password; dummy argon2 verification equalises timing                                                                                                | `auth.service.ts`                                               |
| Brute force                       | Per-IP limit (20 / 15 min) **and** per-account failed-attempt limit (5 / 15 min)                                                                                                              | `middleware/rate-limit.ts`                                      |
| Token theft from DB               | Opaque 256-bit tokens; only SHA-256 stored                                                                                                                                                    | `session-token.ts`                                              |
| Token theft via XSS               | Token only in an `httpOnly` cookie on the web origin; nonce-based CSP                                                                                                                         | `web/src/lib/auth/session-cookie.ts`, `web/src/proxy.ts`        |
| Session lifetime                  | Idle timeout (30 min) + absolute (12 h); server-side revocation on logout; "sign out everywhere"                                                                                              | `session.service.ts`                                            |
| Cookie injection / scope          | `__Host-` prefix (Secure, Path=/, no Domain), `SameSite=Lax`. With `COOKIE_SECURE=false` (plain-HTTP hosts only) the cookie is `cl_session` without `Secure`                                  | `session-cookie.ts`                                             |
| Expired session UX vs logout CSRF | `GET /logout` clears the cookie **only** if the session is already invalid                                                                                                                    | `web/src/app/logout/route.ts`                                   |
| Open redirect after login         | `next` must be a same-site path: control characters, spaces and backslashes are rejected, then it is parsed and re-serialised against a fixed origin (blocks `/%09/evil.test`-style bypasses) | `web/src/lib/auth/constants.ts` (unit-tested)                   |
| Account provisioning              | No sign-up endpoint; admins are created by the seed job from environment variables                                                                                                            | `api/src/bootstrap/seed.ts`                                     |

Why sessions and not JWTs: [ADR 0002](decisions/0002-sessions-over-jwt.md).

## Authorization

- Default-deny: every API route requires a valid session unless explicitly declared `auth: false`.
  `test/auth.int.test.ts` reads the OpenAPI document, calls **every** protected operation without a token, expects
  401 from each, and asserts that the only public operations are login and health.
- The web `proxy.ts` gate is only an optimisation. The API validates the token on every call.
- Nested resources are scoped: a movement is only found through its own client (`/clients/:clientId/movements/:id`).
  Cross-client access returns 404 (tested).

## Input handling

- Zod validation of params, query and body on every route; `strictObject` bodies reject unknown keys (mass assignment).
- Money accepted only as decimal strings (JSON numbers rejected), dates as strict calendar dates; DB `CHECK`
  constraints back up the critical invariants (`amount > 0`, lowercase emails, non-blank names).
- Body size limits: 16 kB (API JSON), 64 kB (Server Actions). Query parser set to `simple` (no nested objects).
- SQL: Prisma or parameterised `$queryRaw` templates only; LIKE wildcards escaped; `ORDER BY` from a whitelist.
- CSV export: RFC 4180 quoting plus formula-injection neutralisation (`=`, `+`, `-`, `@`, tab, CR); safe
  `Content-Disposition` filenames.

## Transport & browser hardening

- Web: per-request nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`,
  `form-action 'self'`), HSTS (prod), `X-Frame-Options: DENY`, `nosniff`, strict `Referrer-Policy`,
  `Permissions-Policy`, COOP/CORP, `X-Robots-Tag: noindex`.
- API: helmet with `default-src 'none'`; CORS disabled by default; `Cache-Control: no-store` on all API responses;
  `x-powered-by` off. Exception: when `SWAGGER_ENABLED=true`, `/docs` gets a relaxed CSP because Swagger UI needs
  inline scripts and styles. Disable Swagger in production.
- Server timeouts against slow-loris (`headersTimeout`, `requestTimeout`).

## Data protection & auditability

- Soft deletes for movements and archiving for clients: history is never destroyed through the UI or API.
- Append-only audit log of logins (success and failure), logouts and every mutation, with actor, IP and request ID,
  written in the same DB transaction as the change (including session creation and revocation).
- Ledger changes lock the client row first, so a movement can never be added, edited or deleted after its client was
  archived, and concurrent deletes of one movement are audited once (`test/concurrency.int.test.ts`).
- Logs are structured JSON with redaction of auth headers, cookies, passwords and tokens. Request and response bodies
  are never logged, and neither are query strings (they carry search terms such as client names and emails).
- Exports read from one `REPEATABLE READ` snapshot, so a CSV always matches the ledger at a single instant.

## Infrastructure

- `api`, `web` and the one-shot `migrate` job run as non-root with a read-only root filesystem, `cap_drop: [ALL]` and
  `no-new-privileges`. App files are root-owned, so the process can't modify its own code. Postgres also drops every
  capability except the five its entrypoint needs to set up the data directory (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`,
  `SETGID`, `SETUID`).
- Network segmentation: the web container cannot reach the database. API and DB ports are bound to `127.0.0.1` only.
- Runtime images contain production dependencies only (no compiler, no Prisma CLI); migrations run in a separate
  one-shot job.
- Required secrets have no defaults. Compose refuses to start without them, and the API refuses to boot with invalid
  configuration.
- `npm audit` runs in CI; a vulnerable transitive dev dependency (`effect`, via Prisma CLI) is pinned to a patched
  version through `overrides`.

## Known limitations / next steps

- Rate limiting is keyed so that one client can't lock out others ([ADR 0005](decisions/0005-rate-limit-keys.md)):
  signed-in requests are limited **per session** (after the API validated it), and the per-IP limit only counts
  requests **without** a well-formed session token. Failed token checks are counted per IP inside `authenticate`;
  over budget, unknown tokens are refused before the database lookup, while recently valid sessions keep working.
  The web app treats a malformed session cookie as no session at all (redirect to login, no API call). Raw request
  floods belong to a reverse proxy or WAF in front of the app.
- Rate-limit counters are in memory. For several API replicas, use a shared store (e.g. `rate-limit-redis`).
- Client IPs: the BFF forwards an end-user IP to the API only from proxies it trusts (`TRUSTED_PROXY_HOPS`, default
  `0`). A client-sent `X-Forwarded-For` is ignored, because Next.js keeps it rather than overwriting it, so it can't be
  used to dodge the per-IP login limit or forge audit IPs (`web/src/lib/api/forwarded.ts`, unit-tested). With `0`, all
  logins share the web container's IP for the per-IP limit. Behind a reverse proxy that appends to
  `X-Forwarded-For`, set `TRUSTED_PROXY_HOPS=1` for per-user limits and audit IPs.
- Availability: the per-account limiter (5 failures per 15 min) lets anyone who knows an admin's email lock that
  account for a while. This is the usual brute-force trade-off; MFA would allow a softer limit.
- No MFA or password reset flow. TOTP-based MFA would be the next hardening step for admin accounts.
- All admins have equal permissions (see requirements A3). Roles would be added as a column + route-level policy.
