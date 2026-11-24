import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Decimal } from '../src/lib/money.js';
import { prisma } from '../src/lib/prisma.js';
import { addMovement, api, createClient, setupAuthenticated } from './helpers.js';

afterAll(() => prisma.$disconnect());

let auth: { Authorization: string };
let clientId: string;

beforeEach(async () => {
  ({ auth } = await setupAuthenticated());
  clientId = (await createClient(auth, { name: 'Ledger Co' })).id;
});

async function seedLedger() {
  await addMovement(auth, clientId, { type: 'EARNING', amount: '1000.00', occurredOn: '2026-01-15' });
  await addMovement(auth, clientId, { type: 'EXPENSE', amount: '200.10', occurredOn: '2026-01-31' });
  await addMovement(auth, clientId, { type: 'EARNING', amount: '0.10', occurredOn: '2026-02-01' });
  await addMovement(auth, clientId, { type: 'EXPENSE', amount: '0.20', occurredOn: '2026-02-28' });
  await addMovement(auth, clientId, { type: 'EARNING', amount: '50.00', occurredOn: '2026-03-01' });
}

describe('movements', () => {
  it('rejects float amounts, zero, negative and impossible dates', async () => {
    const url = `/api/v1/clients/${clientId}/movements`;
    const base = { type: 'EARNING', occurredOn: '2026-01-01', description: 'x' };
    await api()
      .post(url)
      .set(auth)
      .send({ ...base, amount: 10.5 })
      .expect(422);
    await api()
      .post(url)
      .set(auth)
      .send({ ...base, amount: '0.00' })
      .expect(422);
    await api()
      .post(url)
      .set(auth)
      .send({ ...base, amount: '-1.00' })
      .expect(422);
    await api()
      .post(url)
      .set(auth)
      .send({ ...base, amount: '1.001' })
      .expect(422);
    await api()
      .post(url)
      .set(auth)
      .send({ ...base, amount: '1.00', occurredOn: '2026-02-30' })
      .expect(422);
    await api()
      .post(url)
      .set(auth)
      .send({ ...base, amount: '1.00', type: 'REFUND' })
      .expect(422);
  });

  it('filters by inclusive date range and type, newest first', async () => {
    await seedLedger();
    const res = await api().get(`/api/v1/clients/${clientId}/movements?from=2026-01-31&to=2026-02-28`).set(auth).expect(200);
    expect((res.body.items as Array<{ occurredOn: string }>).map((m) => m.occurredOn)).toEqual([
      '2026-02-28',
      '2026-02-01',
      '2026-01-31',
    ]);
    const expenses = await api().get(`/api/v1/clients/${clientId}/movements?type=EXPENSE`).set(auth).expect(200);
    expect(expenses.body.totalItems).toBe(2);
    await api().get(`/api/v1/clients/${clientId}/movements?from=2026-03-01&to=2026-01-01`).set(auth).expect(422);
  });

  it('updates and soft-deletes; deleted movements disappear from balances but stay in the database', async () => {
    const movement = await addMovement(auth, clientId, { type: 'EARNING', amount: '10.00', occurredOn: '2026-01-01' });
    const updated = await api()
      .patch(`/api/v1/clients/${clientId}/movements/${movement.id}`)
      .set(auth)
      .send({ amount: '15.50', type: 'EXPENSE' })
      .expect(200);
    expect(updated.body).toMatchObject({ amount: '15.50', signedAmount: '-15.50' });

    await api().delete(`/api/v1/clients/${clientId}/movements/${movement.id}`).set(auth).expect(204);
    await api().delete(`/api/v1/clients/${clientId}/movements/${movement.id}`).set(auth).expect(404);
    const client = await api().get(`/api/v1/clients/${clientId}`).set(auth).expect(200);
    expect(client.body.balance).toBe('0.00');
    expect(await prisma.movement.count()).toBe(1);
  });

  it("cannot reach another client's movement through a different client id", async () => {
    const other = await createClient(auth, { name: 'Other' });
    const movement = await addMovement(auth, other.id, { type: 'EARNING', amount: '10.00', occurredOn: '2026-01-01' });
    await api().get(`/api/v1/clients/${clientId}/movements/${movement.id}`).set(auth).expect(404);
    await api().delete(`/api/v1/clients/${clientId}/movements/${movement.id}`).set(auth).expect(404);
  });
});

