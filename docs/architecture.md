# Architecture

## Overview

```
 Browser ──HTTPS──▶  web (Next.js, :3000)  ──HTTP (internal network)──▶  api (Express, :4000)  ──▶  Postgres
          cookie:          Server Components / Server Actions               Bearer session token
          __Host-cl_session   (BFF: holds no data, no DB access)            (only service with DB access)
```

| Container | Networks          | Reachable from                          | Notes                                    |
| --------- | ----------------- | --------------------------------------- | ---------------------------------------- |
| `web`     | frontend          | host `:3000`                            | the only browser-facing service          |
| `api`     | frontend, backend | `web`; host `127.0.0.1:4000`            | Swagger at `/docs`                       |
| `db`      | backend           | `api`, `migrate`; host `127.0.0.1:5433` | the web container cannot reach it        |
| `migrate` | backend           | —                                       | one-shot: `prisma migrate deploy` + seed |

## Why a backend-for-frontend

The brief asks for Next.js _and_ a separate Node API. Rather than having the browser call the API (tokens in JS, CORS,
CSRF on a second origin), Next.js acts as a BFF:

- The browser holds a single `httpOnly`, `SameSite=Lax`, `Secure`, `__Host-` cookie. JavaScript can't read it.
- Server Components fetch data on the server and stream HTML. Very little JS ships to the client (forms, pending
  states, active nav link).
- Mutations are Server Actions. Next.js checks `Origin` against `Host` on every action (CSRF protection), and forms
  work without JavaScript (progressive enhancement — `scripts/smoke-test.mjs` drives the app this way).
- The API stays a clean, documented, stateless REST service usable from Swagger or other clients.

See [ADR 0001](decisions/0001-backend-for-frontend.md).

## API request lifecycle

```
pino-http (request id, structured log)
 → helmet (strict headers, CSP default-src 'none')
 → cors (disabled unless CORS_ORIGINS set)
 → global rate limit
 → express.json (16 kb limit)
 → ApiRouter route:  authenticate → route middleware (e.g. login limiters) → Zod validation → handler
 → errorHandler  (AppError / Prisma / body-parser → RFC 9457 problem+json, everything else → generic 500)
```

`ApiRouter.route()` (`apps/api/src/lib/http/api-router.ts`) is the core abstraction. One declaration produces the
Express route, its authentication, its validation and its OpenAPI operation. Docs therefore can't drift from code, and
handlers can't read unvalidated input.

## Contract-first typing across apps

```
Zod schemas (api) ──▶ openapi.json (committed) ──▶ openapi-typescript ──▶ web/src/lib/api/schema.d.ts ──▶ openapi-fetch
```

`npm run api:sync` regenerates both artifacts. CI fails if either is stale, so a breaking API change can't merge
without the web app compiling against it.

## Domain model

- `Admin` — authenticates; `passwordHash` is argon2id.
- `Session` — opaque server-side session; only `sha256(token)` is stored; idle + absolute expiry; revocable.
- `Client` — name, optional unique email, phone, notes; `archivedAt` for soft archive.
- `Movement` — `type` (EARNING | EXPENSE), positive `amount DECIMAL(14,2)`, `occurredOn DATE`, `description`,
  `deletedAt` soft delete.
- `AuditLog` — append-only; written in the same transaction as the change it describes.

Balance = Σ earnings − Σ expenses over non-deleted movements. All of this math lives in
`apps/api/src/modules/movements/ledger.ts`. For a range `[from, to]`:

```
opening = balance(occurredOn < from)
net     = earnings(range) − expenses(range)
closing = opening + net
```

Integration tests check that report totals equal the sum of the listed movements, and that overview totals equal the
sum of the per-client rows.

## Web rendering & performance

- Server Components by default; client components are leaf-level (`'use client'` in forms/buttons only).
- Parallel data fetching per page (`Promise.all`); `React.cache` dedupes calls shared by `generateMetadata` and the page.
- `loading.tsx` streams an instant skeleton on navigation.
- System font stack: zero font downloads, no layout shift.
- `output: 'standalone'`: small runtime image that runs `node server.js`.
- All pages render dynamically. That's required anyway (per-user data and per-request CSP nonces), so the root layout
  opts in explicitly with `connection()`.
- Known trade-off: because pages stream (`loading.tsx`), `notFound()` raised after streaming starts renders the 404 UI
  (marked `noindex`) with HTTP status 200. That's acceptable for a private, non-indexed admin app.

## Testing strategy

| Layer                                                                                                | Tool                                                                              | Where                          |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| API unit (money, dates, CSV, tokens, env, router, errors, rate limits)                               | Vitest + supertest                                                                | `apps/api/src/**/*.test.ts`    |
| API integration (auth, authz, CRUD, literal report values, CSV, concurrency, seed, server lifecycle) | Vitest + real Postgres                                                            | `apps/api/test/*.int.test.ts`  |
| Web (proxy/CSP, BFF client, Server Actions, every page and route handler, components)                | Vitest + Testing Library + fake Next request APIs (`apps/web/test/next-fakes.ts`) | `apps/web/src/**/*.test.ts(x)` |
| End-to-end smoke (no-JS form flows through the real stack)                                           | Node script                                                                       | `scripts/smoke-test.mjs`       |

Coverage is enforced at **100 %** (statements, branches, functions, lines) for both apps in CI. Only generated code
(Prisma client, OpenAPI types) and the thin process entrypoints are excluded, and a unit test checks that those
entrypoints exist and are wired (`apps/api/src/bootstrap/entrypoints.test.ts`).
