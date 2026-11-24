import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PrismaModule from '../src/lib/prisma.js';
import type * as HelpersModule from './helpers.js';

// Low limits for this file only (env.ts parses at import time, so set them before importing the app).
process.env.RATE_LIMIT_ANONYMOUS_MAX_PER_MINUTE = '8';
process.env.RATE_LIMIT_SESSION_MAX_PER_MINUTE = '5';
process.env.RATE_LIMIT_AUTH_FAILURES_PER_MINUTE = '10';

let helpers: typeof HelpersModule;
let db: typeof PrismaModule.prisma;
let hashSessionToken: (token: string) => string;
let forgetRecentlyValid: () => void;
const tokenOf = (token: string) => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => {
  helpers = await import('./helpers.js');
  db = (await import('../src/lib/prisma.js')).prisma;
  ({ hashSessionToken } = await import('../src/modules/auth/session-token.js'));
  const { sessionService } = await import('../src/modules/auth/session.service.js');
  forgetRecentlyValid = () => sessionService.forgetRecentlyValid();
});
afterAll(() => db.$disconnect());

let alice: string;
let bob: string;
beforeEach(async () => {
  await helpers.resetDatabase(); // also resets the rate-limit counters
  await helpers.createAdmin();
  alice = await helpers.login();
  bob = await helpers.login();
});

const me = (token: string) => helpers.api().get('/api/v1/auth/me').set(tokenOf(token));
const forged = (i: number) => `cls_${String(i).padStart(43, 'x')}`;

describe('rate limits do not let one client lock out others', () => {
  it('a fake-cookie loop is cut off before the database, and real admins keep working', async () => {
    const lookups = vi.spyOn(db.session, 'findUnique');
    // The reported attack: well-formed fake tokens looping through the web app's single IP.
    for (let i = 0; i < 10; i += 1) await me(forged(i)).expect(401);
    for (let i = 10; i < 40; i += 1) {
      const blocked = await me(forged(i)).expect(429);
      expect(blocked.body.detail).toBe('Too many invalid session attempts. Please try again later.');
    }
    expect(lookups).toHaveBeenCalledTimes(10); // the 30 blocked requests never reached the database
    lookups.mockRestore();

    // Admins from the same IP are unaffected: their sessions are known to be valid...
    await me(alice).expect(200);
    // ...including someone who signs in during the attack.
    const carol = await helpers.login();
    await me(carol).expect(200);
    // The shared anonymous budget was never touched by the forged tokens.
    await helpers.api().post('/api/v1/auth/login').send({ email: 'nobody@test.local', password: 'x' }).expect(401);
  });

  it('during an attack, a valid session this process has not seen yet must wait (documented trade-off)', async () => {
    for (let i = 0; i < 10; i += 1) await me(forged(i)).expect(401);
    forgetRecentlyValid(); // e.g. the API restarted
    await me(alice).expect(429);
  });

  it('successful requests never count as failures', async () => {
    // Without the attack, a known-good session that wasn't seen recently still validates normally.
    forgetRecentlyValid();
    await me(alice).expect(200);
    for (let i = 0; i < 9; i += 1) await me(forged(i)).expect(401);
    await me(bob).expect(200);
    await me(forged(99)).expect(401); // 10th failure
    await me(forged(100)).expect(429);
  });

  it('limits each session separately', async () => {
    for (let i = 0; i < 5; i += 1) await me(alice).expect(200);
    const limited = await me(alice).expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    await me(bob).expect(200);
  });

  it('counts requests without a well-formed token per IP', async () => {
    // 2 logins already used the anonymous budget of 8.
    for (let i = 0; i < 6; i += 1) await me('garbage').expect(401);
    await me('garbage').expect(429);
    // Signed-in traffic from the same IP is unaffected.
    await me(alice).expect(200);
  });

  it('a revoked session still fails after being seen as valid (the memory never grants access)', async () => {
    await me(alice).expect(200);
    await db.session.updateMany({ where: { tokenHash: hashSessionToken(alice) }, data: { revokedAt: new Date() } });
    await me(alice).expect(401);
  });
});