describe('reports', () => {
  it('all-time report sums every movement exactly', async () => {
    await seedLedger();
    const res = await api().get(`/api/v1/clients/${clientId}/report`).set(auth).expect(200);
    expect(res.body.range).toEqual({ from: null, to: null });
    expect(res.body.totals).toEqual({
      openingBalance: '0.00',
      totalEarnings: '1050.10',
      totalExpenses: '200.30',
      net: '849.80',
      closingBalance: '849.80',
      movementCount: 5,
    });
  });

  it('range report: opening + net = closing, and totals match the listed movements', async () => {
    await seedLedger();
    const query = 'from=2026-02-01&to=2026-02-28';
    const report = await api().get(`/api/v1/clients/${clientId}/report?${query}`).set(auth).expect(200);
    expect(report.body.totals).toMatchObject({
      openingBalance: '799.90',
      totalEarnings: '0.10',
      totalExpenses: '0.20',
      net: '-0.10',
      closingBalance: '799.80',
      movementCount: 2,
    });

    const list = await api().get(`/api/v1/clients/${clientId}/movements?${query}&pageSize=100`).set(auth).expect(200);
    const listedNet = (list.body.items as Array<{ signedAmount: string }>).reduce(
      (sum, m) => sum.plus(m.signedAmount),
      new Decimal(0),
    );
    expect(listedNet.toFixed(2)).toBe(report.body.totals.net);
  });

  it('overview totals equal the sum of per-client rows', async () => {
    await seedLedger();
    const other = await createClient(auth, { name: 'Another' });
    await addMovement(auth, other.id, { type: 'EXPENSE', amount: '99.99', occurredOn: '2026-02-10' });

    const res = await api().get('/api/v1/reports/overview?from=2026-02-01&to=2026-02-28').set(auth).expect(200);
    const rows = res.body.clients.items as Array<{ net: string; closingBalance: string; name: string }>;
    const sumNet = rows.reduce((sum, row) => sum.plus(row.net), new Decimal(0));
    const sumClosing = rows.reduce((sum, row) => sum.plus(row.closingBalance), new Decimal(0));
    expect(sumNet.toFixed(2)).toBe(res.body.totals.net);
    expect(sumClosing.toFixed(2)).toBe(res.body.totals.closingBalance);
    expect(res.body.totals.clientCount).toBe(2);

    const sorted = await api().get('/api/v1/reports/overview?sort=balance_desc').set(auth).expect(200);
    expect(sorted.body.clients.items[0].name).toBe('Ledger Co');
  });

  it('exports a CSV statement with running balance and neutralised formulas', async () => {
    await addMovement(auth, clientId, {
      type: 'EARNING',
      amount: '10.00',
      occurredOn: '2026-01-01',
      description: '=HYPERLINK("x")',
    });
    await addMovement(auth, clientId, { type: 'EXPENSE', amount: '2.50', occurredOn: '2026-01-02', description: 'Fee, "bank"' });

    const res = await api().get(`/api/v1/clients/${clientId}/report/export`).set(auth).buffer(true).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Ledger-Co-statement-all-time.csv"');
    const lines = res.text.replace(String.fromCharCode(0xfeff), '').trim().split('\r\n');
    expect(lines[0]).toBe('Date,Type,Description,Amount,Signed amount,Running balance');
    expect(lines[2]).toBe(`2026-01-01,EARNING,"'=HYPERLINK(""x"")",10.00,10.00,10.00`);
    expect(lines[3]).toBe('2026-01-02,EXPENSE,"Fee, ""bank""",2.50,-2.50,7.50');
    expect(lines.at(-1)).toBe(',CLOSING BALANCE,,,,7.50');
  });
});
