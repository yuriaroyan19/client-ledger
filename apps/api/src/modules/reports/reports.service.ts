import { Prisma } from '../../generated/prisma/client.js';
import { formatDateOnly, toDateRange, type DateRange } from '../../lib/dates.js';
import { Decimal, formatMoney } from '../../lib/money.js';
import { toPage, toSkipTake, type PaginationQuery } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { escapeLike } from '../../lib/sql.js';
import { clientsService } from '../clients/clients.service.js';
import { activeMovementsWhere, net, totalsFor, ZERO_TOTALS, type Totals } from '../movements/ledger.js';
import type { OverviewQuery, OverviewRowView, ReportQuery, ReportTotalsView } from './reports.schemas.js';

/**
 * Exports read everything inside ONE repeatable-read snapshot, so a CSV always matches the ledger
 * at a single instant even if someone edits movements while it downloads.
 */
export const EXPORT_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 10_000,
  timeout: 10 * 60_000,
} as const;

const EXPORT_BATCH_SIZE = 500;

function rangeView(range: DateRange) {
  return { from: range.from ? formatDateOnly(range.from) : null, to: range.to ? formatDateOnly(range.to) : null };
}

/** opening (before `from`) + movements within the range = closing. */
async function computeTotals(range: DateRange, clientId?: string): Promise<ReportTotalsView> {
  const [opening, inRange]: [Totals, Totals] = await Promise.all([
    range.from ? totalsFor(activeMovementsWhere({ ...(clientId && { clientId }), before: range.from })) : ZERO_TOTALS,
    totalsFor(activeMovementsWhere({ ...(clientId && { clientId }), range })),
  ]);
  const openingBalance = net(opening);
  const rangeNet = net(inRange);
  return {
    openingBalance: formatMoney(openingBalance),
    totalEarnings: formatMoney(inRange.earnings),
    totalExpenses: formatMoney(inRange.expenses),
    net: formatMoney(rangeNet),
    closingBalance: formatMoney(openingBalance.plus(rangeNet)),
    movementCount: inRange.count,
  };
}

interface OverviewRowRaw {
  clientId: string;
  name: string;
  archivedAt: Date | null;
  totalEarnings: string;
  totalExpenses: string;
  closingBalance: string;
  movementCount: number;
}

/** ORDER BY can't be parameterised, so it is chosen from a fixed whitelist — never from input. */
const OVERVIEW_ORDER: Record<OverviewQuery['sort'], Prisma.Sql> = {
  name: Prisma.sql`c.name ASC, c.id ASC`,
  balance_desc: Prisma.sql`"closingBalanceNum" DESC, c.name ASC, c.id ASC`,
  balance_asc: Prisma.sql`"closingBalanceNum" ASC, c.name ASC, c.id ASC`,
};

type OverviewFilter = Pick<OverviewQuery, 'search' | 'sort'>;

/** Name/email search over `clients c` (wildcards escaped; served by the trigram indexes). */
function clientSearch(search: string | undefined): Prisma.Sql {
  if (!search) return Prisma.empty;
  const pattern = `%${escapeLike(search)}%`;
  return Prisma.sql`WHERE c.name ILIKE ${pattern} OR c.email ILIKE ${pattern}`;
}

/**
 * Builds the per-client overview query. `c` = clients, `m` = their non-deleted movements up to the
 * range end; period columns only count movements inside the range.
 *
 *  - Sorted by name with a page: pick the page of clients FIRST (index on clients.name), then total
 *    only those clients' movements — cost grows with the page size, not with the ledger.
 *  - Sorted by balance (or no page, for the export): every client's balance is needed to order the
 *    rows, so movements are aggregated in a single pass.
 */
