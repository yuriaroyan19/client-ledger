# Client Ledger

A private back-office where **administrators** sign in, manage **clients** (records only — clients never log in),
record **earnings and expenses** per client, and see **balance reports** for any date range or all time.

| Part       | Stack                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| `apps/api` | Node.js 22 · TypeScript · Express 5 · Prisma 7 (PostgreSQL 17) · Zod · OpenAPI/Swagger · Pino |
| `apps/web` | Next.js 16 (App Router, Server Components, Server Actions) · React 19 · Tailwind CSS 4        |
| Infra      | Docker Compose · GitHub Actions · Husky + lint-staged                                         |

---

## Quick start (Docker — the supported way)

Requirements: **Docker Desktop** (or Docker Engine + Compose v2) and **Node.js 22** (only for the helper scripts).

```bash
npm run env:init      # creates .env with strong random passwords and prints the admin login
npm run docker:up     # = docker compose up --build -d
```

No Node on the host? `cp .env.example .env`, fill in `POSTGRES_PASSWORD` and `ADMIN_PASSWORD` (≥ 12 chars), then
`docker compose up --build -d`.

| URL                                | What                                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| http://localhost:3000              | Web app — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` |
| http://localhost:4000/docs         | Swagger UI (bound to 127.0.0.1 only)                                |
| http://localhost:4000/health/ready | API readiness probe                                                 |

What happens on `up`: Postgres starts → the one-shot **`migrate`** job applies migrations and runs the idempotent seed
(creates the initial admin; with `SEED_DEMO_DATA=true` adds sample clients) → the API starts once healthy → the web app
starts once the API is healthy.

```bash
npm run docker:logs   # follow logs        npm run docker:ps     # status/health
npm run docker:down   # stop (keeps data)  npm run docker:reset  # stop AND DELETE the database volume
npm run test:smoke    # end-to-end smoke test against the running stack
```

### Rules for running

