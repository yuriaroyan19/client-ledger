import { z } from './zod.js';

/**
 * Movements happen on calendar dates (no time-of-day, no time zone).
 * They are represented as `YYYY-MM-DD` strings at the API boundary and as
 * UTC-midnight `Date` objects internally (Postgres `DATE` columns).
 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  // Round-trip check rejects impossible dates like 2026-02-31.
  return date.toISOString().startsWith(value) && year >= MIN_YEAR && year <= MAX_YEAR;
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const DateOnlySchema = z
  .string()
  .refine(isValidDateOnly, 'Must be a valid date in YYYY-MM-DD format')
  .openapi({ example: '2026-11-24', format: 'date' });

export interface DateRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

/** Optional inclusive `from`/`to` query params. Omit both for "all time". */
export const DateRangeQuerySchema = z
  .object({
    from: DateOnlySchema.optional().openapi({ description: 'Inclusive start date. Omit for all time.' }),
    to: DateOnlySchema.optional().openapi({ description: 'Inclusive end date. Omit for all time.' }),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    error: '`from` must be on or before `to`',
    path: ['from'],
  });

export function toDateRange(query: { from?: string | undefined; to?: string | undefined }): DateRange {
  return {
    from: query.from ? parseDateOnly(query.from) : undefined,
    to: query.to ? parseDateOnly(query.to) : undefined,
  };
}

/** Prisma `where` fragment for an inclusive date range on a DATE column. */
export function dateRangeFilter(range: DateRange): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) };
}
