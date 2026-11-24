import Link from 'next/link';
import type { Route } from 'next';
import { buttonClass } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { withQuery } from '@/components/ui/pagination';
import { cn } from '@/lib/cn';
import { PRESET_LABELS, RANGE_PRESETS, type ResolvedRange } from '@/lib/date-range';

interface RangeFilterProps {
  basePath: string;
  range: ResolvedRange;
  /** Other query params to keep when the range changes (e.g. sort). Page always resets. */
  preserve?: Record<string, string | undefined>;
}

/** Date range picker built from links + a GET form: zero client JS, state lives in the URL. */
export function RangeFilter({ basePath, range, preserve = {} }: RangeFilterProps) {
  return (
    <div className="space-y-3">
      {range.error && <Alert tone="warning">{range.error} Showing all time instead.</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Date range presets" className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((preset) => (
            <Link
              key={preset}
              href={withQuery(basePath, { ...preserve, range: preset === 'all' ? undefined : preset }) as Route}
              aria-current={range.preset === preset ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                range.preset === preset
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
              )}
            >
              {PRESET_LABELS[preset]}
            </Link>
          ))}
        </nav>
        <form action={basePath} className="flex flex-wrap items-end gap-2" aria-label="Custom date range">
          {Object.entries(preserve).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <label className="text-sm">
            <span className="mb-1 block text-muted">From</span>
            <Input type="date" name="from" defaultValue={range.from ?? ''} className="w-40" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">To</span>
            <Input type="date" name="to" defaultValue={range.to ?? ''} className="w-40" />
          </label>
          <button type="submit" className={buttonClass('secondary')}>
            Apply
          </button>
        </form>
      </div>
    </div>
  );
}
