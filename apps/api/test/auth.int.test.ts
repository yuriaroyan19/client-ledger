import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from '../src/docs/openapi.js';
import { prisma } from '../src/lib/prisma.js';
import { ADMIN, api, createAdmin, login, resetDatabase } from './helpers.js';

afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase();
  await createAdmin();
});

describe('POST /auth/login', () => {
  it('returns an opaque session token and the admin profile, never the hash', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: ADMIN.email, password: ADMIN.password }).expect(200);
    expect(res.body.token).toMatch(/^cls_/);
    expect(res.body.admin).toEqual({ id: expect.any(String), email: ADMIN.email, name: ADMIN.name });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('normalises email case and whitespace', async () => {
    await api()
      .post('/api/v1/auth/login')
      .send({ email: `  ${ADMIN.email.toUpperCase()}`, password: ADMIN.password })
      .expect(200);
  });

  it('gives the same answer for an unknown email and a wrong password (no enumeration)', async () => {
    const wrongPassword = await api().post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'nope' });
    const unknownEmail = await api().post('/api/v1/auth/login').send({ email: 'ghost@test.local', password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.detail).toBe(unknownEmail.body.detail);
  });

  it('records successful and failed attempts in the audit log', async () => {
    await api().post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'nope' });
    await login();
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((log) => log.action);
    expect(actions).toEqual(['auth.login.failed', 'auth.login.succeeded']);
  });

  it('attributes failed attempts to the targeted admin only when the account exists', async () => {
    await api().post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'wrong-password' }).expect(401);
    await api().post('/api/v1/auth/login').send({ email: 'ghost@test.local', password: 'wrong-password' }).expect(401);
    const admin = await prisma.admin.findUniqueOrThrow({ where: { email: ADMIN.email } });
    const failures = await prisma.auditLog.findMany({ where: { action: 'auth.login.failed' } });
    const byEmail = Object.fromEntries(failures.map((row) => [(row.metadata as { email: string }).email, row]));
    expect(byEmail[ADMIN.email]).toMatchObject({ entityId: admin.id, adminId: admin.id });
    expect(byEmail['ghost@test.local']).toMatchObject({ entityId: null, adminId: null });
    expect(JSON.stringify(failures)).not.toContain('wrong-password');
  });

  it('stores only a hash of the session token', async () => {
    const token = await login();
    const session = await prisma.session.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('locks an account after repeated failures, even with the right password', async () => {
    const email = 'victim@test.local';
    await createAdmin({ email, password: 'victim-correct-password' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await api()
        .post('/api/v1/auth/login')
        .send({ email, password: `wrong-${attempt}` })
        .expect(401);
    }
    const res = await api().post('/api/v1/auth/login').send({ email, password: 'victim-correct-password' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});

describe('session lifecycle', () => {
  it('GET /auth/me works with a token and logout revokes it immediately', async () => {
    const token = await login();
    const auth = { Authorization: `Bearer ${token}` };
    await api().get('/api/v1/auth/me').set(auth).expect(200);
    await api().post('/api/v1/auth/logout').set(auth).expect(204);
    await api().get('/api/v1/auth/me').set(auth).expect(401);
  });

  it('logout-all revokes every session of the admin', async () => {
    const first = await login();
    const second = await login();
    const res = await api()
      .post('/api/v1/auth/logout-all')
      .set({ Authorization: `Bearer ${first}` })
      .expect(200);
    expect(res.body.revokedSessions).toBe(2);
    await api()
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${second}` })
      .expect(401);
  });

  it('rejects sessions past their idle timeout', async () => {
    const token = await login();
    await prisma.session.updateMany({ data: { lastUsedAt: new Date(Date.now() - 31 * 60_000) } });
    await api()
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${token}` })
      .expect(401);
  });

  it('rejects sessions past their absolute lifetime', async () => {
    const token = await login();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await api()
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${token}` })
      .expect(401);
  });
});

describe('authorization coverage', () => {
  it('every documented non-health operation rejects anonymous requests', async () => {
    const document = generateOpenApiDocument();
    const paths = document.paths;
    if (!paths) throw new Error('OpenAPI document has no paths');
    const uuid = '0192d1e4-5b6a-7c8d-9e0f-112233445566';
    const operations = Object.entries(paths).flatMap(([path, item]) =>
      (['get', 'post', 'patch', 'delete'] as const)
        .filter((method) => item[method])
        .map((method) => ({ method, path: path.replace(/\{[^}]+\}/g, uuid), security: item[method]?.security })),
    );
    const protectedOps = operations.filter((op) => op.security && op.security.length > 0);
    expect(protectedOps.length).toBeGreaterThan(10);

    for (const op of protectedOps) {
      const res = await api()[op.method](op.path).send({});
      expect(res.status, `${op.method.toUpperCase()} ${op.path}`).toBe(401);
    }
    // And the only public operations are login + health probes.
    const publicOps = operations.filter((op) => !op.security || op.security.length === 0).map((op) => op.path);
    expect(publicOps.sort()).toEqual(['/api/v1/auth/login', '/health/live', '/health/ready']);
  });
});
