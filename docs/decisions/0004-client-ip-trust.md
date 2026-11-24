# 0004 — Which client IP the system trusts

- Status: accepted
- Date: 2026-11-24

## Context

The API uses the client IP for the per-IP login limit, the global rate limit, session records and the audit log. It
receives requests only from the web BFF, which used to forward the last entry of the browser's `X-Forwarded-For`.

Next.js only sets `X-Forwarded-For` when the header is missing. If the browser sends one, it reaches the BFF unchanged.
When the web app is exposed directly (the default compose setup), anyone could therefore pick their own IP. That would
reset the per-IP login limit on every request and write forged addresses into the audit log.

## Decision

The BFF forwards a client IP only from proxies the operator declares: `TRUSTED_PROXY_HOPS` (default `0`).

- `0`: the web app is exposed directly. `X-Forwarded-For` is ignored and the API sees the web container's address.
- `N ≥ 1`: take the N-th entry from the right, which is the address our outermost proxy saw. It must be a valid IP.

The logic lives in `apps/web/src/lib/api/forwarded.ts` and is used for API calls and CSV downloads alike.

## Consequences

- Spoofing is impossible in the default setup.
- With `0`, all logins share one bucket for the per-IP limit (20 attempts per 15 minutes by default). An attacker can
  slow logins for everyone, but cannot bypass the per-account limit or guess passwords faster. Production setups
  behind a reverse proxy should set `TRUSTED_PROXY_HOPS=1`. That restores per-user limits and real audit IPs.
- Setting a hop count higher than the real number of proxies brings the spoofing back. This is documented next to
  the variable in `.env.example`, `docker-compose.yml` and the README.
