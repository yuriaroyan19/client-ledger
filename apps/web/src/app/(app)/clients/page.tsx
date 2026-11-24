import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Pagination, withQuery } from '@/components/ui/pagination';
import { Amount, Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { api, read } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { firstParam, pageFromSearchParams } from '@/lib/date-range';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Clients', description: 'Search and manage client records.' };

const STATUSES = { active: 'Active', archived: 'Archived', all: 'All' } as const;
const SORTS = { name: 'Name (A–Z)', newest: 'Newest first', oldest: 'Oldest first' } as const;
type Status = keyof typeof STATUSES;
type Sort = keyof typeof SORTS;

const PAGE_SIZE = 20;

export default async function ClientsPage({ searchParams }: PageProps<'/clients'>) {
  const params = await searchParams;
  const search = firstParam(params.search)?.trim().slice(0, 100) || undefined;
  const status: Status = (firstParam(params.status) as Status | undefined) ?? 'active';
  const sort: Sort = (firstParam(params.sort) as Sort | undefined) ?? 'name';
  const page = pageFromSearchParams(params);
  const safeStatus: Status = Object.hasOwn(STATUSES, status) ? status : 'active';
  const safeSort: Sort = Object.hasOwn(SORTS, sort) ? sort : 'name';

  const clients = await read(
    api.GET('/api/v1/clients', { params: { query: { search, status: safeStatus, sort: safeSort, page, pageSize: PAGE_SIZE } } }),
  );
  const query = {
    search,
    status: safeStatus === 'active' ? undefined : safeStatus,
    sort: safeSort === 'name' ? undefined : safeSort,
  };

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every client with their all-time balance."
        actions={
          <ButtonLink href="/clients/new" variant="primary">
            + New client
          </ButtonLink>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <nav aria-label="Filter by status" className="flex gap-1">
            {(Object.keys(STATUSES) as Status[]).map((key) => (
              <Link
                key={key}
                aria-current={key === safeStatus ? 'page' : undefined}
                href={withQuery('/clients', { ...query, status: key === 'active' ? undefined : key, page: undefined })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  key === safeStatus ? 'bg-surface-muted text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {STATUSES[key]}
              </Link>
            ))}
          </nav>
          {/* Plain GET form: works without JavaScript and keeps state in the URL (shareable, back-button friendly). */}
          <form role="search" className="flex flex-wrap items-center gap-2" action="/clients">
            {safeStatus !== 'active' && <input type="hidden" name="status" value={safeStatus} />}
            <label className="sr-only" htmlFor="client-search">
              Search clients
            </label>
            <Input
              id="client-search"
              name="search"
              type="search"
              placeholder="Name, email or phone"
              defaultValue={search}
              className="w-56"
              maxLength={100}
            />
            <label className="sr-only" htmlFor="client-sort">
              Sort by
            </label>
            <Select id="client-sort" name="sort" defaultValue={safeSort} className="w-40">
              {(Object.keys(SORTS) as Sort[]).map((key) => (
                <option key={key} value={key}>
                  {SORTS[key]}
                </option>
              ))}
            </Select>
            <button type="submit" className={buttonClass('secondary')}>
              Apply
            </button>
          </form>
        </div>

        {clients.items.length === 0 ? (
          <EmptyState
            title={search ? `No clients match “${search}”` : safeStatus === 'archived' ? 'No archived clients' : 'No clients yet'}
            description={
              search ? 'Try a different name, email or phone number.' : 'Create your first client to start recording movements.'
            }
            action={
              search ? (
                <ButtonLink href="/clients">Clear search</ButtonLink>
              ) : (
                <ButtonLink href="/clients/new" variant="primary">
                  + New client
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table caption="Clients">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Contact</Th>
                <Th className="hidden sm:table-cell">Created</Th>
                <Th align="right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {clients.items.map((client) => (
                <tr key={client.id} className="group hover:bg-surface-muted/50">
                  <Td>
                    <Link href={`/clients/${client.id}`} className="font-medium text-fg group-hover:text-accent">
                      {client.name}
                    </Link>
                    {client.archivedAt && (
                      <span className="ml-2">
                        <Badge>Archived</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="hidden text-muted md:table-cell">{client.email ?? client.phone ?? '—'}</Td>
                  <Td className="hidden text-muted sm:table-cell">{formatDate(client.createdAt.slice(0, 10))}</Td>
                  <Td align="right">
                    <Amount value={client.balance} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={clients.page}
          totalPages={clients.totalPages}
          totalItems={clients.totalItems}
          pageSize={clients.pageSize}
          noun="clients"
          hrefFor={(target) => withQuery('/clients', { ...query, page: target === 1 ? undefined : target })}
        />
      </Card>
    </>
  );
}
