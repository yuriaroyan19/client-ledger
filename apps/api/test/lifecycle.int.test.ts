import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSeed } from '../src/bootstrap/seed.js';
import { startServer } from '../src/bootstrap/server.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { verifyPassword } from '../src/modules/auth/password.js';
import { hashSessionToken } from '../src/modules/auth/session-token.js';
import { sessionService } from '../src/modules/auth/session.service.js';
import { ADMIN, api, createAdmin, login, resetDatabase } from './helpers.js';

afterAll(() => prisma.$disconnect());
beforeEach(() => resetDatabase());

const MINUTE = 60_000;
const sessionOf = (token: string) => prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(token) } });
const me = (token: string) =>
  api()
    .get('/api/v1/auth/me')
    .set({ Authorization: `Bearer ${token}` });

describe('session expiry boundaries', () => {
  it('accepts a session just inside the idle timeout and slides lastUsedAt forward', async () => {
    await createAdmin();
    const token = await login();
    const { id } = await sessionOf(token);
    const almostIdle = new Date(Date.now() - (env.SESSION_IDLE_TIMEOUT_MINUTES * MINUTE - 30_000));
    await prisma.session.update({ where: { id }, data: { lastUsedAt: almostIdle } });

    await me(token).expect(200);
    const touched = await sessionOf(token);
    expect(touched.lastUsedAt.getTime()).toBeGreaterThan(Date.now() - 5_000);
  });

  it('does not write lastUsedAt more than once a minute', async () => {
    await createAdmin();
    const token = await login();
    const { id } = await sessionOf(token);
    const recent = new Date(Date.now() - 20_000);
    await prisma.session.update({ where: { id }, data: { lastUsedAt: recent } });
    await me(token).expect(200);
    expect((await sessionOf(token)).lastUsedAt.getTime()).toBe(recent.getTime());
  });

  it('only expires the session that went idle', async () => {
    await createAdmin();
    const stale = await login();
    const fresh = await login();
    await prisma.session.update({
      where: { id: (await sessionOf(stale)).id },
      data: { lastUsedAt: new Date(Date.now() - (env.SESSION_IDLE_TIMEOUT_MINUTES * MINUTE + 1_000)) },
    });
    await me(stale).expect(401);
    await me(fresh).expect(200);
  });

  it('rejects unknown and revoked tokens, and logout-all leaves other admins signed in', async () => {
    await createAdmin();
    await createAdmin({ email: 'other@test.local', name: 'Other' });
    const mine = await login();
    const theirs = await login('other@test.local');
    await me(`cls_${'A'.repeat(43)}`).expect(401);

    const res = await api()
      .post('/api/v1/auth/logout-all')
      .set({ Authorization: `Bearer ${mine}` })
      .expect(200);
    expect(res.body.revokedSessions).toBe(1);
    await me(mine).expect(401);
    await me(theirs).expect(200);
    // A revoked token stays revoked, even for logout itself.
    await api()
      .post('/api/v1/auth/logout')
      .set({ Authorization: `Bearer ${mine}` })
      .expect(401);
  });

  it('purges sessions that can never be used again and keeps live ones', async () => {
    const admin = await createAdmin();
    const live = await login();
    const day = 24 * 60 * MINUTE;
    const base = { adminId: admin.id, ipAddress: null, userAgent: null };
    await prisma.session.createMany({
      data: [
        { ...base, tokenHash: 'expired', expiresAt: new Date(Date.now() - 1_000) },
        { ...base, tokenHash: 'old-revoked', expiresAt: new Date(Date.now() + day), revokedAt: new Date(Date.now() - 2 * day) },
        { ...base, tokenHash: 'abandoned', expiresAt: new Date(Date.now() + day), lastUsedAt: new Date(Date.now() - 2 * day) },
        { ...base, tokenHash: 'just-revoked', expiresAt: new Date(Date.now() + day), revokedAt: new Date() },
      ],
    });
    expect(await sessionService.purgeExpired()).toBe(3);
    const remaining = await prisma.session.findMany({ select: { tokenHash: true } });
    expect(remaining.map((row) => row.tokenHash).sort()).toEqual(['just-revoked', hashSessionToken(live)].sort());
  });
});

