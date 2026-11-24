import { Prisma } from '../../generated/prisma/client.js';
import { formatDateOnly, toDateRange, type DateRange } from '../../lib/dates.js';
import { Decimal, formatMoney } from '../../lib/money.js';
import { toPage, toSkipTake, type PaginationQuery } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { escapeLike } from '../../lib/sql.js';
import { clientsService } from '../clients/clients.service.js';
import { activeMovementsWhere, net, totalsFor, ZERO_TOTALS, type Totals } from '../movements/ledger.js';
import type { OverviewQuery, OverviewRowView, ReportQuery, ReportTotalsView } from './reports.schemas.js';

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

async function overviewRows(range: DateRange, query: Pick<OverviewQuery, 'search' | 'sort'> & PaginationQuery) {
  // Dates are passed as 'YYYY-MM-DD' strings cast to DATE to avoid any session time zone conversion.
  const inRange = range.from ? Prisma.sql`m.occurred_on >= ${formatDateOnly(range.from)}::date` : Prisma.sql`TRUE`;
  const upToEnd = range.to ? Prisma.sql`AND m.occurred_on <= ${formatDateOnly(range.to)}::date` : Prisma.empty;
  const search = query.search
    ? Prisma.sql`WHERE c.name ILIKE ${`%${escapeLike(query.search)}%`} OR c.email ILIKE ${`%${escapeLike(query.search)}%`}`
    : Prisma.empty;
  const { skip, take } = toSkipTake(query);

  const rows = await prisma.$queryRaw<OverviewRowRaw[]>`
    SELECT
      c.id AS "clientId",
      c.name,
      c.archived_at AS "archivedAt",
      COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'EARNING' AND ${inRange}), 0)::text AS "totalEarnings",
      COALESCE(SUM(m.amount) FILTER (WHERE m.type = 'EXPENSE' AND ${inRange}), 0)::text AS "totalExpenses",
      COUNT(m.id) FILTER (WHERE ${inRange})::int AS "movementCount",
      COALESCE(SUM(CASE WHEN m.type = 'EARNING' THEN m.amount ELSE -m.amount END), 0)::text AS "closingBalance",
      COALESCE(SUM(CASE WHEN m.type = 'EARNING' THEN m.amount ELSE -m.amount END), 0) AS "closingBalanceNum"
    FROM clients c
    LEFT JOIN movements m ON m.client_id = c.id AND m.deleted_at IS NULL ${upToEnd}
    ${search}
    GROUP BY c.id
    ORDER BY ${OVERVIEW_ORDER[query.sort]}
    LIMIT ${take} OFFSET ${skip}`;

  // An aggregate without GROUP BY always returns exactly one row.
  const [{ count }] = await prisma.$queryRaw<[{ count: number }]>`SELECT COUNT(*)::int AS count FROM clients c ${search}`;

  const items: OverviewRowView[] = rows.map((row) => {
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
  });
  return { items, total: count };
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
      overviewRows(range, query),
    ]);
    return {
      range: rangeView(range),
      totals: { ...totals, clientCount },
      clients: toPage(rows.items, rows.total, query),
    };
  },

  /** Iterates all overview rows in pages, for CSV export without loading everything in memory. */
  async *overviewRowsBatched(query: Omit<OverviewQuery, 'page' | 'pageSize'>, batchSize = 500) {
    const range = toDateRange(query);
    for (let page = 1; ; page += 1) {
      const { items } = await overviewRows(range, { ...query, page, pageSize: batchSize });
      if (items.length > 0) yield items;
      if (items.length < batchSize) return;
    }
  },

  computeTotals,
};
