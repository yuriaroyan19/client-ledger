import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  auditLog,
  admin,
  client,
  CLIENT_ID,
  clientReport,
  movement,
  MOVEMENT_ID,
  overviewRow,
  page,
  totals,
} from '../../test/fixtures';
import { apiRequests, cookieJar, NotFoundSignal, onApi, RedirectSignal } from '../../test/next-fakes';
import { SESSION_COOKIE } from '@/lib/auth/session-cookie';
import ActivityPage from './(app)/activity/page';
import EditMovementPage from './(app)/clients/[clientId]/movements/[movementId]/edit/page';
import EditClientPage, { generateMetadata as editClientMetadata } from './(app)/clients/[clientId]/edit/page';
import ClientPage, { generateMetadata as clientMetadata } from './(app)/clients/[clientId]/page';
import NewClientPage from './(app)/clients/new/page';
import ClientsPage from './(app)/clients/page';
import AppLayout from './(app)/layout';
import Loading from './(app)/loading';
import ReportsPage from './(app)/reports/page';
import LoginPage from './(auth)/login/page';
import RootLayout, { metadata as rootMetadata, viewport } from './layout';
import NotFound from './not-found';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  connection: vi.fn(async () => undefined),
}));

type Search = Record<string, string | string[]>;
const props = <P extends Record<string, string>>(params: P, searchParams: Search = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) }) as never;
const searchProps = (searchParams: Search = {}) => ({ searchParams: Promise.resolve(searchParams) }) as never;
const show = async (element: Promise<ReactElement> | ReactElement) => render(await element);
const queryOf = (index = 0) => Object.fromEntries(new URL(apiRequests[index]?.url ?? 'http://x').searchParams);

function stubClientPage(
  overrides: { client?: Parameters<typeof client>[0]; movements?: ReturnType<typeof movement>[]; pageInfo?: object } = {},
) {
  onApi('GET', `/api/v1/clients/${CLIENT_ID}`, client(overrides.client));
  onApi('GET', `/api/v1/clients/${CLIENT_ID}/report`, clientReport());
  onApi(
    'GET',
    `/api/v1/clients/${CLIENT_ID}/movements`,
    page(overrides.movements ?? [movement()], { pageSize: 25, ...overrides.pageInfo }),
  );
}

describe('root layout and static pages', () => {
  it('renders a skip link, English document and private metadata', async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <p>child</p> }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('href="#main"');
    expect(html).toContain('<p>child</p>');
    expect(rootMetadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
    expect(rootMetadata.title).toEqual({ default: 'Client Ledger', template: '%s · Client Ledger' });
    expect(viewport.colorScheme).toBe('light dark');
  });

  it('renders not-found and loading states accessibly', () => {
    render(
      <>
        <NotFound />
        <Loading />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'We couldn’t find that page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to clients' })).toHaveAttribute('href', '/clients');
    expect(screen.getByText('Loading…').parentElement).toHaveAttribute('aria-busy', 'true');
  });
});

