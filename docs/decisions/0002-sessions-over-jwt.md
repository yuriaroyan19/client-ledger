# 0002 — Opaque server-side sessions instead of JWTs

- Status: accepted
- Date: 2026-11-24

## Context

Admins need authenticated sessions between the web BFF and the API. The common alternatives are stateless JWTs (often
with refresh tokens) or opaque tokens backed by a session table.

## Decision

Use opaque, random 256-bit tokens (`cls_` prefix). The `sessions` table stores only their SHA-256 hash, with idle
(30 min) and absolute (12 h) expiry. The API validates the token on every request with one indexed lookup and touches
`last_used_at` at most once a minute.

## Consequences

- **Immediate revocation**: logout, "sign out everywhere" and incident response take effect on the next request. JWTs
  remain valid until they expire unless you build a deny-list (which reintroduces state).
- No signing-key management, algorithm-confusion pitfalls or refresh-token rotation races between concurrent requests.
- A database read per request. That's trivial at this scale; it could be cached briefly in memory if needed.
- A leaked database dump doesn't contain usable tokens.
