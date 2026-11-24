import { describe, expect, it } from 'vitest';
import { Decimal, formatMoney, PositiveMoneySchema, sumMoney } from './money.js';

describe('PositiveMoneySchema', () => {
  it.each(['1', '0.01', '1250.5', '1250.50', '999999999999.99', ' 42.00 '])('accepts %j', (value) => {
    expect(PositiveMoneySchema.safeParse(value).success).toBe(true);
  });

  it.each([
    '0',
    '0.00',
    '-5',
    '1.234',
    '1e3',
    'abc',
    '',
    '1,000.00',
    '9999999999999',
    '1000000000000.00',
    '.5',
    '1.',
    '+5',
    '0.001',
    '١٢',
    '1 000',
    '0x10',
    'Infinity',
    'NaN',
  ])('rejects %j', (value) => {
    expect(PositiveMoneySchema.safeParse(value).success).toBe(false);
  });

  it('rejects JSON numbers to avoid float precision loss', () => {
    expect(PositiveMoneySchema.safeParse(12.5).success).toBe(false);
  });
});

describe('money arithmetic', () => {
  it('is exact where floats are not', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(formatMoney(sumMoney(new Decimal('0.1'), new Decimal('0.2')))).toBe('0.30');
  });

  it('formats with 2 decimals and handles empty values', () => {
    expect(formatMoney('5')).toBe('5.00');
    expect(formatMoney(new Decimal('-12.3'))).toBe('-12.30');
    expect(formatMoney(null)).toBe('0.00');
    expect(formatMoney(undefined)).toBe('0.00');
    expect(sumMoney(null, new Decimal('1.10'), undefined, new Decimal('2.20')).toFixed(2)).toBe('3.30');
    expect(sumMoney().toFixed(2)).toBe('0.00');
  });
});