function overviewQuery(range: DateRange, filter: OverviewFilter, page?: { take: number; skip: number }): Prisma.Sql {
  // Dates are passed as 'YYYY-MM-DD' strings cast to DATE to avoid any session time zone conversion.
  const inRange = range.from ? Prisma.sql`m.occurred_on >= ${formatDateOnly(range.from)}::date` : Prisma.sql`TRUE`;
  const upToEnd = range.to ? Prisma.sql`AND m.occurred_on <= ${formatDateOnly(range.to)}::date` : Prisma.empty;
  const search = clientSearch(filter.search);
  const limit = page ? Prisma.sql`LIMIT ${page.take} OFFSET ${page.skip}` : Prisma.empty;
  const pageFirst = page && filter.sort === 'name';
  const clients = pageFirst
    ? Prisma.sql`(SELECT c.id, c.name, c.archived_at FROM clients c ${search} ORDER BY c.name ASC, c.id ASC ${limit}) c`
    : Prisma.sql`clients c`;

  return Prisma.sql`
    SELECT
      c.id AS "clientId",
      c.name,
      c.archived_at AS "archivedAt",
      COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'EARNING' AND ${inRange}), 0)::text AS "totalEarnings",
      COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'EXPENSE' AND ${inRange}), 0)::text AS "totalExpenses",
      COUNT(m.id) FILTER (WHERE ${inRange})::int AS "movementCount",
      COALESCE(SUM(CASE WHEN m.type = 'EARNING' THEN m.amount ELSE -m.amount END), 0)::text AS "closingBalance",
      COALESCE(SUM(CASE WHEN m.type = 'EARNING' THEN m.amount ELSE -m.amount END), 0) AS "closingBalanceNum"
    FROM ${clients}
    LEFT JOIN movements m ON m.client_id = c.id AND m.deleted_at IS NULL ${upToEnd}
    ${pageFirst ? Prisma.empty : search}
    GROUP BY c.id, c.name, c.archived_at
    ORDER BY ${OVERVIEW_ORDER[filter.sort]}
    ${pageFirst ? Prisma.empty : limit}`;
}

function toRowView(row: OverviewRowRaw): OverviewRowView {
  const earnings = new Decimal(row.totalEarnings);
  const expenses = new Decimal(row.totalExpenses);
  return {
    clientId: row.clientId,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    totalEarnings: formatMoney(earnings),
    totalExpenses: formatMoney(expenses),
    net: formatMoney(earnings.minus(expenses)),
    closingBalance: formatMoney(row.closingBalance),
    movementCount: row.movementCount,
  };
}

async function overviewPage(range: DateRange, query: OverviewFilter & PaginationQuery) {
  const [rows, [{ count }]] = await Promise.all([
    prisma.$queryRaw<OverviewRowRaw[]>(overviewQuery(range, query, toSkipTake(query))),
    // An aggregate without GROUP BY always returns exactly one row.
    prisma.$queryRaw<[{ count: number }]>`SELECT COUNT(*)::int AS count FROM clients c ${clientSearch(query.search)}`,
  ]);
  return { items: rows.map(toRowView), total: count };
}

export const reportsService = {
  async clientReport(clientId: string, query: ReportQuery) {
    const client = await clientsService.getEntity(clientId);
    const range = toDateRange(query);
    return {
      client: { id: client.id, name: client.name, archivedAt: client.archivedAt?.toISOString() ?? null },
      range: rangeView(range),
      totals: await computeTotals(range, clientId),
    };
  },

  async overview(query: OverviewQuery) {
    const range = toDateRange(query);
    const [totals, clientCount, rows] = await Promise.all([
      computeTotals(range),
      prisma.client.count(),
      overviewPage(range, query),
    ]);
    return {
      range: rangeView(range),
      totals: { ...totals, clientCount },
      clients: toPage(rows.items, rows.total, query),
    };
  },

  /**
   * Streams every overview row for the CSV export: ONE aggregation, read through a server-side
   * cursor in batches inside a single snapshot. `onBatch` returns false to stop early (client gone).
   */
  async streamOverview(
    query: OverviewFilter & ReportQuery,
    onBatch: (rows: OverviewRowView[]) => boolean,
    batchSize = EXPORT_BATCH_SIZE,
  ): Promise<void> {
    const range = toDateRange(query);
    // FETCH takes no bind parameters; batchSize is an internal integer, never user input.
    const fetch = Prisma.sql([`FETCH FORWARD ${String(Math.trunc(batchSize))} FROM overview_export`]);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DECLARE overview_export NO SCROLL CURSOR FOR ${overviewQuery(range, query)}`;
      for (;;) {
        const rows = await tx.$queryRaw<OverviewRowRaw[]>(fetch);
        if (rows.length === 0 || !onBatch(rows.map(toRowView)) || rows.length < batchSize) return;
      }
    }, EXPORT_TRANSACTION);
  },

  computeTotals,
};
