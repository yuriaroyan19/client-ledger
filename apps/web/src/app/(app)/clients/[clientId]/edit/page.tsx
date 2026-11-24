import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/primitives';
import { updateClientAction } from '@/features/clients/actions';
import { ClientForm } from '@/features/clients/components/client-form';
import { getClient } from '@/features/clients/queries';
import { UuidSchema } from '@/features/clients/schemas';

export async function generateMetadata({ params }: PageProps<'/clients/[clientId]/edit'>): Promise<Metadata> {
  const { clientId } = await params;
  if (!UuidSchema.safeParse(clientId).success) return { title: 'Client not found' };
  return { title: `Edit ${(await getClient(clientId)).name}` };
}

export default async function EditClientPage({ params }: PageProps<'/clients/[clientId]/edit'>) {
  const { clientId } = await params;
  if (!UuidSchema.safeParse(clientId).success) notFound();
  const client = await getClient(clientId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={
          <Link href={`/clients/${clientId}`} className="hover:text-fg">
            ← {client.name}
          </Link>
        }
        title="Edit client"
      />
      <Card className="p-6">
        <ClientForm
          action={updateClientAction.bind(null, clientId)}
          defaults={client}
          submitLabel="Save changes"
          cancelHref={`/clients/${clientId}`}
        />
      </Card>
    </div>
  );
}
