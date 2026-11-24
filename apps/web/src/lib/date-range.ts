/**
 * Report ranges. All values are `YYYY-MM-DD` calendar dates computed in UTC so the server
 * and the API agree on what "this month" means. `undefined` bounds mean "open-ended".
 */
export interface DateRange {
  from?: string;
  to?: string;
}

export const RANGE_PRESETS = ['all', 'this-month', 'last-month', 'last-30-days', 'this-year', 'last-year'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  all: 'All time',
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30-days': 'Last 30 days',
  'this-year': 'This year',
  'last-year': 'Last year',
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Same bounds as the API (apps/api/src/lib/dates.ts), so the web never sends a date the API rejects. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function isValidDateOnly(value: string | undefined): value is string {
  if (!value || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const year = date.getUTCFullYear();
  return !Number.isNaN(date.getTime()) && iso(date) === value && year >= MIN_YEAR && year <= MAX_YEAR;
}

export function presetRange(preset: RangePreset, now = new Date()): DateRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  switch (preset) {
    case 'all':
      return {};
    case 'this-month':
      return { from: iso(utc(year, month, 1)), to: iso(utc(year, month + 1, 0)) };
    case 'last-month':
      return { from: iso(utc(year, month - 1, 1)), to: iso(utc(year, month, 0)) };
    case 'last-30-days':
      return { from: iso(utc(year, month, now.getUTCDate() - 29)), to: iso(utc(year, month, now.getUTCDate())) };
    case 'this-year':
      return { from: iso(utc(year, 0, 1)), to: iso(utc(year, 11, 31)) };
    case 'last-year':
      return { from: iso(utc(year - 1, 0, 1)), to: iso(utc(year - 1, 11, 31)) };
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export interface ResolvedRange extends DateRange {
  preset: RangePreset | 'custom';
  error?: string;
}

/** Reads `?range=` (a preset) or `?from=&to=` (custom). Invalid input falls back to all time. */
export function rangeFromSearchParams(params: SearchParams): ResolvedRange {
  const preset = single(params.range);
  if (preset && (RANGE_PRESETS as readonly string[]).includes(preset)) {
    return { preset: preset as RangePreset, ...presetRange(preset as RangePreset) };
  }
  const from = single(params.from) || undefined;
  const to = single(params.to) || undefined;
  if (!from && !to) return { preset: 'all' };
  if ((from && !isValidDateOnly(from)) || (to && !isValidDateOnly(to))) {
    return { preset: 'all', error: 'Dates must be valid calendar dates.' };
  }
  if (from && to && from > to) return { preset: 'all', error: 'The start date must be on or before the end date.' };
  return { preset: 'custom', ...(from && { from }), ...(to && { to }) };
}

export function describeRange(range: DateRange, formatDate: (value: string) => string): string {
  if (range.from && range.to) return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  if (range.from) return `Since ${formatDate(range.from)}`;
  if (range.to) return `Up to ${formatDate(range.to)}`;
  return 'All time';
}

export function pageFromSearchParams(params: SearchParams): number {
  const page = Number.parseInt(single(params.page) ?? '1', 10);
  return Number.isFinite(page) && page > 0 && page <= 100_000 ? page : 1;
}

export { single as firstParam };
