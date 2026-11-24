/** API response fixtures shaped like apps/api/openapi.json (typed against the generated schema). */
import type { Schemas } from '@/lib/api/client';

export const CLIENT_ID = '0195f7c2-1111-7000-8000-000000000001';
export const MOVEMENT_ID = '0195f7c2-2222-7000-8000-000000000002';

export function page<T>(
  items: T[],
  overrides: Partial<{ page: number; pageSize: number; totalItems: number; totalPages: number }> = {},
) {
  return { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0, ...overrides };
}

export const admin: Schemas['Admin'] = { id: 'admin-1', email: 'jane@example.test', name: 'jane Doe' };

export function client(overrides: Partial<Schemas['Client']> = {}): Schemas['Client'] {
  return {
    id: CLIENT_ID,
    name: 'Acme Corp',
    email: 'billing@acme.test',
    phone: '+1 555 0100',
    notes: null,
    archivedAt: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    balance: '1250.50',
    ...overrides,
  };
}

export function movement(overrides: Partial<Schemas['Movement']> = {}): Schemas['Movement'] {
  return {
    id: MOVEMENT_ID,
    clientId: CLIENT_ID,
    type: 'EARNING',
    amount: '100.00',
    signedAmount: '100.00',
    occurredOn: '2026-11-02',
    description: 'Consulting',
    createdBy: { id: 'admin-1', name: 'Jane' },
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    ...overrides,
  };
}

export const totals: Schemas['ReportTotals'] = {
  openingBalance: '0.00',
  totalEarnings: '100.00',
  totalExpenses: '0.00',
  net: '100.00',
  closingBalance: '100.00',
  movementCount: 1,
};

export function clientReport(overrides: Partial<Schemas['ClientReport']> = {}): Schemas['ClientReport'] {
  return {
    client: { id: CLIENT_ID, name: 'Acme Corp', archivedAt: null },
    range: { from: null, to: null },
    totals,
    ...overrides,
  };
}

export function overviewRow(overrides: Partial<Schemas['OverviewRow']> = {}): Schemas['OverviewRow'] {
  return {
    clientId: CLIENT_ID,
    name: 'Acme Corp',
    archivedAt: null,
    totalEarnings: '100.00',
    totalExpenses: '0.00',
    net: '100.00',
    closingBalance: '100.00',
    movementCount: 1,
    ...overrides,
  };
}

export function auditLog(overrides: Partial<Schemas['AuditLog']> = {}): Schemas['AuditLog'] {
  return {
    id: '0195f7c2-3333-7000-8000-000000000003',
    action: 'client.created',
    entityType: 'client',
    entityId: CLIENT_ID,
    metadata: null,
    ipAddress: '203.0.113.9',
    requestId: 'req-1',
    createdAt: '2026-11-24T10:00:00.000Z',
    admin: { id: 'admin-1', name: 'Jane' },
    ...overrides,
  };
}
