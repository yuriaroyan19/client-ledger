/** Streaming fallback shown instantly on navigation while server data loads. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 rounded-md bg-surface-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-surface-muted" />
    </div>
  );
}
