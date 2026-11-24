import Link from 'next/link';
import type { Route } from 'next';
import { buttonClass } from './button';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  /** Builds the href for a page, preserving the caller's other query params. */
  hrefFor: (page: number) => Route;
  noun?: string;
}

export function Pagination({ page, totalPages, totalItems, pageSize, hrefFor, noun = 'items' }: PaginationProps) {
  if (totalItems === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm text-muted">
      <p className="tabular">
        Showing <span className="font-medium text-fg">{first}</span>–<span className="font-medium text-fg">{last}</span> of{' '}
        <span className="font-medium text-fg">{totalItems}</span> {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link className={buttonClass('secondary', 'sm')} href={hrefFor(page - 1)} rel="prev">
              ← Previous
            </Link>
          ) : (
            <span className={buttonClass('secondary', 'sm', 'pointer-events-none opacity-50')} aria-disabled>
              ← Previous
            </span>
          )}
          <span className="tabular px-1">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link className={buttonClass('secondary', 'sm')} href={hrefFor(page + 1)} rel="next">
              Next →
            </Link>
          ) : (
            <span className={buttonClass('secondary', 'sm', 'pointer-events-none opacity-50')} aria-disabled>
              Next →
            </span>
          )}
        </div>
      )}
    </nav>
  );
}

/** Builds `path?…` keeping only defined, non-empty params. */
export function withQuery(path: string, params: Record<string, string | number | undefined>): Route {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return (qs ? `${path}?${qs}` : path) as Route;
}
