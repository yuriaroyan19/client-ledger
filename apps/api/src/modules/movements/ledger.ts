import type { Prisma } from '../../generated/prisma/client.js';
import { dateRangeFilter, type DateRange } from '../../lib/dates.js';
import { Decimal, sumMoney } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Ledger math lives here and ONLY here. Every balance shown anywhere in the product is
 * derived from these functions, so reports and lists can never disagree.
 * Balance = Σ earnings − Σ expenses over non-deleted movements.
 */
export interface Totals {
  earnings: Decimal;
  expenses: Decimal;
  count: number;
}

export const ZERO_TOTALS: Totals = Object.freeze({ earnings: new Decimal(0), expenses: new Decimal(0), count: 0 });

export function net(totals: Totals): Decimal {
  return totals.earnings.minus(totals.expenses);
}

type MovementFilter = { clientId?: string } & ({ before: Date } | { range: DateRange });

export function activeMovementsWhere(filter: MovementFilter): Prisma.MovementWhereInput {
  const occurredOn = 'before' in filter ? { lt: filter.before } : dateRangeFilter(filter.range);
  return {
    deletedAt: null,
    ...(filter.clientId && { clientId: filter.clientId }),
    ...(occurredOn && { occurredOn }),
  };
}

export async function totalsFor(where: Prisma.MovementWhereInput): Promise<Totals> {
  const groups = await prisma.movement.groupBy({
    by: ['type'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
  return groups.reduce<Totals>(
    (acc, group) => {
      const sum = sumMoney(group._sum.amount);
      return group.type === 'EARNING'
        ? { ...acc, earnings: acc.earnings.plus(sum), count: acc.count + group._count._all }
        : { ...acc, expenses: acc.expenses.plus(sum), count: acc.count + group._count._all };
    },
    { ...ZERO_TOTALS },
  );
}

/** All-time balances for a set of clients, in a single grouped query. */
export async function balancesFor(clientIds: string[]): Promise<Map<string, Decimal>> {
  const balances = new Map<string, Decimal>(clientIds.map((id) => [id, new Decimal(0)]));
  if (clientIds.length === 0) return balances;

  const groups = await prisma.movement.groupBy({
    by: ['clientId', 'type'],
    where: { clientId: { in: clientIds }, deletedAt: null },
    _sum: { amount: true },
  });
  for (const group of groups) {
    const sum = sumMoney(group._sum.amount);
    balances.set(group.clientId, sumMoney(balances.get(group.clientId), group.type === 'EARNING' ? sum : sum.negated()));
  }
  return balances;
}
