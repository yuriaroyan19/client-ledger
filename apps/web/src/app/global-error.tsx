'use client';

/** Last-resort boundary (root layout failed). Must render its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center bg-canvas p-6 text-center text-fg">
        <div>
          <h1 className="text-xl font-semibold">Client Ledger is temporarily unavailable</h1>
          <p className="mt-2 text-sm text-muted">Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
