/**
 * Display formatting. Amounts arrive from the API as exact decimal strings; converting to a
 * number here is safe for display (≤ 14 significant digits) and is never used for arithmetic.
 */
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? 'USD';
const LOCALE = 'en-US';

const moneyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const signedMoneyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, signDisplay: 'exceptZero' });
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

export function formatMoney(amount: string): string {
  return moneyFormatter.format(Number(amount));
}

export function formatSignedMoney(amount: string): string {
  return signedMoneyFormatter.format(Number(amount));
}

export type Tone = 'positive' | 'negative' | 'neutral';

export function toneOf(amount: string): Tone {
  const value = Number(amount);
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

/** `YYYY-MM-DD` calendar date → "Nov 24, 2026" (no time zone shift). */
export function formatDate(dateOnly: string): string {
  return dateFormatter.format(new Date(`${dateOnly}T00:00:00Z`));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export const currencyCode = CURRENCY;
