import type { Response } from 'express';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { exportClientStatement } from '../src/modules/reports/reports.export.js';
import { reportsService } from '../src/modules/reports/reports.service.js';
import { addMovement, api, createClient, setupAuthenticated } from './helpers.js';

afterAll(() => prisma.$disconnect());

let auth: { Authorization: string };
beforeEach(async () => {
  ({ auth } = await setupAuthenticated());
});

const csvLines = (text: string) => text.replace(String.fromCharCode(0xfeff), '').trim().split('\r\n');

/**
 * Fixture with literal expectations:
 *  Alpha (active):   +100.00 (Jan 10), −30.00 (Feb 05), +999.99 (Feb 06, DELETED), +20.00 (Mar 01)
 *  Beta  (archived): +5.00 (Jan 20), −80.00 (Feb 10)
 *  Gamma (active):   no movements
 */
async function seedOverview() {
  const alpha = await createClient(auth, { name: 'Alpha', email: 'alpha@test.local' });
  const beta = await createClient(auth, { name: 'Beta' });
  const gamma = await createClient(auth, { name: 'Gamma' });
  await addMovement(auth, alpha.id, { type: 'EARNING', amount: '100.00', occurredOn: '2026-01-10' });
  await addMovement(auth, alpha.id, { type: 'EXPENSE', amount: '30.00', occurredOn: '2026-02-05' });
  const deleted = await addMovement(auth, alpha.id, { type: 'EARNING', amount: '999.99', occurredOn: '2026-02-06' });
  await api().delete(`/api/v1/clients/${alpha.id}/movements/${deleted.id}`).set(auth).expect(204);
  await addMovement(auth, alpha.id, { type: 'EARNING', amount: '20.00', occurredOn: '2026-03-01' });
  await addMovement(auth, beta.id, { type: 'EARNING', amount: '5.00', occurredOn: '2026-01-20' });
  await addMovement(auth, beta.id, { type: 'EXPENSE', amount: '80.00', occurredOn: '2026-02-10' });
  await api().post(`/api/v1/clients/${beta.id}/archive`).set(auth).expect(200);
  return { alpha, beta, gamma, deletedId: deleted.id };
}

describe('overview report', () => {
  it('computes literal per-client rows and totals, excluding soft-deleted movements and including archived clients', async () => {
    await seedOverview();
    const res = await api().get('/api/v1/reports/overview').set(auth).expect(200);
    expect(res.body.range).toEqual({ from: null, to: null });
    expect(res.body.totals).toEqual({
      openingBalance: '0.00',
      totalEarnings: '125.00',
      totalExpenses: '110.00',
      net: '15.00',
      closingBalance: '15.00',
      movementCount: 5,
      clientCount: 3,
    });
    expect(
      res.body.clients.items.map((row: Record<string, unknown>) => [row.name, row.net, row.closingBalance, row.movementCount]),
    ).toEqual([
      ['Alpha', '90.00', '90.00', 3],
      ['Beta', '-75.00', '-75.00', 2],
      ['Gamma', '0.00', '0.00', 0],
    ]);
    expect(res.body.clients.items[1].archivedAt).toEqual(expect.any(String));
  });

  it('applies the range to period totals while closing balances run up to the range end', async () => {
    await seedOverview();
    const res = await api().get('/api/v1/reports/overview?from=2026-02-01&to=2026-02-28').set(auth).expect(200);
    expect(res.body.totals).toMatchObject({
      openingBalance: '105.00',
      totalEarnings: '0.00',
      totalExpenses: '110.00',
      net: '-110.00',
      closingBalance: '-5.00',
      movementCount: 2,
    });
    const alpha = res.body.clients.items.find((row: { name: string }) => row.name === 'Alpha');
    expect(alpha).toMatchObject({
      totalEarnings: '0.00',
      totalExpenses: '30.00',
      net: '-30.00',
      closingBalance: '70.00',
      movementCount: 1,
    });
  });

  it.each([
    ['name', ['Alpha', 'Beta', 'Gamma']],
    ['balance_desc', ['Alpha', 'Gamma', 'Beta']],
    ['balance_asc', ['Beta', 'Gamma', 'Alpha']],
  ])('sorts by %s', async (sort, expected) => {
    await seedOverview();
    const res = await api().get(`/api/v1/reports/overview?sort=${sort}`).set(auth).expect(200);
    expect(res.body.clients.items.map((row: { name: string }) => row.name)).toEqual(expected);
  });

  it('rejects sort values outside the whitelist', async () => {
    await api().get('/api/v1/reports/overview?sort=name;DROP TABLE clients').set(auth).expect(422);
  });

  it('searches names and emails literally and paginates', async () => {
    await seedOverview();
    await createClient(auth, { name: 'Under_score' });
    const byEmail = await api().get('/api/v1/reports/overview?search=ALPHA@').set(auth).expect(200);
    expect(byEmail.body.clients.items.map((row: { name: string }) => row.name)).toEqual(['Alpha']);
    const underscore = await api().get('/api/v1/reports/overview?search=_').set(auth).expect(200);
    expect(underscore.body.clients.items.map((row: { name: string }) => row.name)).toEqual(['Under_score']);
    const page2 = await api().get('/api/v1/reports/overview?pageSize=2&page=2').set(auth).expect(200);
    expect(page2.body.clients).toMatchObject({ page: 2, pageSize: 2, totalItems: 4, totalPages: 2 });
    expect(page2.body.clients.items.map((row: { name: string }) => row.name)).toEqual(['Gamma', 'Under_score']);
  });

  it('iterates every row in batches for export', async () => {
    await seedOverview();
    const batches: string[][] = [];
    for await (const rows of reportsService.overviewRowsBatched({ sort: 'name' }, 2)) batches.push(rows.map((row) => row.name));
    expect(batches).toEqual([['Alpha', 'Beta'], ['Gamma']]);

    const none: unknown[] = [];
    for await (const rows of reportsService.overviewRowsBatched({ sort: 'name', search: 'nobody' }, 2)) none.push(rows);
    expect(none).toEqual([]);
  });

  it('exports the overview as CSV', async () => {
    await seedOverview();
    const res = await api().get('/api/v1/reports/overview/export?from=2026-01-01').set(auth).expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="clients-overview-2026-01-01_to_today.csv"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(csvLines(res.text)).toEqual([
      'Client,Status,Earnings,Expenses,Net,Closing balance,Movements',
      'Alpha,Active,120.00,30.00,90.00,90.00,3',
      'Beta,Archived,5.00,80.00,-75.00,-75.00,2',
      'Gamma,Active,0.00,0.00,0.00,0.00,0',
    ]);
  });
});