describe('seed', () => {
  const seedEnv = { ADMIN_EMAIL: ' Seed@Test.Local ', ADMIN_PASSWORD: 'seed-password-123', ADMIN_NAME: 'Seeder' };

  it('creates the admin once, then leaves it untouched', async () => {
    const first = await runSeed(seedEnv);
    expect(first).toMatchObject({ adminCreated: true, demoDataInserted: false });
    const admin = await prisma.admin.findUniqueOrThrow({ where: { email: 'seed@test.local' } });
    expect(admin.name).toBe('Seeder');

    const second = await runSeed({ ...seedEnv, ADMIN_PASSWORD: 'a-different-password' });
    expect(second).toEqual({ adminId: admin.id, adminCreated: false, demoDataInserted: false });
    const after = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await verifyPassword(after.passwordHash, 'seed-password-123')).toBe(true);
  });

  it('rotates the password and revokes sessions only when asked', async () => {
    await runSeed(seedEnv);
    const token = await login('seed@test.local', 'seed-password-123');
    await runSeed({ ...seedEnv, ADMIN_PASSWORD: 'rotated-password-456', ADMIN_RESET_PASSWORD: 'true' });
    await me(token).expect(401);
    await login('seed@test.local', 'rotated-password-456');
  });

  it('inserts demo data only into an empty database', async () => {
    const result = await runSeed({ ...seedEnv, SEED_DEMO_DATA: 'true' });
    expect(result.demoDataInserted).toBe(true);
    expect(await prisma.client.count()).toBe(4);
    expect(await prisma.movement.count()).toBe(56);
    const invalid = await prisma.movement.count({ where: { amount: { lte: 0 } } });
    expect(invalid).toBe(0);

    const again = await runSeed({ ...seedEnv, SEED_DEMO_DATA: 'true' });
    expect(again.demoDataInserted).toBe(false);
    expect(await prisma.client.count()).toBe(4);
  });

  it.each([
    [{ ...seedEnv, ADMIN_PASSWORD: 'short' }, /ADMIN_PASSWORD: ADMIN_PASSWORD must be at least 12 characters/],
    [{ ...seedEnv, ADMIN_EMAIL: 'not-an-email' }, /ADMIN_EMAIL/],
    [{ ADMIN_PASSWORD: 'seed-password-123' }, /ADMIN_EMAIL/],
    [{ ...seedEnv, ADMIN_RESET_PASSWORD: 'yes' }, /ADMIN_RESET_PASSWORD/],
    [{ ...seedEnv, ADMIN_PASSWORD: 'Password1234' }, /well-known weak value/],
  ])('refuses unsafe configuration %#', async (config, message) => {
    await expect(runSeed(config)).rejects.toThrow(message);
    expect(await prisma.admin.count()).toBe(0);
  });
});

describe('server lifecycle', () => {
  it('serves requests, purges sessions periodically and shuts down gracefully', async () => {
    const purge = vi
      .spyOn(sessionService, 'purgeExpired')
      .mockResolvedValue(0)
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('db down'));
    const running = startServer({ port: 0, purgeIntervalMs: 20 });
    const { port } = await running.ready;

    expect(running.server.headersTimeout).toBe(15_000);
    expect(running.server.requestTimeout).toBe(30_000);
    const res = await fetch(`http://127.0.0.1:${port}/health/live`);
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(purge.mock.calls.length).toBeGreaterThanOrEqual(3));

    const first = running.shutdown('SIGTERM');
    expect(running.shutdown('SIGINT')).toBe(first); // idempotent
    expect(await first).toBe(0);
    expect(running.server.listening).toBe(false);
    purge.mockRestore();
  });

  it('reports a failed close and forces exit after the timeout', async () => {
    const failing = startServer({ port: 0 });
    await failing.ready;
    vi.spyOn(failing.server, 'close').mockImplementation((callback?: (error?: Error) => void) => {
      callback?.(new Error('close failed'));
      return failing.server;
    });
    expect(await failing.shutdown('SIGTERM')).toBe(1);

    const hanging = startServer({ port: 0, shutdownTimeoutMs: 20 });
    await hanging.ready;
    const realClose = hanging.server.close.bind(hanging.server);
    vi.spyOn(hanging.server, 'close').mockImplementation(() => hanging.server);
    expect(await hanging.shutdown('SIGTERM')).toBe(1);

    realClose();
    vi.restoreAllMocks();
    // The database stays usable for later tests: Prisma reconnects lazily after $disconnect.
    expect(await prisma.admin.count()).toBe(0);
    expect(ADMIN.email).toBeDefined();
  });
});
