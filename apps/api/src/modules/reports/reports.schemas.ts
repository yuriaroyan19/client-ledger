import { DateRangeQuerySchema } from '../../lib/dates.js';
import { MoneySchema } from '../../lib/money.js';
import { PaginationQuerySchema, pageSchema } from '../../lib/pagination.js';
import { z } from '../../lib/zod.js';

export const ReportRangeSchema = z
  .object({
    from: z.string().nullable().openapi({ format: 'date', description: 'null = from the beginning' }),
    to: z.string().nullable().openapi({ format: 'date', description: 'null = up to today' }),
  })
  .openapi('ReportRange');

export const ReportTotalsSchema = z
  .object({
    openingBalance: MoneySchema.openapi({ description: 'Balance before `from` (0.00 for all time).' }),
    totalEarnings: MoneySchema,
    totalExpenses: MoneySchema,
    net: MoneySchema.openapi({ description: 'totalEarnings − totalExpenses within the range.' }),
    closingBalance: MoneySchema.openapi({ description: 'openingBalance + net.' }),
    movementCount: z.number().int(),
  })
  .openapi('ReportTotals');

export const ClientReportSchema = z
  .object({
    client: z.object({ id: z.uuid(), name: z.string(), archivedAt: z.iso.datetime().nullable() }),
    range: ReportRangeSchema,
    totals: ReportTotalsSchema,
  })
  .openapi('ClientReport');

export const ReportQuerySchema = DateRangeQuerySchema;

export const OverviewQuerySchema = DateRangeQuerySchema.safeExtend({
  ...PaginationQuerySchema.shape,
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['name', 'balance_desc', 'balance_asc']).default('name'),
});

export const OverviewRowSchema = z
  .object({
    clientId: z.uuid(),
    name: z.string(),
    archivedAt: z.iso.datetime().nullable(),
    totalEarnings: MoneySchema,
    totalExpenses: MoneySchema,
    net: MoneySchema,
    closingBalance: MoneySchema.openapi({ description: 'Balance at the end of the range.' }),
    movementCount: z.number().int(),
  })
  .openapi('OverviewRow');

export const OverviewReportSchema = z
  .object({
    range: ReportRangeSchema,
    totals: ReportTotalsSchema.extend({ clientCount: z.number().int() }),
    clients: pageSchema(OverviewRowSchema, 'OverviewRowPage'),
  })
  .openapi('OverviewReport');

export const CsvSchema = z.string().openapi({ description: 'RFC 4180 CSV, UTF-8 with BOM.' });

export type ReportQuery = z.output<typeof ReportQuerySchema>;
export type OverviewQuery = z.output<typeof OverviewQuerySchema>;
export type ReportTotalsView = z.output<typeof ReportTotalsSchema>;
export type OverviewRowView = z.output<typeof OverviewRowSchema>;
