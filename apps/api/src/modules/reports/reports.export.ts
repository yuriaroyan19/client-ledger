import type { Response } from 'express';
import { formatDateOnly, toDateRange } from '../../lib/dates.js';
import { safeFilename, toCsvRow } from '../../lib/csv.js';
import { Decimal, formatMoney } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { clientsService } from '../clients/clients.service.js';
import { activeMovementsWhere, net, totalsFor, ZERO_TOTALS } from '../movements/ledger.js';
import { movementOrder } from '../movements/movements.service.js';
import type { OverviewQuery, ReportQuery } from './reports.schemas.js';
import { EXPORT_TRANSACTION, reportsService } from './reports.service.js';

const DEFAULT_BATCH_SIZE = 1000;
const UTF8_BOM = String.fromCharCode(0xfeff); // lets Excel detect UTF-8

function startCsv(res: Response, filename: string): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(filename)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.write(UTF8_BOM);
}

function rangeSuffix(query: ReportQuery): string {
  return query.from || query.to ? `${query.from ?? 'start'}_to_${query.to ?? 'today'}` : 'all-time';
}

/**
 * Client statement: every movement in the range with a running balance, streamed in batches.
 * Opening balance and all batches come from one snapshot, so the running balance always matches
 * the ledger even if movements are edited during a long download.
 */
export async function exportClientStatement(
  clientId: string,
  query: ReportQuery,
  res: Response,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const client = await clientsService.getEntity(clientId, tx);
    const range = toDateRange(query);
    const opening = range.from
      ? net(await totalsFor(activeMovementsWhere({ clientId, before: range.from }), tx))
      : net(ZERO_TOTALS);

    startCsv(res, `${client.name}-statement-${rangeSuffix(query)}`);
    res.write(toCsvRow(['Date', 'Type', 'Description', 'Amount', 'Signed amount', 'Running balance']));
    res.write(toCsvRow([query.from ?? '', 'OPENING BALANCE', '', '', '', formatMoney(opening)]));

    let balance = new Decimal(opening);
    let cursor: string | undefined;
    for (;;) {
      const batch = await tx.movement.findMany({
        where: activeMovementsWhere({ clientId, range }),
        orderBy: movementOrder('oldest'),
        take: batchSize,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      for (const movement of batch) {
        const signed = movement.type === 'EARNING' ? movement.amount : movement.amount.negated();
        balance = balance.plus(signed);
        res.write(
          toCsvRow([
            formatDateOnly(movement.occurredOn),
            movement.type,
            movement.description,
            formatMoney(movement.amount),
            formatMoney(signed),
            formatMoney(balance),
          ]),
        );
      }
      // Stop reading once the client has gone; there is nobody left to send rows to.
      if (batch.length < batchSize || res.destroyed) break;
      cursor = batch.at(-1)?.id;
    }
    res.write(toCsvRow([query.to ?? '', 'CLOSING BALANCE', '', '', '', formatMoney(balance)]));
  }, EXPORT_TRANSACTION);
  res.end();
}

export async function exportOverview(
  query: Omit<OverviewQuery, 'page' | 'pageSize'>,
  res: Response,
  batchSize?: number,
): Promise<void> {
  startCsv(res, `clients-overview-${rangeSuffix(query)}`);
  res.write(toCsvRow(['Client', 'Status', 'Earnings', 'Expenses', 'Net', 'Closing balance', 'Movements']));
  await reportsService.streamOverview(
    query,
    (rows) => {
      for (const row of rows) {
        res.write(
          toCsvRow([
            row.name,
            row.archivedAt ? 'Archived' : 'Active',
            row.totalEarnings,
            row.totalExpenses,
            row.net,
            row.closingBalance,
            row.movementCount,
          ]),
        );
      }
      return !res.destroyed;
    },
    batchSize,
  );
  res.end();
}
