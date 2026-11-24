import { Prisma } from '../generated/prisma/client.js';
import { z } from './zod.js';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Max 12 integer digits + 2 decimals — matches the DECIMAL(14,2) column. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Monetary input is accepted ONLY as a decimal string (e.g. "1250.50").
 * JSON numbers are rejected on purpose: they are IEEE-754 floats and lose precision.
 */
export const PositiveMoneySchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, 'Must be a positive amount with at most 2 decimals, e.g. "1250.50"')
  // zod runs refinements even after a failed regex check, so re-test before constructing a Decimal.
  .refine((value) => !MONEY_PATTERN.test(value) || new Decimal(value).greaterThan(0), 'Amount must be greater than 0')
  .openapi({ example: '1250.50', description: 'Positive decimal string with up to 2 fractional digits.' });

/** Output money as a fixed 2-decimal string; signed values allowed. */
export const MoneySchema = z.string().openapi({ example: '-320.00', description: 'Decimal string, 2 fractional digits.' });

export function formatMoney(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Decimal(value).toFixed(2);
}

export function sumMoney(...values: Array<Decimal | null | undefined>): Decimal {
  return values.reduce<Decimal>((acc, value) => (value ? acc.plus(value) : acc), new Decimal(0));
}
