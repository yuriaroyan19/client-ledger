# 0001 — Next.js as a backend-for-frontend

- Status: accepted
- Date: 2026-11-24

## Context

The frontend must be Next.js and the backend a separate Node.js + TypeScript API. Security is the main evaluation
criterion. The browser could either call the API directly or go through Next.js.

## Decision

The browser talks **only** to Next.js. Next.js calls the API server-side (Server Components for reads, Server Actions
for writes) and attaches the session token from an `httpOnly` cookie. The API has CORS disabled by default.

## Consequences

- No credential is ever readable by page JavaScript; XSS can't exfiltrate sessions.
- One origin for the browser: no CORS, and CSRF is handled by `SameSite=Lax` plus Next.js's Server Action Origin check.
- Pages are server-rendered with data and ship little JS; forms work without JS.
- The API remains a standalone, documented REST service (Swagger) that other clients can use with bearer tokens.
- Cost: an extra network hop (web → api) on the internal Docker network, which is negligible here.