1. **Never commit `.env`.** The pre-commit hook refuses it. Configuration is documented in `.env.example`.
2. The initial admin is created **only if it does not exist**. Changing `ADMIN_PASSWORD` later does nothing on its own.
   To rotate it (this also revokes that admin's sessions), run once:
   `docker compose run --rm -e ADMIN_RESET_PASSWORD=true migrate`. Don't leave `ADMIN_RESET_PASSWORD=true` in `.env`.
3. Schema changes go through **Prisma migrations** only (`npm run db:migrate`), never manual SQL on a live database.
4. Browsers talk **only** to the web app. The API is an internal service; its port is bound to `127.0.0.1` for Swagger
   and tooling. In production, don't publish it at all and set `SWAGGER_ENABLED=false`.
5. Serve the web app over **HTTPS** in any non-local deployment (cookies are `Secure` + `__Host-` prefixed).
6. Behind a reverse proxy that appends to `X-Forwarded-For`, set `TRUSTED_PROXY_HOPS=1`. Never set it when the web
   app is exposed directly: clients could then pick their own IP.

### More admins

```bash
docker compose run --rm -e ADMIN_EMAIL=jane@example.com -e ADMIN_PASSWORD='a-long-unique-password' -e ADMIN_NAME='Jane' migrate
```

---

## Local development (hot reload)

```bash
npm run setup         # installs root + both apps, creates .env files (git hooks are installed by `prepare`)
npm run dev:db        # Postgres only, on 127.0.0.1:${DB_PORT:-5433}
npm run db:deploy     # apply migrations
npm run db:seed       # admin + demo data
npm run dev           # API on :4000 (tsx watch) + web on :3000 (next dev), side by side
```

### Quick commands (root `package.json`)

| Command                     | Does                                                                          |
| --------------------------- | ----------------------------------------------------------------------------- |
| `npm run check`             | lint + typecheck + unit tests for both apps (what `pre-push` runs, plus lint) |
| `npm test`                  | unit tests (API + web)                                                        |
| `npm run test:integration`  | API integration tests against a real Postgres (`client_ledger_test`)          |
| `npm run test:all`          | everything except the smoke test                                              |
| `npm run test:coverage`     | all tests with **100 % coverage enforced** for both apps (needs Postgres)     |
| `npm run lint` / `lint:fix` | ESLint (type-aware on the API)                                                |
| `npm run format`            | Prettier                                                                      |
| `npm run api:sync`          | regenerate `openapi.json` **and** the web app's typed API client              |
| `npm run db:migrate`        | create/apply a migration in development                                       |
| `npm run db:studio`         | Prisma Studio                                                                 |

### Git hooks (Husky)

- **pre-commit** — blocks `.env*` files, then runs **lint-staged**: ESLint `--fix` + Prettier on staged files only
  (per-app configs in `apps/*/.lintstagedrc.json`).
- **pre-push** — `npm run typecheck` and `npm test` for both apps.

CI (`.github/workflows/ci.yml`) runs lint, types, unit **and** integration tests, OpenAPI/type drift checks, builds,
`npm audit`, Docker builds and the full-stack smoke test.

---

## Configuration

All variables live in `.env` (see `.env.example`). Highlights:

| Variable                                        | Default                                      | Notes                                                               |
| ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                             | — (required)                                 |                                                                     |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — / — (≥ 12 chars) / `Administrator`         | Initial admin                                                       |
| `SEED_DEMO_DATA`                                | `false` in compose, `true` in `.env.example` | Sample data on an empty DB                                          |
| `SESSION_IDLE_TIMEOUT_MINUTES`                  | `30`                                         | Session expires after inactivity                                    |
| `SESSION_ABSOLUTE_TIMEOUT_HOURS`                | `12`                                         | Hard session lifetime                                               |
| `ADMIN_RESET_PASSWORD`                          | `false`                                      | One-off password rotation (see rule 2)                              |
| `RATE_LIMIT_WINDOW_MINUTES`                     | `15`                                         | Window for the login limits                                         |
| `RATE_LIMIT_LOGIN_MAX_PER_IP`                   | `20`                                         | Login attempts per IP per window                                    |
| `RATE_LIMIT_LOGIN_MAX_FAILURES_PER_EMAIL`       | `5`                                          | Failed logins per account per window                                |
| `RATE_LIMIT_ANONYMOUS_MAX_PER_MINUTE`           | `600`                                        | Requests per IP per minute **without** a session                    |
| `RATE_LIMIT_SESSION_MAX_PER_MINUTE`             | `300`                                        | Requests per minute per signed-in session                           |
| `RATE_LIMIT_AUTH_FAILURES_PER_MINUTE`           | `30`                                         | Failed session checks per IP per minute (then unknown tokens: 429)  |
| `TRUSTED_PROXY_HOPS`                            | `0`                                          | Web: proxies in front that append to `X-Forwarded-For` (rule 6)     |
| `TRUST_PROXY`                                   | `loopback, linklocal, uniquelocal`           | API: Express `trust proxy` (the web container)                      |
| `CORS_ORIGINS`                                  | empty                                        | API: browser origins allowed to call it directly (keep empty)       |
| `LOG_LEVEL` / `LOG_PRETTY`                      | `info` / `false`                             | API logging                                                         |
| `SWAGGER_ENABLED`                               | `true`                                       | Disable in production                                               |
| `COOKIE_SECURE`                                 | `true`                                       | Keep `true`; `http://localhost` counts as secure in modern browsers |
| `CURRENCY`                                      | `USD`                                        | Display currency (build-time for the web image)                     |
| `WEB_PORT` / `API_PORT` / `DB_PORT`             | `3000` / `4000` / `5433`                     | Host ports                                                          |

The API validates its environment at boot and refuses to start on invalid config (`apps/api/src/config/env.ts`).

---

## Repository layout

```
.
├── apps/
│   ├── api/                      Express + Prisma REST API (the only thing that touches the database)
│   │   ├── prisma/               schema.prisma + migrations (incl. CHECK constraints)
│   │   ├── src/
│   │   │   ├── bootstrap/        HTTP server lifecycle + seed (server.ts / scripts/ only wire signals)
│   │   │   ├── config/           env parsing (fail fast)
│   │   │   ├── docs/             OpenAPI registry/generator
│   │   │   ├── lib/              cross-cutting: logger, prisma, errors, money, dates, csv, http/ApiRouter
│   │   │   ├── middleware/       authenticate, rate limits, request logging, error → problem+json
│   │   │   ├── modules/<feature>/ *.routes.ts · *.schemas.ts · *.service.ts (+ tests)
│   │   │   └── scripts/          seed, export-openapi
│   │   └── test/                 integration tests (real Postgres)
│   └── web/                      Next.js backend-for-frontend + UI
│       └── src/
│           ├── app/              routes only: (auth)/login, (app)/clients|reports|activity, exports/*, logout
│           ├── features/<feature>/ actions.ts (Server Actions) · queries.ts · schemas.ts · components/
│           ├── components/ui/    design-system primitives (no business logic)
│           ├── lib/              api client (typed from OpenAPI), auth cookie, env, formatting, date ranges
│           └── proxy.ts          auth gate + per-request CSP nonce
├── docs/                         architecture, security model, ADRs, requirements
├── scripts/                      env bootstrap, smoke test
├── AGENTS.md                     rules for contributors and AI agents  ← read before changing code
└── docker-compose.yml
```

Further reading: [`docs/architecture.md`](docs/architecture.md) · [`docs/security.md`](docs/security.md) ·
[`docs/decisions/`](docs/decisions) · [`AGENTS.md`](AGENTS.md)
