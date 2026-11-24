import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert, Card } from '@/components/ui/primitives';
import { hasValidSession } from '@/features/auth/session';
import { safeNextPath } from '@/lib/auth/constants';
import { firstParam } from '@/lib/date-range';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to the Client Ledger administration area.',
};

const NOTICES: Record<string, { tone: 'warning' | 'positive'; text: string }> = {
  expired: { tone: 'warning', text: 'Your session has expired. Please sign in again.' },
  'signed-out': { tone: 'positive', text: 'You have been signed out.' },
  'signed-out-everywhere': { tone: 'positive', text: 'You have been signed out on all devices.' },
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = firstParam(params.next);
  if (await hasValidSession()) redirect(safeNextPath(next) as Parameters<typeof redirect>[0]);

  const notice = NOTICES[firstParam(params.reason) ?? ''];

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-fg"
          >
            CL
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Client Ledger</h1>
          <p className="mt-1 text-sm text-muted">Administrator sign in</p>
        </div>
        <Card className="space-y-4 p-6">
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <LoginForm next={next && safeNextPath(next) !== '/clients' ? safeNextPath(next) : undefined} />
        </Card>
        <p className="mt-6 text-center text-xs text-muted">Access is restricted to authorised administrators.</p>
      </div>
    </main>
  );
}
