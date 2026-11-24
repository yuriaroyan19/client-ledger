import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { withQuery } from '@/components/ui/pagination';
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { UuidSchema } from '@/features/clients/schemas';
import { api, read, type Schemas } from '@/lib/api/client';
import { firstParam } from '@/lib/date-range';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Activity', description: 'Audit trail of sign-ins and changes.' };

const ACTIONS: Record<string, { label: string; tone: 'neutral' | 'positive' | 'negative' | 'warning' | 'accent' }> = {
  'auth.login.succeeded': { label: 'Signed in', tone: 'neutral' },
  'auth.login.failed': { label: 'Failed sign-in', tone: 'negative' },
  'auth.logout': { label: 'Signed out', tone: 'neutral' },
  'auth.logout_all': { label: 'Signed out everywhere', tone: 'warning' },
  'client.created': { label: 'Client created', tone: 'accent' },
  'client.updated': { label: 'Client updated', tone: 'accent' },
  'client.archived': { label: 'Client archived', tone: 'warning' },
  'client.restored': { label: 'Client restored', tone: 'accent' },
  'movement.created': { label: 'Movement added', tone: 'positive' },
  'movement.updated': { label: 'Movement edited', tone: 'warning' },
  'movement.deleted': { label: 'Movement deleted', tone: 'negative' },
};

function clientIdOf(entry: Schemas['AuditLog']): string | undefined {
  if (entry.entityType === 'client') return entry.entityId ?? undefined;
  const metadata = entry.metadata as { clientId?: unknown } | null;
  return typeof metadata?.clientId === 'string' ? metadata.clientId : undefined;
}

export default async function ActivityPage({ searchParams }: PageProps<'/activity'>) {
  // Cursor pagination: `before` is the id of the last entry already seen. Anything else is ignored.
  const requested = firstParam((await searchParams).before);
  const before = UuidSchema.safeParse(requested).success ? requested : undefined;
  const logs = await read(api.GET('/api/v1/audit-logs', { params: { query: { pageSize: 50, before } } }));

  return (
    <>
      <PageHeader title="Activity" description="Append-only record of sign-ins and every change to clients and movements." />
      <Card>
        {logs.items.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <Table caption="Activity log">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Event</Th>
                <Th className="hidden sm:table-cell">Administrator</Th>
                <Th className="hidden md:table-cell">IP address</Th>
              </tr>
            </thead>
            <tbody>
              {logs.items.map((entry) => {
                const action = ACTIONS[entry.action] ?? { label: entry.action, tone: 'neutral' as const };
                const clientId = clientIdOf(entry);
                return (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap text-muted">
                      <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                    </Td>
                    <Td>
                      <Badge tone={action.tone}>{action.label}</Badge>
                      {clientId && entry.action !== 'movement.deleted' && (
                        <Link href={`/clients/${clientId}`} className="ml-2 text-sm text-accent hover:underline">
                          View client
                        </Link>
                      )}
                    </Td>
                    <Td className="hidden sm:table-cell">{entry.admin?.name ?? <span className="text-muted">Unknown</span>}</Td>
                    <Td className="hidden font-mono text-xs text-muted md:table-cell">{entry.ipAddress ?? '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {(before || logs.nextCursor) && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            {before ? (
              <Link href="/activity" className={buttonClass('secondary', 'sm')}>
                ← Newest
              </Link>
            ) : (
              <span />
            )}
            {logs.nextCursor && (
              <Link
                href={withQuery('/activity', { before: logs.nextCursor })}
                className={buttonClass('secondary', 'sm')}
                rel="next"
              >
                Older →
              </Link>
            )}
          </nav>
        )}
      </Card>
    </>
  );
}
