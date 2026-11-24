import { describe, expect, it } from 'vitest';
import { describeRange, isValidDateOnly, pageFromSearchParams, presetRange, rangeFromSearchParams } from './date-range';

const NOW = new Date('2026-03-15T23:30:00Z');

describe('presetRange', () => {
  it('computes calendar ranges in UTC', () => {
    expect(presetRange('this-month', NOW)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(presetRange('last-month', NOW)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('this-year', NOW)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('last-year', NOW)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetRange('last-30-days', NOW)).toEqual({ from: '2026-02-14', to: '2026-03-15' });
    expect(presetRange('all', NOW)).toEqual({});
  });

  it('handles January → previous December', () => {
    expect(presetRange('last-month', new Date('2026-01-10T00:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('rangeFromSearchParams', () => {
  it('prefers a known preset', () => {
    expect(rangeFromSearchParams({ range: 'this-year', from: '2020-01-01' }).preset).toBe('this-year');
  });

  it('accepts a custom, open-ended range', () => {
    expect(rangeFromSearchParams({ from: '2026-01-01' })).toEqual({ preset: 'custom', from: '2026-01-01' });
  });

  it('falls back to all time with an explanation for bad input', () => {
    expect(rangeFromSearchParams({ from: '2026-02-31' })).toMatchObject({ preset: 'all', error: expect.any(String) });
    expect(rangeFromSearchParams({ from: '2026-03-01', to: '2026-01-01' })).toMatchObject({
      preset: 'all',
      error: expect.any(String),
    });
    expect(rangeFromSearchParams({ range: '__proto__' })).toEqual({ preset: 'all' });
  });
});

describe('helpers', () => {
  it('validates date-only strings strictly', () => {
    expect(isValidDateOnly('2024-02-29')).toBe(true);
    expect(isValidDateOnly('2025-02-29')).toBe(false);
    expect(isValidDateOnly('2026-1-1')).toBe(false);
  });

  it('parses page numbers defensively', () => {
    expect(pageFromSearchParams({ page: '3' })).toBe(3);
    expect(pageFromSearchParams({ page: '-1' })).toBe(1);
    expect(pageFromSearchParams({ page: 'abc' })).toBe(1);
    expect(pageFromSearchParams({ page: ['2', '9'] })).toBe(2);
  });

  it('describes ranges for humans', () => {
    const fmt = (value: string) => value;
    expect(describeRange({}, fmt)).toBe('All time');
    expect(describeRange({ from: 'A' }, fmt)).toBe('Since A');
    expect(describeRange({ to: 'B' }, fmt)).toBe('Up to B');
    expect(describeRange({ from: 'A', to: 'B' }, fmt)).toBe('A – B');
  });
});
