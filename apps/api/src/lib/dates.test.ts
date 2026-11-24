import { describe, expect, it } from 'vitest';
import { DateRangeQuerySchema, dateRangeFilter, formatDateOnly, isValidDateOnly, parseDateOnly, toDateRange } from './dates.js';

describe('isValidDateOnly', () => {
  it.each(['2026-11-24', '2024-02-29', '1900-01-01'])('accepts %s', (value) => {
    expect(isValidDateOnly(value)).toBe(true);
  });

  it.each(['2026-02-31', '2025-02-29', '2026-13-01', '26-11-24', '2026-11-24T00:00:00Z', '1899-12-31', ''])(
    'rejects %j',
    (value) => {
      expect(isValidDateOnly(value)).toBe(false);
    },
  );
});

describe('date-only conversions', () => {
  it('round-trips without time zone drift', () => {
    expect(formatDateOnly(parseDateOnly('2026-03-29'))).toBe('2026-03-29');
    expect(parseDateOnly('2026-03-29').toISOString()).toBe('2026-03-29T00:00:00.000Z');
  });
});

describe('DateRangeQuerySchema', () => {
  it('allows open-ended and all-time ranges', () => {
    expect(DateRangeQuerySchema.safeParse({}).success).toBe(true);
    expect(DateRangeQuerySchema.safeParse({ from: '2026-01-01' }).success).toBe(true);
    expect(DateRangeQuerySchema.safeParse({ to: '2026-01-01' }).success).toBe(true);
  });

  it('allows a single-day range and rejects inverted ranges', () => {
    expect(DateRangeQuerySchema.safeParse({ from: '2026-01-01', to: '2026-01-01' }).success).toBe(true);
    expect(DateRangeQuerySchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false);
  });
});

describe('dateRangeFilter', () => {
  it('builds inclusive bounds', () => {
    const range = toDateRange({ from: '2026-01-01', to: '2026-01-31' });
    expect(dateRangeFilter(range)).toEqual({ gte: parseDateOnly('2026-01-01'), lte: parseDateOnly('2026-01-31') });
  });

  it('returns undefined for all time', () => {
    expect(dateRangeFilter({})).toBeUndefined();
  });
});