describe('client statement export', () => {
  it('names the file after the client safely and labels all-time exports', async () => {
    const client = await createClient(auth, { name: 'Evil"\r\nSet-Cookie: x=1/../' });
    const res = await api().get(`/api/v1/clients/${client.id}/report/export`).set(auth).expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"\r\n/\\]+-statement-all-time\.csv"$/);
    expect(csvLines(res.text)).toEqual([
      'Date,Type,Description,Amount,Signed amount,Running balance',
      ',OPENING BALANCE,,,,0.00',
      ',CLOSING BALANCE,,,,0.00',
    ]);
  });

  it('streams across several batches with a correct running balance', async () => {
    const client = await createClient(auth, { name: 'Batchy' });
    await addMovement(auth, client.id, { type: 'EARNING', amount: '10.00', occurredOn: '2025-12-31' });
    for (const [day, type] of [
      ['01', 'EARNING'],
      ['02', 'EXPENSE'],
      ['03', 'EARNING'],
      ['04', 'EARNING'],
      ['05', 'EXPENSE'],
    ] as const) {
      await addMovement(auth, client.id, { type, amount: '1.25', occurredOn: `2026-01-${day}`, description: `m${day}` });
    }
    const chunks: string[] = [];
    const res = {
      status: () => res,
      setHeader: () => res,
      write: (chunk: string) => chunks.push(chunk),
      end: () => undefined,
    } as unknown as Response;

    await exportClientStatement(client.id, { from: '2026-01-01', to: '2026-01-31' }, res, 2);
    const lines = csvLines(chunks.join(''));
    expect(lines[1]).toBe('2026-01-01,OPENING BALANCE,,,,10.00');
    expect(lines.slice(2, 7).map((line) => line.split(',').at(-1))).toEqual(['11.25', '10.00', '11.25', '12.50', '11.25']);
    expect(lines[7]).toBe('2026-01-31,CLOSING BALANCE,,,,11.25');
  });

  it('returns 404 for unknown clients before writing anything', async () => {
    const res = await api().get('/api/v1/clients/0195f7c2-0000-7000-8000-000000000000/report/export').set(auth).expect(404);
    expect(res.headers['content-type']).toMatch(/problem\+json/);
  });
});