describe('login page', () => {
  it('renders the form with a notice and a safe next path', async () => {
    await show(LoginPage(searchProps({ reason: 'expired', next: '/reports' })));
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired.');
    expect(document.querySelector('input[name="next"]')).toHaveValue('/reports');
    expect(apiRequests).toHaveLength(0);
  });

  it('renders plainly without any parameters', async () => {
    await show(LoginPage(searchProps()));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('drops unsafe or default next paths and unknown notices', async () => {
    await show(LoginPage(searchProps({ reason: 'hacked', next: 'https://evil.test' })));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="next"]')).toBeNull();
  });

  it('sends signed-in users on to their destination', async () => {
    cookieJar.set(SESSION_COOKIE, { value: 'cls_x' });
    onApi('GET', '/api/v1/auth/me', admin);
    await expect(LoginPage(searchProps({ next: '/activity' }))).rejects.toMatchObject({ url: '/activity' });
    await expect(LoginPage(searchProps())).rejects.toMatchObject({ url: '/clients' });
  });
});

describe('authenticated layout', () => {
  it('shows the admin, navigation and sign-out forms', async () => {
    onApi('GET', '/api/v1/auth/me', admin);
    await show(AppLayout({ children: <p>content</p> }));
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveTextContent('ClientsReportsActivity');
    expect(screen.getByText('J')).toBeInTheDocument();
    expect(screen.getByText('jane@example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out on all devices' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });

  it('sends users with an expired session to /logout', async () => {
    onApi('GET', '/api/v1/auth/me', { status: 401 }, 401);
    await expect(AppLayout({ children: null })).rejects.toBeInstanceOf(RedirectSignal);
  });
});

describe('clients list', () => {
  it('lists clients with balances, contact fallbacks and archived badges', async () => {
    onApi(
      'GET',
      '/api/v1/clients',
      page([
        client(),
        client({ id: 'c2', name: 'Phone Only', email: null }),
        client({ id: 'c3', name: 'Nobody', email: null, phone: null, archivedAt: '2026-02-01T00:00:00.000Z', balance: '-5.00' }),
      ]),
    );
    await show(ClientsPage(searchProps()));
    expect(queryOf()).toEqual({ status: 'active', sort: 'name', page: '1', pageSize: '20' });
    const rows = within(screen.getByRole('table', { name: 'Clients' })).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('Acme Corpbilling@acme.testJan 15, 2026$1,250.50');
    expect(rows[2]).toHaveTextContent('+1 555 0100');
    expect(rows[3]).toHaveTextContent('NobodyArchived—');
    expect(screen.getByRole('link', { name: 'Active' })).toHaveAttribute('aria-current', 'page');
  });

  it('sanitises filters from the URL and keeps them in links', async () => {
    onApi('GET', '/api/v1/clients', page([client()], { page: 2, totalItems: 45, totalPages: 3 }));
    await show(ClientsPage(searchProps({ search: `  ${'a'.repeat(150)} `, status: 'archived', sort: 'newest', page: '2' })));
    expect(queryOf()).toMatchObject({ search: 'a'.repeat(100), status: 'archived', sort: 'newest', page: '2' });
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      `/clients?search=${'a'.repeat(100)}&status=archived&sort=newest`,
    );
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute(
      'href',
      `/clients?search=${'a'.repeat(100)}&status=archived&sort=newest&page=3`,
    );
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      `/clients?search=${'a'.repeat(100)}&status=all&sort=newest`,
    );
    expect(document.querySelector('input[name="status"]')).toHaveValue('archived');
  });

  it('ignores unknown status and sort values', async () => {
    onApi('GET', '/api/v1/clients', page([]));
    await show(ClientsPage(searchProps({ status: 'deleted', sort: 'password' })));
    expect(queryOf()).toMatchObject({ status: 'active', sort: 'name' });
    expect(screen.getByText('No clients yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '+ New client' })).toHaveLength(2);
  });

  it.each([
    [{ search: 'zzz' }, 'No clients match “zzz”', 'Clear search'],
    [{ status: 'archived' }, 'No archived clients', '+ New client'],
  ])('explains empty results for %j', async (search, title, action) => {
    onApi('GET', '/api/v1/clients', page([]));
    await show(ClientsPage(searchProps(search)));
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: action }).length).toBeGreaterThan(0);
  });
});

