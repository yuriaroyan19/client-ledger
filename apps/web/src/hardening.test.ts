// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovementFormSchema } from '@/features/movements/schemas';
import { isPublicPath, safeNextPath } from '@/lib/auth/constants';
import { isValidDateOnly, presetRange, rangeFromSearchParams } from '@/lib/date-range';
import { config, proxy } from './proxy';

const request = (path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: { ...init.headers, ...(init.cookie && { cookie: init.cookie }) },
  });

describe('proxy: auth gate', () => {
  it('redirects anonymous users to /login and remembers where they were going', () => {
    const res = proxy(request('/clients/abc?range=this-month'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/clients/abc?range=this-month');
  });

  it('does not add ?next for the home page', () => {
    expect(proxy(request('/')).headers.get('location')).toBe('http://localhost:3000/login');
  });

  it.each(['/login', '/logout', '/api/health'])('lets anonymous users reach %s', (path) => {
    expect(proxy(request(path)).headers.get('location')).toBeNull();
  });

  it.each(['__Host-cl_session=x', 'cl_session=x'])('lets requests with a session cookie through (%s)', (cookie) => {
    const res = proxy(request('/clients', { cookie }));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('skips static assets and prefetches', () => {
    const [matcher] = config.matcher;
    const pattern = new RegExp(`^${matcher?.source ?? ''}$`);
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
    expect(pattern.test('/icon.svg')).toBe(false);
    expect(pattern.test('/clients')).toBe(true);
    expect(matcher?.missing).toEqual(expect.arrayContaining([{ type: 'header', key: 'next-router-prefetch' }]));
  });
});

describe('proxy: Content-Security-Policy', () => {
  afterEach(() => vi.unstubAllEnvs());

  const cspOf = (res: Response) => res.headers.get('content-security-policy') ?? '';

  it('sets a fresh nonce per request on the response and the forwarded request', () => {
    const first = proxy(request('/login'));
    const second = proxy(request('/login'));
    const nonce = /'nonce-([^']+)'/.exec(cspOf(first))?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
    expect(cspOf(second)).not.toContain(nonce);
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(cspOf(first));
  });

  it('is strict: no inline/eval scripts, no framing, no plugins, same-origin forms', () => {
    const csp = cspOf(proxy(request('/login')));
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    for (const directive of [
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "default-src 'self'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('upgrades insecure requests only behind HTTPS', () => {
    expect(cspOf(proxy(request('/login', { headers: { 'x-forwarded-proto': 'https' } })))).toContain('upgrade-insecure-requests');
    expect(cspOf(proxy(new NextRequest('https://ledger.example.test/login')))).toContain('upgrade-insecure-requests');
  });

  it("allows 'unsafe-eval' only for the development server (React debugging)", () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(cspOf(proxy(request('/login')))).toContain("'unsafe-eval'");
  });
});

describe('safeNextPath: open-redirect vectors', () => {
  it.each([
    '/\t/evil.test',
    '/\n/evil.test',
    '/\r/evil.test',
    '/ /evil.test',
    '/\\/evil.test',
    '/\u0000/evil.test',
    '//evil.test/clients',
    'https://evil.test/clients',
    '/login/../logout',
    '/api/health',
    `/${'a'.repeat(2048)}`,
  ])('rejects %j', (value) => {
    expect(safeNextPath(value)).toBe('/clients');
  });

  it.each([
    ['/%2F/evil.test', '/%2F/evil.test'],
    ['/clients/./abc', '/clients/abc'],
    ['/reports?range=this-month#top', '/reports?range=this-month#top'],
    ['/api/healthz', '/api/healthz'],
  ])('normalises same-site path %j', (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it('treats sub-paths of public routes as public', () => {
    expect(isPublicPath('/login/x')).toBe(true);
    expect(isPublicPath('/api/healthz')).toBe(false);
  });
});

describe('dates: same bounds as the API', () => {
  it.each(['1900-01-01', '2999-12-31', '2024-02-29'])('accepts %s', (value) => expect(isValidDateOnly(value)).toBe(true));
  it.each(['1899-12-31', '3000-01-01', '0999-01-01', '2023-02-29', '2026-1-01', undefined, ''])('rejects %j', (value) =>
    expect(isValidDateOnly(value)).toBe(false),
  );

  it('falls back to all time with a warning instead of sending an out-of-range date', () => {
    expect(rangeFromSearchParams({ from: '0999-01-01' })).toEqual({
      preset: 'all',
      error: 'Dates must be valid calendar dates.',
    });
  });

  it('computes presets in UTC even when the local date differs', () => {
    // 02:00 UTC on Apr 1 is still Mar 31 in New York (the test time zone).
    expect(presetRange('this-month', new Date('2026-04-01T02:00:00Z'))).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(presetRange('this-year', new Date('2026-01-01T02:00:00Z'))).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('last-month', new Date('2026-01-01T02:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('amount input', () => {
  const parse = (amount: string) => MovementFormSchema.shape.amount.safeParse(amount);

  it.each([
    ['1250.50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['12,345,678', '12345678'],
    [' 42 ', '42'],
    ['999999999999.99', '999999999999.99'],
  ])('accepts %j as %j', (input, expected) => {
    expect(parse(input)).toEqual({ success: true, data: expected });
  });

  it.each(['1,50', '49,99', '1,2345.00', '12,34,5', ',5', '1 000', '1.234', '-5', '0', '0.00', '+5', '1e3', 'abc'])(
    'rejects %j instead of guessing',
    (input) => {
      expect(parse(input).success).toBe(false);
    },
  );

  it('explains decimal commas and size limits', () => {
    expect(parse('49,99').error?.issues[0]?.message).toBe('Enter an amount like 1250.50 (use a dot for decimals)');
    expect(parse('1,000,000,000,000.00').error?.issues[0]?.message).toBe('Amount is too large');
    expect(parse('0').error?.issues[0]?.message).toBe('Amount must be greater than 0');
  });
});
