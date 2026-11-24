# AGENTS.md — rules for contributors and AI coding agents

This file is the contract for changing this repository. It is short on purpose: every rule here is either enforced by
tooling (ESLint, TypeScript, tests, hooks, CI) or protects something that tooling cannot see. Read it fully before
editing. `CLAUDE.md` and other agent config files point here — keep this the single source of truth.

## 1. What this system is

- Admin-only ledger. **Admins** authenticate; **clients** are plain records and never authenticate.
- `apps/api` owns the database and all business rules. `apps/web` is a **backend-for-frontend**: it renders UI and
  calls the API server-side with the admin's session token. The browser never calls the API.
- Requirements: `docs/brainstorms/2026-11-24-client-ledger-requirements.md`. Architecture: `docs/architecture.md`.

## 2. Non-negotiable security rules

1. **Every API route is authenticated by default.** `ApiRouter.route()` adds `authenticate` unless `auth: false`.
   Only `POST /auth/login` and `/health/*` are public, and `test/auth.int.test.ts` fails if that set changes.
   Adding a public route requires an ADR in `docs/decisions/`.
2. **All input is validated by a Zod schema declared on the route** (`request.params|query|body`). Handlers receive
   only parsed values. Bodies use `z.strictObject` (unknown keys → 422; prevents mass assignment).
3. **Money is never a JS number.** Inputs/outputs are decimal strings (`"1250.50"`); storage is `DECIMAL(14,2)`;
   arithmetic uses `Prisma.Decimal`. Balance math lives **only** in `apps/api/src/modules/movements/ledger.ts`.
4. **No raw SQL string building.** Use Prisma, or `prisma.$queryRaw` tagged templates (parameterised). Dynamic
   `ORDER BY` comes from a fixed whitelist (see `reports.service.ts`). User search text goes through `escapeLike()`.
5. **Secrets never reach the browser or logs.** The session token lives only in an `httpOnly` cookie
   (`lib/auth/session-cookie.ts`). Server-only modules start with `import 'server-only'`. Never log request bodies,
   headers or tokens — the logger redacts known paths, but don't rely on it.
6. **Errors don't leak internals.** Throw `AppError` subclasses (`lib/errors.ts`); everything else becomes a generic
   500 problem response. Login failures always return the same message (no user enumeration).
7. **Every mutation is audited** in the same transaction (`auditService.record(..., tx)`). New actions are added to
   `AUDIT_ACTIONS`.
8. **Soft delete only** for ledger data (`deletedAt`) and archive for clients (`archivedAt`). Archived clients' ledgers
   are read-only (409).
9. **No `process.env` outside `config/env.ts`** (API, ESLint-enforced) / `lib/env.ts` (web). The only web exceptions
   are values Next.js inlines at build time: `NODE_ENV` (in `proxy.ts`) and `NEXT_PUBLIC_*` (in `lib/format.ts`).
10. Do not weaken: CSP (`web/src/proxy.ts`), security headers (`web/next.config.ts`, `helmet` in `api/src/app.ts`),
    rate limits, cookie flags, CORS (off by default), Docker hardening (non-root, read-only FS, `cap_drop: ALL`).

## 3. Architecture rules

### API (`apps/api`)

- Feature modules: `src/modules/<feature>/{<feature>.routes.ts, <feature>.schemas.ts, <feature>.service.ts}`.
  - `*.routes.ts` — declare routes with `api.route({...})`. One declaration = validation + auth + OpenAPI docs. No
    business logic beyond calling one service method and choosing the status code.
  - `*.schemas.ts` — Zod schemas for requests and responses; register response schemas with `.openapi('Name')`.
  - `*.service.ts` — business logic + Prisma. Accept an `Actor` for anything audited. Return plain view objects
    (ISO date strings, money strings), never Prisma models.
- Import Zod **only** from `src/lib/zod.ts` and Prisma types **only** from `src/generated/prisma/client.js`
  (ESLint-enforced).
- Cross-cutting code goes in `src/lib/` (pure helpers) or `src/middleware/` (Express middleware). Modules may import
  other modules' services, never their routes.
- Process lifecycle (HTTP server, graceful shutdown, seed) lives in `src/bootstrap/` and is fully tested.
  `src/server.ts` and `src/scripts/*.ts` are thin entrypoints that only wire OS signals and exit codes. Keep them that way.
- Ledger mutations run in one transaction that first locks the client row (`clientsService.getActiveEntity(id, tx)`),
  so archive/restore and movement changes can never interleave.
- Schema change = edit `prisma/schema.prisma` → `npm run db:migrate -- --name <change>` → commit the migration.
  Invariants that must hold even if the app is bypassed go in a migration as `CHECK` constraints.

### Web (`apps/web`)

- `src/app/` contains **routing only** (pages, layouts, route handlers). Data access and mutations live in
  `src/features/<feature>/` (`queries.ts`, `actions.ts`, `schemas.ts`, `components/`).
- Default to **Server Components**. Add `'use client'` only for interactivity (forms with `useActionState`, pending
  states). Never fetch the API from the browser.
- Reads: `read(api.GET(...))` in Server Components. Mutations: Server Actions using `mutate(api.POST(...))`, returning
  a `FormState`. Validate form input with Zod before calling the API (the API re-validates).
- API types are **generated** from `apps/api/openapi.json` into `src/lib/api/schema.d.ts`. Never hand-edit it; run
  `npm run api:sync` after any API contract change and commit both files (CI fails on drift).
- UI primitives in `src/components/ui/` are presentational only. Use semantic colour tokens from `globals.css`
  (`bg-surface`, `text-muted`, …), never raw colours. No inline `style` attributes (blocked by CSP).
- Every page exports `metadata` or `generateMetadata` with a specific `title`. The app is `noindex` by design.
- URL is the state for filters/pagination (plain GET forms and links) — they work without JavaScript.

## 4. Conventions

- TypeScript strict everywhere (`noUncheckedIndexedAccess` on). No `any`, no non-null `!` in app code.
- Names: files `kebab-case`; React components `PascalCase`; Zod schemas `XxxSchema`; DB tables/columns `snake_case`
  via `@@map`/`@map`.
- Dates of movements are calendar dates `YYYY-MM-DD` (no time zone). Timestamps are ISO-8601 UTC.
- Keep functions small and comments about **why**, not what.

## 5. Definition of done

Before you finish a change:

1. `npm run check` passes (lint + typecheck + unit tests for both apps), and `npm run test:coverage` stays at
   **100 %** statements/branches/functions/lines for both apps (Vitest thresholds, enforced in CI). Cover new code with
   tests that assert behaviour. Never lower a threshold or add coverage-ignore comments to get there.
2. API behaviour changes have **integration tests** in `apps/api/test/` (`npm run test:integration`), including the
   unauthenticated and invalid-input cases.
3. `npm run api:sync` was run if any route/schema changed; `openapi.json` + `schema.d.ts` are committed.
4. New env vars are added to `config/env.ts` (or `lib/env.ts`), `.env.example`, `docker-compose.yml` and the README.
5. `docker compose up --build` still works and `npm run test:smoke` passes for user-facing changes.
6. Security-relevant decisions are recorded as an ADR in `docs/decisions/` (`NNNN-title.md`).

Never bypass hooks (`--no-verify`), never disable a lint rule without a comment explaining why, never commit `.env`.