describe('client detail', () => {
  it('shows ledger, totals, actions and the entry form for an active client', async () => {
    stubClientPage({
      client: { notes: 'Pays late' },
      movements: [movement(), movement({ id: 'm2', type: 'EXPENSE', signedAmount: '-40.00', description: 'Hosting' })],
    });
    await show(ClientPage(props({ clientId: CLIENT_ID }, { created: '1' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Acme Corp');
    expect(screen.getByText('billing@acme.test · +1 555 0100')).toBeInTheDocument();
    expect(screen.getByText('Client created. Record their first movement below.')).toBeInTheDocument();
    expect(screen.getByText('Pays late')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', `/exports/clients/${CLIENT_ID}`);
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit movement “Hosting”' })).toHaveAttribute(
      'href',
      `/clients/${CLIENT_ID}/movements/m2/edit`,
    );
    expect(screen.getByRole('button', { name: 'Delete movement “Consulting”' })).toBeInTheDocument();
    expect(screen.getByText('-$40.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add movement' })).toBeInTheDocument();
    expect(screen.getByText('All time', { selector: 'p' })).toBeInTheDocument();
  });

  it('is read-only when archived and passes the range to every request', async () => {
    stubClientPage({ client: { archivedAt: '2026-02-01T00:00:00.000Z', email: null, phone: null }, movements: [movement()] });
    await show(ClientPage(props({ clientId: CLIENT_ID }, { from: '2026-01-01', to: '2026-01-31', updated: '1' })));
    expect(screen.getByText('No contact details')).toBeInTheDocument();
    expect(screen.getByText('Client details saved.')).toBeInTheDocument();
    expect(screen.getByText(/This client is archived/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add movement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete movement/ })).not.toBeInTheDocument();
    const reportQuery = apiRequests.find((request) => request.url.includes('/report'))?.url;
    expect(reportQuery).toContain('from=2026-01-01&to=2026-01-31');
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      `/exports/clients/${CLIENT_ID}?from=2026-01-01&to=2026-01-31`,
    );
  });

  it.each([
    [{ archivedAt: null }, 'Use the form to record an earning or expense.'],
    [{ archivedAt: '2026-02-01T00:00:00.000Z' }, 'This client has no recorded movements for the selected period.'],
  ])('explains an empty ledger (%j)', async (overrides, text) => {
    stubClientPage({ client: overrides, movements: [], pageInfo: { totalItems: 0 } });
    await show(ClientPage(props({ clientId: CLIENT_ID }, { movement: 'updated', range: 'this-year' })));
    expect(screen.getByText('No movements in this range')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText('Movement updated.')).toBeInTheDocument();
  });

  it('keeps the range in pagination links', async () => {
    stubClientPage({ pageInfo: { page: 2, totalItems: 60, totalPages: 3 } });
    await show(ClientPage(props({ clientId: CLIENT_ID }, { range: 'last-month', page: '2' })));
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', `/clients/${CLIENT_ID}?range=last-month`);
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', `/clients/${CLIENT_ID}?range=last-month&page=3`);
    stubClientPage({ pageInfo: { page: 2, totalItems: 60, totalPages: 3 } });
    await show(ClientPage(props({ clientId: CLIENT_ID }, { from: '2026-01-01', page: '2' })));
    expect(screen.getAllByRole('link', { name: /Next/ }).at(-1)).toHaveAttribute(
      'href',
      `/clients/${CLIENT_ID}?from=2026-01-01&page=3`,
    );
  });

  it('rejects malformed ids before calling the API', async () => {
    await expect(ClientPage(props({ clientId: '../admin' }))).rejects.toBeInstanceOf(NotFoundSignal);
    expect(await clientMetadata(props({ clientId: 'nope' }))).toEqual({ title: 'Client not found' });
    expect(apiRequests).toHaveLength(0);
  });

  it('titles the page after the client', async () => {
    onApi('GET', `/api/v1/clients/${CLIENT_ID}`, client());
    expect(await clientMetadata(props({ clientId: CLIENT_ID }))).toEqual({
      title: 'Acme Corp',
      description: 'Balance and movements for Acme Corp.',
    });
    expect(await editClientMetadata(props({ clientId: CLIENT_ID }))).toEqual({ title: 'Edit Acme Corp' });
    expect(await editClientMetadata(props({ clientId: 'nope' }))).toEqual({ title: 'Client not found' });
  });
});

describe('client and movement forms pages', () => {
  it('new client page', () => {
    render(<NewClientPage />);
    expect(screen.getByRole('button', { name: 'Create client' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/clients');
  });

  it('edit client page prefills the form', async () => {
    onApi('GET', `/api/v1/clients/${CLIENT_ID}`, client({ notes: 'Note' }));
    await show(EditClientPage(props({ clientId: CLIENT_ID })));
    expect(screen.getByLabelText('Name')).toHaveValue('Acme Corp');
    expect(screen.getByLabelText('Notes')).toHaveValue('Note');
    expect(screen.getByRole('link', { name: '← Acme Corp' })).toHaveAttribute('href', `/clients/${CLIENT_ID}`);
    await expect(EditClientPage(props({ clientId: 'bad' }))).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it('edit movement page prefills the form, or explains why it cannot', async () => {
    onApi('GET', `/api/v1/clients/${CLIENT_ID}`, client());
    onApi('GET', `/api/v1/clients/${CLIENT_ID}/movements/${MOVEMENT_ID}`, movement({ type: 'EXPENSE', amount: '40.00' }));
    await show(EditMovementPage(props({ clientId: CLIENT_ID, movementId: MOVEMENT_ID })));
    expect(screen.getByLabelText('Amount (USD)')).toHaveValue('40.00');
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();

    onApi('GET', `/api/v1/clients/${CLIENT_ID}`, client({ archivedAt: '2026-02-01T00:00:00.000Z' }));
    await show(EditMovementPage(props({ clientId: CLIENT_ID, movementId: MOVEMENT_ID })));
    expect(screen.getByText('This client is archived, so its movements cannot be changed.')).toBeInTheDocument();

    await expect(EditMovementPage(props({ clientId: CLIENT_ID, movementId: 'x' }))).rejects.toBeInstanceOf(NotFoundSignal);
    await expect(EditMovementPage(props({ clientId: 'x', movementId: MOVEMENT_ID }))).rejects.toBeInstanceOf(NotFoundSignal);
  });
});

describe('reports page', () => {
  const overview = (rows = [overviewRow()], clientCount = rows.length, pageInfo = {}) => ({
    range: { from: null, to: null },
    totals: { ...totals, clientCount },
    clients: page(rows, { pageSize: 25, ...pageInfo }),
  });

  it('shows all-time totals and per-client rows', async () => {
    onApi(
      'GET',
      '/api/v1/reports/overview',
      overview([
        overviewRow(),
        overviewRow({ clientId: 'c2', name: 'Old Co', archivedAt: '2026-01-01T00:00:00.000Z', movementCount: 2, net: '-3.00' }),
      ]),
    );
    await show(ReportsPage(searchProps()));
    expect(queryOf()).toEqual({ sort: 'name', page: '1', pageSize: '25' });
    expect(screen.getByText('All time · 2 clients')).toBeInTheDocument();
    expect(screen.getByText('All-time totals per client.')).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: 'Totals by client' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Acme Corp1 movement');
    expect(rows[2]).toHaveTextContent('Old CoArchived2 movements');
    expect(rows[2]).toHaveTextContent('-$3.00');
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', '/exports/overview');
  });

  it('applies a custom range and sort everywhere', async () => {
    onApi('GET', '/api/v1/reports/overview', overview([overviewRow()], 1, { page: 2, totalItems: 60, totalPages: 3 }));
    await show(ReportsPage(searchProps({ from: '2026-01-01', to: '2026-03-31', sort: 'balance_desc', page: '2' })));
    expect(queryOf()).toEqual({ from: '2026-01-01', to: '2026-03-31', sort: 'balance_desc', page: '2', pageSize: '25' });
    expect(screen.getByText('Jan 1, 2026 – Mar 31, 2026 · 1 client')).toBeInTheDocument();
    expect(screen.getByText('Movements within the range; balance at the end of the range.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/exports/overview?from=2026-01-01&to=2026-03-31&sort=balance_desc',
    );
    expect(screen.getByRole('link', { name: 'Acme Corp' })).toHaveAttribute(
      'href',
      `/clients/${CLIENT_ID}?from=2026-01-01&to=2026-03-31`,
    );
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      '/reports?from=2026-01-01&to=2026-03-31&sort=balance_desc',
    );
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute(
      'href',
      '/reports?from=2026-01-01&to=2026-03-31&sort=balance_desc&page=3',
    );
    const hidden = [...document.querySelectorAll('form[action="/reports"] input[type="hidden"]')].map((input) =>
      input.getAttribute('name'),
    );
    // The range form keeps the sort; the sort form keeps the range.
    expect(hidden).toEqual(['sort', 'from', 'to']);
  });

  it('uses presets, ignores unknown sorts and handles no clients', async () => {
    onApi('GET', '/api/v1/reports/overview', overview([], 0));
    await show(ReportsPage(searchProps({ range: 'this-year', sort: '1;DROP' })));
    expect(queryOf()).toMatchObject({ sort: 'name' });
    expect(queryOf().from).toMatch(/^\d{4}-01-01$/);
    expect(screen.getByText('No clients yet')).toBeInTheDocument();
    expect(screen.getByText(/· 0 clients$/)).toBeInTheDocument();
  });
});

describe('activity page', () => {
  it('labels events, links to clients and shows unknown values safely', async () => {
    onApi(
      'GET',
      '/api/v1/audit-logs',
      page([
        auditLog(),
        auditLog({
          id: 'a2',
          action: 'movement.created',
          entityType: 'movement',
          entityId: MOVEMENT_ID,
          metadata: { clientId: 'c-from-meta' },
        }),
        auditLog({ id: 'a3', action: 'movement.deleted', entityType: 'movement', metadata: { clientId: 'c-deleted' } }),
        auditLog({
          id: 'a4',
          action: 'auth.login.failed',
          entityType: 'admin',
          entityId: null,
          admin: null,
          ipAddress: null,
          metadata: { clientId: 42 },
        }),
        auditLog({ id: 'a5', action: 'something.new', entityType: 'client', entityId: null }),
        auditLog({ id: 'a6', action: 'auth.logout', entityType: 'admin', metadata: null }),
      ]),
    );
    await show(ActivityPage(searchProps({ page: '1' })));
    expect(queryOf()).toEqual({ page: '1', pageSize: '50' });
    const rows = within(screen.getByRole('table', { name: 'Activity log' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Client createdView client');
    expect(within(rows[1] as HTMLElement).getByRole('link')).toHaveAttribute('href', `/clients/${CLIENT_ID}`);
    expect(within(rows[2] as HTMLElement).getByRole('link')).toHaveAttribute('href', '/clients/c-from-meta');
    expect(rows[3]).not.toHaveTextContent('View client');
    expect(rows[4]).toHaveTextContent('Failed sign-inUnknown—');
    expect(rows[5]).toHaveTextContent('something.new');
    expect(rows[6]).toHaveTextContent('Signed out');
  });

  it('paginates', async () => {
    onApi('GET', '/api/v1/audit-logs', page([auditLog()], { page: 2, pageSize: 50, totalItems: 150, totalPages: 3 }));
    await show(ActivityPage(searchProps({ page: '2' })));
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/activity');
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/activity?page=3');
  });

  it('shows an empty state', async () => {
    onApi('GET', '/api/v1/audit-logs', page([]));
    await show(ActivityPage(searchProps()));
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