describe('movement edge cases', () => {
  it('validates PATCH bodies like POST and rejects mass assignment', async () => {
    const client = await createClient(auth);
    const movement = await addMovement(auth, client.id, { type: 'EARNING', amount: '10.00', occurredOn: '2026-01-01' });
    const url = `/api/v1/clients/${client.id}/movements/${movement.id}`;
    for (const body of [
      { amount: 10 },
      { amount: '0' },
      { amount: '1.001' },
      { occurredOn: '2026-02-30' },
      { clientId: client.id },
      { deletedAt: null },
    ]) {
      await api().patch(url).set(auth).send(body).expect(422);
    }
    const unchanged = await api().get(url).set(auth).expect(200);
    expect(unchanged.body).toMatchObject({ amount: '10.00', occurredOn: '2026-01-01' });
  });

  it('treats deleted movements as gone and freezes archived ledgers', async () => {
    const client = await createClient(auth);
    const movement = await addMovement(auth, client.id, { type: 'EARNING', amount: '10.00', occurredOn: '2026-01-01' });
    const url = `/api/v1/clients/${client.id}/movements/${movement.id}`;
    const kept = await addMovement(auth, client.id, { type: 'EXPENSE', amount: '1.00', occurredOn: '2026-01-02' });
    await api().delete(url).set(auth).expect(204);
    await api().get(url).set(auth).expect(404);
    await api().patch(url).set(auth).send({ amount: '5.00' }).expect(404);
    await api().delete(url).set(auth).expect(404);

    const list = await api().get(`/api/v1/clients/${client.id}/movements`).set(auth).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([kept.id]);

    await api().post(`/api/v1/clients/${client.id}/archive`).set(auth).expect(200);
    const keptUrl = `/api/v1/clients/${client.id}/movements/${kept.id}`;
    await api().patch(keptUrl).set(auth).send({ amount: '5.00' }).expect(409);
    await api().delete(keptUrl).set(auth).expect(409);
    await api()
      .post(`/api/v1/clients/${client.id}/movements`)
      .set(auth)
      .send({ type: 'EARNING', amount: '1.00', occurredOn: '2026-01-03', description: 'late' })
      .expect(409);
    // Reports of archived clients remain readable.
    const report = await api().get(`/api/v1/clients/${client.id}/report`).set(auth).expect(200);
    expect(report.body.totals).toMatchObject({ closingBalance: '-1.00', movementCount: 1 });
  });
});

describe('audit log', () => {
  it('lists newest first with actor, filters by entity and paginates', async () => {
    const client = await createClient(auth, { name: 'Audited' });
    await api().patch(`/api/v1/clients/${client.id}`).set(auth).send({ name: 'Audited 2' }).expect(200);
    await addMovement(auth, client.id, { type: 'EARNING', amount: '1.00', occurredOn: '2026-01-01' });

    const all = await api().get('/api/v1/audit-logs').set(auth).expect(200);
    expect(all.body.items.map((item: { action: string }) => item.action)).toEqual(
      expect.arrayContaining(['auth.login.succeeded', 'client.created', 'client.updated', 'movement.created']),
    );
    expect(all.body.items[0].admin).toEqual({ id: expect.any(String), name: 'Test Admin' });

    const forClient = await api().get(`/api/v1/audit-logs?entityType=client&entityId=${client.id}`).set(auth).expect(200);
    expect(forClient.body.items.map((item: { action: string }) => item.action).sort()).toEqual([
      'client.created',
      'client.updated',
    ]);
    expect(forClient.body.items.find((item: { action: string }) => item.action === 'client.updated').metadata).toEqual({
      fields: ['name'],
    });

    const admins = await api().get('/api/v1/audit-logs?entityType=admin').set(auth).expect(200);
    expect(admins.body.items.every((item: { entityType: string }) => item.entityType === 'admin')).toBe(true);

    const paged = await api().get('/api/v1/audit-logs?pageSize=1&page=2').set(auth).expect(200);
    expect(paged.body).toMatchObject({ page: 2, pageSize: 1, totalItems: all.body.totalItems });
    await api().get('/api/v1/audit-logs?entityType=session').set(auth).expect(422);
    await api().get('/api/v1/audit-logs?entityId=not-a-uuid').set(auth).expect(422);
  });

  it('never stores passwords in failed-login metadata', async () => {
    await api().post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'wrong-password-123' }).expect(401);
    const rows = await prisma.auditLog.findMany({ where: { action: 'auth.login.failed' } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('wrong-password-123');
    expect(rows[0]).toMatchObject({ metadata: { email: 'admin@test.local' }, ipAddress: expect.any(String) });
  });
});
