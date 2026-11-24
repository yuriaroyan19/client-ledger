import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-medium text-accent">404</p>
        <h1 className="mt-1 text-2xl font-semibold">We couldn’t find that page</h1>
        <p className="mt-2 text-sm text-muted">It may have been moved, or the link is incorrect.</p>
        <ButtonLink href="/clients" variant="primary" className="mt-6">
          Back to clients
        </ButtonLink>
      </div>
    </main>
  );
}
