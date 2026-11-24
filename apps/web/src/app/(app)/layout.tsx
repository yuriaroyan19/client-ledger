import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLink } from '@/components/layout/nav-link';
import { buttonClass } from '@/components/ui/button';
import { logoutAction, logoutEverywhereAction } from '@/features/auth/actions';
import { getCurrentAdmin } from '@/features/auth/session';

/**
 * Authenticated shell. `getCurrentAdmin()` validates the session against the API on every
 * request (an invalid session redirects to the login page before anything renders).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/clients" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-accent-fg">
              CL
            </span>
            <span className="hidden sm:inline">Client Ledger</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink href="/clients">Clients</NavLink>
            <NavLink href="/reports">Reports</NavLink>
            <NavLink href="/activity">Activity</NavLink>
          </nav>
          <details className="relative ml-auto">
            <summary className={buttonClass('ghost', 'sm', 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
              <span
                aria-hidden
                className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
              >
                {admin.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-40 truncate sm:inline">{admin.name}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-60 rounded-lg border border-border bg-surface p-2 shadow-lg">
              <div className="border-b border-border px-2 pb-2 text-sm">
                <p className="truncate font-medium">{admin.name}</p>
                <p className="truncate text-muted">{admin.email}</p>
              </div>
              <form action={logoutAction} className="pt-2">
                <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-muted">
                  Sign out
                </button>
              </form>
              <form action={logoutEverywhereAction}>
                <button
                  type="submit"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-surface-muted"
                >
                  Sign out on all devices
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
