---
date: 2026-11-24
topic: client-ledger
status: accepted
---

# Client Ledger — Requirements

## Problem

Administrators need a private back-office to keep a ledger of money movements
(earnings and expenses) per client and to report balances over a period.
Clients are records only — they never log in.

## Actors

- **Administrator** — authenticated; the only actor that touches the system.
- **Client** — a database record (name, contact details, notes). No access.

## Requirements

### Authentication (security is the top evaluation criterion)

- R1. Only authenticated administrators can access any data or page except the login page and health checks.
- R2. Admins sign in with email + password. Failure messages never reveal whether the email exists.
- R3. Sessions are short-lived and renewable. Sign-out invalidates the session server-side, and a stolen, reused refresh credential invalidates the whole session family.
- R4. Login is rate-limited against brute force.
- R5. The browser never holds a readable credential (no tokens in JS-accessible storage).
- R6. The first administrator is provisioned at deploy time from environment configuration. There is no public sign-up.

### Clients

- R7. Admins can create, list (search + paginate), view, edit and archive clients.
- R8. Archiving hides the client from default lists but keeps its history. Archived clients can be restored.
- R9. A client's email is optional but unique among clients when present.

### Movements (earnings / expenses)

- R10. Admins can add a movement to a client: type (earning | expense), positive amount, date it occurred, description.
- R11. Admins can edit and delete movements. Deletion is a soft delete, so the ledger remains auditable.
- R12. Amounts are exact decimals (no floating-point drift) with 2 fractional digits, single currency.

### Reports

- R13. Per client: for "all time" or an inclusive date range, show opening balance (before the range), total earnings, total expenses, net, closing balance, and the list of movements in range.
- R14. Overview: the same totals across all clients for a range, plus a per-client balance breakdown.
- R15. Reports can be exported as CSV.

### Auditability

- R16. Every mutating action (login, logout, create/update/delete of clients and movements) is recorded with the acting admin, the entity and the time.

### Non-functional

- R17. Backend: separate Node.js + TypeScript API (Express + Prisma), OpenAPI/Swagger docs, structured logging with secret redaction and request correlation.
- R18. Frontend: Next.js with server-first rendering, minimal client JS, per-page metadata, and private-app SEO hygiene (noindex).
- R19. Everything runs with one `docker compose up` command, with documented run rules.
- R20. The repository ships contributor/AI rules (`AGENTS.md`) that encode the architecture, conventions and security checklist.

### Developer workflow (added 2026-11-24)

- R21. Git hooks via Husky: `pre-commit` runs lint-staged (lint + format staged files); `pre-push` runs typecheck and unit tests for both apps.
- R22. Unit tests in both apps; integration tests for the API against a real database.
- R23. Root `package.json` exposes quick commands for common tasks (dev, test, lint, docker, database).

## Success Criteria

- A reviewer can clone, copy `.env.example`, run one command and sign in.
- No endpoint returns data without a valid session (verified by tests).
- Report totals equal the sum of the listed movements for any range (verified by tests).

## Scope Boundaries

- Out: client-facing portal, multi-currency, multi-tenant organisations, admin role hierarchy, admin self-service management UI (admins are provisioned via seed/CLI), password reset by email, 2FA (noted as a future hardening step).

## Assumptions (inferred — not explicitly confirmed)

- A1. Single currency (displayed as USD; configurable on the frontend).
- A2. Movement dates are calendar dates (no time-of-day). Ranges are inclusive and interpreted as calendar dates, independent of time zone.
- A3. All admins have equal permissions over all clients.
- A4. PostgreSQL is the database.
