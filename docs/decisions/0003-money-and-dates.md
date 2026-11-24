# 0003 — Exact money and calendar dates

- Status: accepted
- Date: 2026-11-24

## Decision

- Amounts are stored as `DECIMAL(14,2)` and exchanged as **decimal strings** (`"1250.50"`). JSON numbers are rejected
  on input. All arithmetic uses `Prisma.Decimal`. The web app converts to `Number` only for display formatting.
- Amounts are always positive. `type` (EARNING | EXPENSE) carries the sign; the API returns a computed `signedAmount`.
- Movement dates are calendar dates (`DATE`, `YYYY-MM-DD`) with no time-of-day. Report ranges are inclusive and
  independent of the viewer's time zone. Presets ("this month") are computed in UTC on the server.

## Consequences

`0.1 + 0.2` problems are impossible, and reports are reproducible regardless of server or browser time zone. The cost
is that clients must send strings, which is documented in the OpenAPI spec and enforced by validation.
