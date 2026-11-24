import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { Pagination, withQuery } from '@/components/ui/pagination';
import { Alert, Amount, Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { setClientArchivedAction } from '@/features/clients/actions';
import { getClient } from '@/features/clients/queries';
import { UuidSchema } from '@/features/clients/schemas';
import { createMovementAction, deleteMovementAction } from '@/features/movements/actions';
import { MovementForm } from '@/features/movements/components/movement-form';
import { RangeFilter } from '@/features/reports/components/range-filter';
import { TotalsGrid } from '@/features/reports/components/totals-grid';
import { api, read } from '@/lib/api/client';
import { describeRange, firstParam, pageFromSearchParams, rangeFromSearchParams } from '@/lib/date-range';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<'/clients/[clientId]'>): Promise<Metadata> {
  const { clientId } = await params;
  if (!UuidSchema.safeParse(clientId).success) return { title: 'Client not found' };
  const client = await getClient(clientId);
  return { title: client.name, description: `Balance and movements for ${client.name}.` };
}

const NOTICES: Record<string, string> = {
  created: 'Client created. Record their first movement below.',
  updated: 'Client details saved.',
  'movement-updated': 'Movement updated.',
};

export default async function ClientPage({ params, searchParams }: PageProps<'/clients/[clientId]'>) {
  const { clientId } = await params;
  if (!UuidSchema.safeParse(clientId).success) notFound();
  const query = await searchParams;

  const range = rangeFromSearchParams(query);
  const page = pageFromSearchParams(query);
  const rangeQuery = { from: range.from, to: range.to };

  // Independent requests run in parallel.
  const [client, report, movements] = await Promise.all([
    getClient(clientId),
    read(api.GET('/api/v1/clients/{clientId}/report', { params: { path: { clientId }, query: rangeQuery } })),
    read(
      api.GET('/api/v1/clients/{clientId}/movements', {
        params: { path: { clientId }, query: { ...rangeQuery, page, pageSize: PAGE_SIZE } },
      }),
    ),
  ]);

  const archived = Boolean(client.archivedAt);
  const basePath = `/clients/${clientId}`;
  const rangeParams =
    range.preset === 'custom' ? { from: range.from, to: range.to } : { range: range.preset === 'all' ? undefined : range.preset };
  const notice =
    (firstParam(query.created) && NOTICES.created) ||
    (firstParam(query.updated) && NOTICES.updated) ||
    (firstParam(query.movement) === 'updated' && NOTICES['movement-updated']);
  const today = new Date().toISOString().slice(0, 10);
  const contact = [client.email, client.phone].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/clients" className="hover:text-fg">
            ← Clients
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span className="truncate">{client.name}</span>
            {archived && <Badge tone="warning">Archived</Badge>}
          </span>
        }
        description={contact || 'No contact details'}
        actions={
          <>
            <a href={withQuery(`/exports/clients/${clientId}`, rangeQuery)} className={buttonClass('secondary')} download>
              Download CSV
            </a>
            <ButtonLink href={`/clients/${clientId}/edit`}>Edit</ButtonLink>
            <form action={setClientArchivedAction.bind(null, clientId, !archived)}>
              <SubmitButton
                variant={archived ? 'secondary' : 'danger'}
                pendingLabel={archived ? 'Restoring…' : 'Archiving…'}
                confirmMessage={
                  archived
                    ? undefined
                    : `Archive ${client.name}? Their history is kept, but no movements can be added until restored.`
                }
              >
                {archived ? 'Restore' : 'Archive'}
              </SubmitButton>
            </form>
          </>
        }
      />

      <div className="space-y-6">
        {notice && <Alert tone="positive">{notice}</Alert>}
        {archived && (
          <Alert tone="warning">
            This client is archived. Their ledger is read-only — restore the client to add or change movements.
          </Alert>
        )}
        {client.notes && (
          <Card className="px-5 py-4 text-sm whitespace-pre-line text-muted">
            <span className="sr-only">Notes: </span>
            {client.notes}
          </Card>
        )}

        <RangeFilter basePath={basePath} range={range} />
        <TotalsGrid totals={report.totals} isAllTime={!range.from && !range.to} />

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Movements" description={describeRange(range, formatDate)} />
            {movements.items.length === 0 ? (
              <EmptyState
                title="No movements in this range"
                description={
                  archived
                    ? 'This client has no recorded movements for the selected period.'
                    : 'Use the form to record an earning or expense.'
                }
              />
            ) : (
              <Table caption={`Movements for ${client.name}`}>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Description</Th>
                    <Th align="right">Amount</Th>
                    {!archived && (
                      <Th align="right">
                        <span className="sr-only">Actions</span>
                      </Th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {movements.items.map((movement) => (
                    <tr key={movement.id} className="hover:bg-surface-muted/50">
                      <Td className="whitespace-nowrap text-muted">{formatDate(movement.occurredOn)}</Td>
                      <Td>
                        <div className="max-w-xs truncate sm:max-w-sm" title={movement.description}>
                          {movement.description}
                        </div>
                        <div className="text-xs text-muted">
                          <Badge tone={movement.type === 'EARNING' ? 'positive' : 'negative'}>
                            {movement.type === 'EARNING' ? 'Earning' : 'Expense'}
                          </Badge>{' '}
                          by {movement.createdBy.name}
                        </div>
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Amount value={movement.signedAmount} signed />
                      </Td>
                      {!archived && (
                        <Td align="right" className="whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/clients/${clientId}/movements/${movement.id}/edit`}
                              className={buttonClass('ghost', 'sm')}
                              aria-label={`Edit movement “${movement.description}”`}
                            >
                              Edit
                            </Link>
                            <form action={deleteMovementAction.bind(null, clientId, movement.id)}>
                              <SubmitButton
                                variant="ghost"
                                size="sm"
                                className="text-negative hover:text-negative"
                                confirmMessage={`Delete “${movement.description}”? This removes it from all balances.`}
                                aria-label={`Delete movement “${movement.description}”`}
                              >
                                Delete
                              </SubmitButton>
                            </form>
                          </div>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={movements.page}
              totalPages={movements.totalPages}
              totalItems={movements.totalItems}
              pageSize={movements.pageSize}
              noun="movements"
              hrefFor={(target) => withQuery(basePath, { ...rangeParams, page: target === 1 ? undefined : target })}
            />
          </Card>

          {!archived && (
            <Card className="lg:sticky lg:top-20">
              <CardHeader title="Record movement" />
              <div className="p-5">
                <MovementForm action={createMovementAction.bind(null, clientId)} submitLabel="Add movement" today={today} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
