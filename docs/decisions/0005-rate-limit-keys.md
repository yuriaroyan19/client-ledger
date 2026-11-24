# 0005 — Rate limits keyed by session, not by IP

- Status: accepted
- Date: 2026-11-24

## Context

All browser traffic reaches the API from the web container's single IP (see [ADR 0004](0004-client-ip-trust.md)).
The API's global limit (600 requests/minute) was keyed by IP, so every admin shared one budget. The web page guard
only checked that a session cookie _existed_, so a fake cookie triggered real API calls. One client looping about
10 requests a second, with no valid login, could exhaust the budget and every real admin then got 429.

## Decision

- **Signed-in requests** are limited **per session** (`RATE_LIMIT_SESSION_MAX_PER_MINUTE`, default 300), keyed by
  the session id the API itself validated. The limiter runs after `authenticate`.
- The **per-IP limit** (`RATE_LIMIT_ANONYMOUS_MAX_PER_MINUTE`, default 600) only counts requests **without** a
  well-formed session token: login, health, unknown routes, garbage tokens.
- **Failed token checks** are counted per IP inside `authenticate` (`RATE_LIMIT_AUTH_FAILURES_PER_MINUTE`,
  default 30). Once an IP is over budget, tokens the API hasn't recently issued or validated are refused with 429
  **before** the database lookup. Real admins behind the same IP keep working because their sessions are in a
  bounded in-memory "recently valid" set (filled only at login and on successful validation, so forged tokens can't
  grow it). The set never grants access: every request is still validated against the database.
- The **web app** rejects a malformed session cookie before calling the API (redirect to login, cookie deleted).

## Consequences

- A forged but well-formed token never touches a real session's budget or the shared anonymous budget. After the
  failure budget is spent, forged tokens get 429 without any database work (`test/rate-limits.int.test.ts`
  reproduces both reported attacks and counts the database lookups).
- Trade-off: during an active attack, a valid session this API process hasn't seen recently (for example, right after
  an API restart) gets 429 until the window passes. Signing in again works immediately.
- Garbage tokens are rejected without a database lookup and count against the per-IP budget.
- Login attempts remain limited per IP and per account (unchanged).
- High-volume request floods are a network-level concern: put a reverse proxy or WAF in front for that.
- Configuration rename: `RATE_LIMIT_GLOBAL_MAX_PER_MINUTE` → `RATE_LIMIT_ANONYMOUS_MAX_PER_MINUTE`.
