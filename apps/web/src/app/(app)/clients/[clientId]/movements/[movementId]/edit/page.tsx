import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { getClient } from '@/features/clients/queries';
import { UuidSchema } from '@/features/clients/schemas';
import { updateMovementAction } from '@/features/movements/actions';
import { MovementForm } from '@/features/movements/components/movement-form';
import { api, read } from '@/lib/api/client';

export const metadata: Metadata = { title: 'Edit movement' };

export default async function EditMovementPage({ params }: PageProps<'/clients/[clientId]/movements/[movementId]/edit'>) {
  const { clientId, movementId } = await params;
  if (!UuidSchema.safeParse(clientId).success || !UuidSchema.safeParse(movementId).success) notFound();

  const [client, movement] = await Promise.all([
    getClient(clientId),
    read(api.GET('/api/v1/clients/{clientId}/movements/{movementId}', { params: { path: { clientId, movementId } } })),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow={
          <Link href={`/clients/${clientId}`} className="hover:text-fg">
            ← {client.name}
          </Link>
        }
        title="Edit movement"
      />
      <Card className="p-6">
        {client.archivedAt ? (
          <Alert tone="warning">This client is archived, so its movements cannot be changed.</Alert>
        ) : (
          <MovementForm
            action={updateMovementAction.bind(null, clientId, movementId)}
            defaults={movement}
            submitLabel="Save changes"
            cancelHref={`/clients/${clientId}`}
            today={new Date().toISOString().slice(0, 10)}
          />
        )}
      </Card>
    </div>
  );
}
