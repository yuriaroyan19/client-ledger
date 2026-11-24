// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { admin, CLIENT_ID } from '../../test/fixtures';
import { apiRequests, cookieJar, onApi, RedirectSignal, VALID_TOKEN } from '../../test/next-fakes';
import { SESSION_COOKIE } from '@/lib/auth/session-cookie';
import { GET as health } from './api/health/route';
import { GET as exportClient } from './exports/clients/[clientId]/route';
import { GET as exportOverview } from './exports/overview/route';
import { GET as logout } from './logout/route';
import manifest from './manifest';
import Home from './page';
import robots from './robots';

const url = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const signIn = () => cookieJar.set(SESSION_COOKIE, { value: VALID_TOKEN });
const csv = () => new Response('Client\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });

describe('GET /logout (expired-session landing)', () => {
  it('cannot be used to sign out a valid session (logout CSRF)', async () => {
    signIn();
    onApi('GET', '/api/v1/auth/me', admin);
    const res = await logout(url('/logout?reason=expired'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/clients');
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
  });

  it('clears an invalid session cookie and explains why', async () => {
    signIn();
    onApi('GET', '/api/v1/auth/me', { status: 401 }, 401);
    const res = await logout(url('/logout'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?reason=expired');
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe('CSV export routes', () => {
  it('proxies a client statement with validated dates only', async () => {
    signIn();
    onApi('GET', `/api/v1/clients/${CLIENT_ID}/report/export`, csv());
    const res = await exportClient(url(`/exports/clients/${CLIENT_ID}?from=2026-01-01&to=bad&sort=name`), {
      params: Promise.resolve({ clientId: CLIENT_ID }),
    });
    expect(res.status).toBe(200);
    expect(new URL(apiRequests[0]?.url ?? '').search).toBe('?from=2026-01-01');
  });

  it('rejects malformed client ids without calling the API (no path injection)', async () => {
    signIn();
    const res = await exportClient(url('/exports/clients/x'), { params: Promise.resolve({ clientId: '..%2F..%2Fadmin' }) });
    expect(res.status).toBe(404);
    expect(apiRequests).toHaveLength(0);
  });

  it('proxies the overview with whitelisted sorts only', async () => {
    signIn();
    onApi('GET', '/api/v1/reports/overview/export', csv());
    await exportOverview(url('/exports/overview?sort=balance_asc&to=2026-12-31'));
    await exportOverview(url('/exports/overview?sort=amount;drop'));
    expect(apiRequests.map((request) => new URL(request.url).search)).toEqual(['?to=2026-12-31&sort=balance_asc', '']);
  });
});

describe('metadata routes and probes', () => {
  it('health check is static and uncached', async () => {
    const res = health();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('blocks all crawlers and describes the installable app', () => {
    expect(robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
    expect(manifest()).toMatchObject({ name: 'Client Ledger', start_url: '/clients', display: 'standalone' });
  });

  it('home redirects to the client list', () => {
    expect(() => Home()).toThrow(RedirectSignal);
  });
});
