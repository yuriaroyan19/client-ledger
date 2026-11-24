import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Low limits for this file only. env.ts parses at import time, so set them before importing the app.
process.env.RATE_LIMIT_ANONYMOUS_MAX_PER_MINUTE = '6';
process.env.RATE_LIMIT_LOGIN_MAX_PER_IP = '3';
process.env.RATE_LIMIT_LOGIN_MAX_FAILURES_PER_EMAIL = '2';

let app: Express;
let resetRateLimits: () => void;
beforeAll(async () => {
  app = (await import('../app.js')).createApp();
  ({ resetRateLimits } = await import('./rate-limit.js'));
});
beforeEach(() => resetRateLimits());

// Invalid bodies are rejected by validation (422) after the limiters ran, so no database is needed.
const badLogin = (email: unknown, ip: string) =>
  request(app).post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password: '' });

describe('rate limits', () => {
  it('anonymous limiter returns a 429 problem with standard headers and skips health probes', async () => {
    for (let i = 0; i < 6; i += 1) await request(app).get('/api/v1/unknown').expect(404);
    const limited = await request(app).get('/api/v1/unknown').expect(429);
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(limited.headers.ratelimit).toBeDefined();
    await request(app).get('/health/live').expect(200);
  });

  it('limits failed logins per account, case-insensitively, without affecting other accounts', async () => {
    await badLogin('Victim@Test.local', '203.0.113.10').expect(422);
    await badLogin(' victim@test.local ', '203.0.113.11').expect(422);
    const blocked = await badLogin('VICTIM@test.local', '203.0.113.12').expect(429);
    expect(blocked.body.detail).toBe('Too many failed login attempts. Please try again later.');
    await badLogin('other@test.local', '203.0.113.13').expect(422);
  });

  it('buckets non-string emails together', async () => {
    await badLogin(42, '203.0.113.20').expect(422);
    await badLogin(['x'], '203.0.113.21').expect(422);
    await badLogin(null, '203.0.113.22').expect(429);
  });

  it('limits login attempts per IP across accounts', async () => {
    for (const user of ['a', 'b', 'c']) await badLogin(`${user}@test.local`, '198.51.100.7').expect(422);
    const blocked = await badLogin('d@test.local', '198.51.100.7').expect(429);
    expect(blocked.body.detail).toBe('Too many login attempts. Please try again later.');
    await badLogin('d@test.local', '198.51.100.8').expect(422);
  });
});
