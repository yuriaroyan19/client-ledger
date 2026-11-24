import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui/primitives';
import { createClientAction } from '@/features/clients/actions';
import { ClientForm } from '@/features/clients/components/client-form';

export const metadata: Metadata = { title: 'New client' };

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={
          <Link href="/clients" className="hover:text-fg">
            ← Clients
          </Link>
        }
        title="New client"
        description="Clients are records only — they never sign in."
      />
      <Card className="p-6">
        <ClientForm action={createClientAction} submitLabel="Create client" cancelHref="/clients" />
      </Card>
    </div>
  );
}
