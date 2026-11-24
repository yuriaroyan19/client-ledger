import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { addMovement, api, createClient, setupAuthenticated } from './helpers.js';

afterAll(() => prisma.$disconnect());

let auth: { Authorization: string };
beforeEach(async () => {
  ({ auth } = await setupAuthenticated());
});

describe('concurrent ledger changes', () => {
  it('never changes a movement after its client was archived', async () => {
    for (let round = 0; round < 5; round += 1) {
      const client = await createClient(auth, { name: `Race ${round}` });
      const movement = await addMovement(auth, client.id, { type: 'EARNING', amount: '10.00', occurredOn: '2026-01-01' });
      const [patch, archive] = await Promise.all([
        api().patch(`/api/v1/clients/${client.id}/movements/${movement.id}`).set(auth).send({ amount: '99.00' }),
        api().post(`/api/v1/clients/${client.id}/archive`).set(auth),
      ]);
      expect(archive.status).toBe(200);
      expect([200, 409]).toContain(patch.status);

      const [stored, archived] = await Promise.all([
        prisma.movement.findUniqueOrThrow({ where: { id: movement.id } }),
        prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
      ]);
      // Either the edit committed before the archive, or it was rejected.
      if (patch.status === 200) expect(stored.updatedAt.getTime()).toBeLessThanOrEqual(archived.archivedAt?.getTime() ?? 0);
      else expect(stored.amount.toFixed(2)).toBe('10.00');
    }
  });

  it('deletes a movement exactly once under concurrent requests', async () => {
    const client = await createClient(auth);
    const movement = await addMovement(auth, client.id, { type: 'EXPENSE', amount: '5.00', occurredOn: '2026-01-01' });
    const url = `/api/v1/clients/${client.id}/movements/${movement.id}`;
    const statuses = (
      await Promise.all([
        api().delete(url).set(auth),
        api().delete(url).set(auth),
        api().patch(url).set(auth).send({ amount: '1.00' }),
      ])
    ).map((res) => res.status);
    expect(statuses.filter((status) => status === 204)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'movement.deleted', entityId: movement.id } })).toBe(1);
    const stored = await prisma.movement.findUniqueOrThrow({ where: { id: movement.id } });
    expect(stored.deletedAt).not.toBeNull();
  });
});

describe('small behaviours', () => {
  it('archive and restore are idempotent and audited once', async () => {
    const client = await createClient(auth);
    await api().post(`/api/v1/clients/${client.id}/archive`).set(auth).expect(200);
    const again = await api().post(`/api/v1/clients/${client.id}/archive`).set(auth).expect(200);
    expect(again.body.archivedAt).toEqual(expect.any(String));
    expect(await prisma.auditLog.count({ where: { action: 'client.archived', entityId: client.id } })).toBe(1);
    await api().post(`/api/v1/clients/${client.id}/restore`).set(auth).expect(200);
    const restored = await api().post(`/api/v1/clients/${client.id}/restore`).set(auth).expect(200);
    expect(restored.body.archivedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'client.restored', entityId: client.id } })).toBe(1);
    await api().post('/api/v1/clients/0195f7c2-0000-7000-8000-000000000000/archive').set(auth).expect(404);
  });

  it('PATCH changes only the provided fields', async () => {
    const client = await createClient(auth);
    const movement = await addMovement(auth, client.id, {
      type: 'EARNING',
      amount: '10.00',
      occurredOn: '2026-01-01',
      description: 'old',
    });
    const res = await api()
      .patch(`/api/v1/clients/${client.id}/movements/${movement.id}`)
      .set(auth)
      .send({ description: 'new' })
      .expect(200);
    expect(res.body).toMatchObject({ type: 'EARNING', amount: '10.00', occurredOn: '2026-01-01', description: 'new' });
    const typed = await api()
      .patch(`/api/v1/clients/${client.id}/movements/${movement.id}`)
      .set(auth)
      .send({ type: 'EXPENSE', occurredOn: '2026-02-02' })
      .expect(200);
    expect(typed.body).toMatchObject({ type: 'EXPENSE', signedAmount: '-10.00', occurredOn: '2026-02-02', description: 'new' });
  });

  it('labels open-start exports and reports readiness when the database is up', async () => {
    const client = await createClient(auth, { name: 'Range' });
    const res = await api().get(`/api/v1/clients/${client.id}/report/export?to=2026-06-30`).set(auth).expect(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Range-statement-start_to_2026-06-30.csv"');
    const ready = await api().get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
  });
});
