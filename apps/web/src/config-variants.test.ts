// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// Configuration is read once at import time, so each variant re-imports the modules.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('deployment variants', () => {
  it('plain-HTTP deployments (COOKIE_SECURE=false) use a non-__Host- cookie without Secure', async () => {
    vi.stubEnv('COOKIE_SECURE', 'false');
    vi.resetModules();
    const { SESSION_COOKIE, setSessionToken } = await import('./lib/auth/session-cookie');
    // resetModules also re-creates the fakes, so read the jar the fresh module wrote to.
    const { cookieJar } = await import('../test/next-fakes');
    expect(SESSION_COOKIE).toBe('cl_session');
    await setSessionToken('cls_x', new Date(0));
    expect(cookieJar.get('cl_session')?.options).toMatchObject({ secure: false, httpOnly: true, sameSite: 'lax' });
  });

  it('rejects invalid server configuration at startup', async () => {
    vi.stubEnv('API_URL', 'not a url');
    vi.resetModules();
    await expect(import('./lib/env')).rejects.toThrow();
  });

  it('reads trusted proxy hops from the environment', async () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
    vi.stubEnv('API_URL', 'http://api:4000');
    vi.resetModules();
    const { serverEnv } = await import('./lib/env');
    expect(serverEnv).toMatchObject({ TRUSTED_PROXY_HOPS: 1, API_URL: 'http://api:4000' });
  });

  it('defaults the display currency to USD and honours NEXT_PUBLIC_CURRENCY', async () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENCY', undefined);
    vi.resetModules();
    expect((await import('./lib/format')).currencyCode).toBe('USD');

    vi.stubEnv('NEXT_PUBLIC_CURRENCY', 'EUR');
    vi.resetModules();
    const format = await import('./lib/format');
    expect(format.currencyCode).toBe('EUR');
    expect(format.formatMoney('5')).toBe('€5.00');
  });
});
