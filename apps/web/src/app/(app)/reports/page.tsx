import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Pagination, withQuery } from '@/components/ui/pagination';
import { Amount, Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { RangeFilter } from '@/features/reports/components/range-filter';
import { TotalsGrid } from '@/features/reports/components/totals-grid';
import { api, read } from '@/lib/api/client';
import { describeRange, firstParam, pageFromSearchParams, rangeFromSearchParams } from '@/lib/date-range';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Reports', description: 'Balances and movements across all clients.' };

const SORTS = { name: 'Client name', balance_desc: 'Highest balance', balance_asc: 'Lowest balance' } as const;
type Sort = keyof typeof SORTS;
const PAGE_SIZE = 25;

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const params = await searchParams;
  const range = rangeFromSearchParams(params);
  const page = pageFromSearchParams(params);
  const requestedSort = firstParam(params.sort) ?? 'name';
  const sort: Sort = Object.hasOwn(SORTS, requestedSort) ? (requestedSort as Sort) : 'name';
  const rangeQuery = { from: range.from, to: range.to };

  const report = await read(
    api.GET('/api/v1/reports/overview', { params: { query: { ...rangeQuery, sort, page, pageSize: PAGE_SIZE } } }),
  );

  const rangeParams =
    range.preset === 'custom' ? { from: range.from, to: range.to } : { range: range.preset === 'all' ? undefined : range.preset };
  const sortParam = sort === 'name' ? undefined : sort;
  const isAllTime = !range.from && !range.to;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${describeRange(range, formatDate)} · ${report.totals.clientCount} client${report.totals.clientCount === 1 ? '' : 's'}`}
        actions={
          <a
            href={withQuery('/exports/overview', { ...rangeQuery, sort: sortParam })}
            className={buttonClass('secondary')}
            download
          >
            Download CSV
          </a>
        }
      />
      <div className="space-y-6">
        <RangeFilter basePath="/reports" range={range} preserve={{ sort: sortParam }} />
        <TotalsGrid totals={report.totals} isAllTime={isAllTime} />

        <Card>
          <CardHeader
            title="By client"
            description={
              isAllTime ? 'All-time totals per client.' : 'Movements within the range; balance at the end of the range.'
            }
            actions={
              <form action="/reports" className="flex items-center gap-2">
                {Object.entries(rangeParams).map(([key, value]) =>
                  value ? <input key={key} type="hidden" name={key} value={value} /> : null,
                )}
                <label htmlFor="report-sort" className="text-sm text-muted">
                  Sort
                </label>
                <Select id="report-sort" name="sort" defaultValue={sort} className="h-8 w-44">
                  {(Object.keys(SORTS) as Sort[]).map((key) => (
                    <option key={key} value={key}>
                      {SORTS[key]}
                    </option>
                  ))}
                </Select>
                <button type="submit" className={buttonClass('secondary', 'sm')}>
                  Apply
                </button>
              </form>
            }
          />
          {report.clients.items.length === 0 ? (
            <EmptyState title="No clients yet" description="Reports appear once clients and movements exist." />
          ) : (
            <Table caption="Totals by client">
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th align="right" className="hidden md:table-cell">
                    Earnings
                  </Th>
                  <Th align="right" className="hidden md:table-cell">
                    Expenses
                  </Th>
                  <Th align="right" className="hidden sm:table-cell">
                    Net
                  </Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {report.clients.items.map((row) => (
                  <tr key={row.clientId} className="hover:bg-surface-muted/50">
                    <Td>
                      <Link href={withQuery(`/clients/${row.clientId}`, rangeParams)} className="font-medium hover:text-accent">
                        {row.name}
                      </Link>
                      {row.archivedAt && (
                        <span className="ml-2">
                          <Badge>Archived</Badge>
                        </span>
                      )}
                      <div className="text-xs text-muted">
                        {row.movementCount} movement{row.movementCount === 1 ? '' : 's'}
                      </div>
                    </Td>
                    <Td align="right" className="hidden md:table-cell">
                      <Amount value={row.totalEarnings} />
                    </Td>
                    <Td align="right" className="hidden md:table-cell">
                      <Amount value={row.totalExpenses} className="text-fg" />
                    </Td>
                    <Td align="right" className="hidden sm:table-cell">
                      <Amount value={row.net} signed />
                    </Td>
                    <Td align="right">
                      <Amount value={row.closingBalance} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination
            page={report.clients.page}
            totalPages={report.clients.totalPages}
            totalItems={report.clients.totalItems}
            pageSize={report.clients.pageSize}
            noun="clients"
            hrefFor={(target) =>
              withQuery('/reports', { ...rangeParams, sort: sortParam, page: target === 1 ? undefined : target })
            }
          />
        </Card>
      </div>
    </>
  );
}
