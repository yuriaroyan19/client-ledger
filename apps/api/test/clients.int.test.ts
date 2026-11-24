import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { addMovement, api, createClient, setupAuthenticated } from './helpers.js';

afterAll(() => prisma.$disconnect());

let auth: { Authorization: string };
beforeEach(async () => {
  ({ auth } = await setupAuthenticated());
});

describe('clients CRUD', () => {
  it('creates a client, normalising empty optional fields and email case', async () => {
    const client = await createClient(auth, { name: '  Acme  ', email: 'Billing@ACME.test', phone: '', notes: '' });
    expect(client).toMatchObject({ name: 'Acme', email: 'billing@acme.test', phone: null, notes: null, balance: '0.00' });
  });

  it('rejects unknown fields (mass assignment) and invalid values', async () => {
    const res = await api().post('/api/v1/clients').set(auth).send({ name: 'X', archivedAt: '2020-01-01T00:00:00Z' }).expect(422);
    expect(res.body.issues[0].message).toMatch(/Unrecognized key/);
    await api().post('/api/v1/clients').set(auth).send({ name: '' }).expect(422);
    await api().post('/api/v1/clients').set(auth).send({ name: 'X', email: 'not-an-email' }).expect(422);
  });

  it('enforces unique client emails', async () => {
    await createClient(auth, { name: 'A', email: 'same@test.local' });
    const res = await api().post('/api/v1/clients').set(auth).send({ name: 'B', email: 'SAME@test.local' }).expect(409);
    expect(res.body.issues[0].path).toBe('body.email');
  });

  it('lists with search, pagination and balances', async () => {
    const acme = await createClient(auth, { name: 'Acme' });
    await createClient(auth, { name: 'Globex' });
    await createClient(auth, { name: 'Acme Labs' });
    await addMovement(auth, acme.id, { type: 'EARNING', amount: '100.00', occurredOn: '2026-01-01' });

    const res = await api().get('/api/v1/clients?search=acme&pageSize=1').set(auth).expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(res.body.items[0]).toMatchObject({ name: 'Acme', balance: '100.00' });
  });

  it('treats LIKE wildcards in search literally', async () => {
    await createClient(auth, { name: 'Alpha' });
    const res = await api().get('/api/v1/clients?search=%25').set(auth).expect(200);
    expect(res.body.totalItems).toBe(0);
  });

  it('updates and returns 404 for unknown ids', async () => {
    const client = await createClient(auth);
    const res = await api().patch(`/api/v1/clients/${client.id}`).set(auth).send({ phone: '+1 555 0100' }).expect(200);
    expect(res.body.phone).toBe('+1 555 0100');
    await api().patch(`/api/v1/clients/${client.id}`).set(auth).send({}).expect(422);
    await api().get('/api/v1/clients/0192d1e4-5b6a-7c8d-9e0f-112233445566').set(auth).expect(404);
    await api().get('/api/v1/clients/not-a-uuid').set(auth).expect(422);
  });

  it('archives (hidden by default, ledger frozen) and restores', async () => {
    const client = await createClient(auth);
    await api().post(`/api/v1/clients/${client.id}/archive`).set(auth).expect(200);

    const active = await api().get('/api/v1/clients').set(auth).expect(200);
    expect(active.body.totalItems).toBe(0);
    const archived = await api().get('/api/v1/clients?status=archived').set(auth).expect(200);
    expect(archived.body.totalItems).toBe(1);

    await api()
      .post(`/api/v1/clients/${client.id}/movements`)
      .set(auth)
      .send({ type: 'EARNING', amount: '1.00', occurredOn: '2026-01-01', description: 'x' })
      .expect(409);

    await api().post(`/api/v1/clients/${client.id}/restore`).set(auth).expect(200);
    await addMovement(auth, client.id, { type: 'EARNING', amount: '1.00', occurredOn: '2026-01-01' });

    const actions = (await prisma.auditLog.findMany({ where: { entityType: 'client' }, orderBy: { createdAt: 'asc' } })).map(
      (log) => log.action,
    );
    expect(actions).toEqual(['client.created', 'client.archived', 'client.restored']);
  });
});
