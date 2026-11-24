import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { resetRateLimits } from '../src/middleware/rate-limit.js';
import { hashPassword } from '../src/modules/auth/password.js';

export const app = createApp();
export const api = () => request(app);

export const ADMIN = { email: 'admin@test.local', password: 'integration-test-password', name: 'Test Admin' };

/** argon2 is deliberately slow — hash the default admin password once per test file. */
let defaultAdminHash: Promise<string> | undefined;

export async function resetDatabase(): Promise<void> {
  resetRateLimits();
  const [{ name } = { name: '' }] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (!name.endsWith('_test')) throw new Error(`Refusing to truncate non-test database "${name}"`);
  await prisma.$executeRaw`TRUNCATE TABLE audit_logs, movements, clients, sessions, admins RESTART IDENTITY CASCADE`;
}

export async function createAdmin(overrides: Partial<typeof ADMIN> = {}) {
  const data = { ...ADMIN, ...overrides };
  const passwordHash =
    data.password === ADMIN.password
      ? await (defaultAdminHash ??= hashPassword(ADMIN.password))
      : await hashPassword(data.password);
  return prisma.admin.create({ data: { email: data.email, name: data.name, passwordHash } });
}

export async function login(email = ADMIN.email, password = ADMIN.password): Promise<string> {
  const res = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
  return (res.body as { token: string }).token;
}

/** Fresh database + one admin + a valid token. */
export async function setupAuthenticated(): Promise<{ token: string; auth: { Authorization: string } }> {
  await resetDatabase();
  await createAdmin();
  const token = await login();
  return { token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createClient(auth: { Authorization: string }, body: Record<string, unknown> = { name: 'Acme' }) {
  const res = await api().post('/api/v1/clients').set(auth).send(body).expect(201);
  return res.body as { id: string; name: string; balance: string };
}

export async function addMovement(
  auth: { Authorization: string },
  clientId: string,
  body: { type: 'EARNING' | 'EXPENSE'; amount: string; occurredOn: string; description?: string },
) {
  const res = await api()
    .post(`/api/v1/clients/${clientId}/movements`)
    .set(auth)
    .send({ description: 'test movement', ...body })
    .expect(201);
  return res.body as { id: string; signedAmount: string };
}
