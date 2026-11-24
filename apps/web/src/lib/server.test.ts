// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  apiRequests,
  cookieJar,
  json,
  NotFoundSignal,
  onApi,
  RedirectSignal,
  requestHeaders,
  VALID_TOKEN,
} from '../../test/next-fakes';
import { api, mutate, read } from './api/client';
import { dateParam, proxyDownload } from './api/download';
import { forwardedHeaders } from './api/forwarded';
import { ApiError, fieldErrorsFrom, toProblem } from './api/problem';
import { clearSessionToken, getSessionToken, SESSION_COOKIE, setSessionToken } from './auth/session-cookie';
import { cn } from './cn';
import { serverEnv } from './env';
import { formatDateTime, toneOf } from './format';
import { apiFailed, formValues, initialFormState, validationFailed } from './forms';

const TOKEN = VALID_TOKEN;
const signIn = () => cookieJar.set(SESSION_COOKIE, { value: TOKEN });

describe('server environment', () => {
  it('uses secure defaults', () => {
    expect(serverEnv).toEqual({ API_URL: 'http://localhost:4000', COOKIE_SECURE: true, TRUSTED_PROXY_HOPS: 0 });
    expect(SESSION_COOKIE).toBe('__Host-cl_session');
  });
});

describe('session cookie', () => {
  it('stores the token httpOnly, Secure, SameSite=Lax on / with the session expiry', async () => {
    const expires = new Date('2026-11-24T12:00:00Z');
    await setSessionToken(TOKEN, expires);
    expect(cookieJar.get('__Host-cl_session')).toEqual({
      value: TOKEN,
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires },
    });
    expect(await getSessionToken()).toBe(TOKEN);
    await clearSessionToken();
    expect(await getSessionToken()).toBeUndefined();
  });
});

describe('BFF API client', () => {
  it('sends the session as a bearer token plus the end user agent, never browser cookies', async () => {
    signIn();
    requestHeaders.set('user-agent', `Browser/${'x'.repeat(600)}`);
    requestHeaders.set('cookie', `${SESSION_COOKIE}=${TOKEN}`);
    requestHeaders.set('x-forwarded-for', '6.6.6.6');
    onApi('GET', '/api/v1/auth/me', { id: 'a', email: 'a@test.local', name: 'A' });

    await read(api.GET('/api/v1/auth/me'));
    const [sent] = apiRequests;
    expect(sent?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(sent?.headers.get('user-agent')).toHaveLength(512);
    expect(sent?.headers.get('cookie')).toBeNull();
    // Directly exposed (0 trusted hops): a client-supplied X-Forwarded-For is not passed on.
    expect(sent?.headers.get('x-forwarded-for')).toBeNull();
  });

  it('never forwards a malformed cookie value to the API', async () => {
    cookieJar.set(SESSION_COOKIE, { value: 'not-a-session-token' });
    expect(await getSessionToken()).toBeUndefined();
    onApi('GET', '/api/v1/auth/me', { status: 401 }, 401);
    await expect(read(api.GET('/api/v1/auth/me'))).rejects.toThrow(RedirectSignal);
    expect(apiRequests[0]?.headers.get('authorization')).toBeNull();
  });

  it('sends no Authorization header without a session', async () => {
    onApi('GET', '/api/v1/auth/me', { status: 401 }, 401);
    await expect(read(api.GET('/api/v1/auth/me'))).rejects.toThrow(RedirectSignal);
    expect(apiRequests[0]?.headers.get('authorization')).toBeNull();
  });

  it('read() returns data, redirects on 401, shows not-found on 404 and throws otherwise', async () => {
    onApi('GET', '/api/v1/clients/{clientId}'.replace('{clientId}', 'ok'), { id: 'ok' });
    await expect(read(api.GET('/api/v1/clients/{clientId}', { params: { path: { clientId: 'ok' } } }))).resolves.toEqual({
      id: 'ok',
    });

    onApi('GET', '/api/v1/clients/gone', { status: 401 }, 401);
    await expect(read(api.GET('/api/v1/clients/{clientId}', { params: { path: { clientId: 'gone' } } }))).rejects.toMatchObject({
      url: '/logout?reason=expired',
    });

    onApi('GET', '/api/v1/clients/missing', { status: 404 }, 404);
    await expect(
      read(api.GET('/api/v1/clients/{clientId}', { params: { path: { clientId: 'missing' } } })),
    ).rejects.toBeInstanceOf(NotFoundSignal);

    onApi('GET', '/api/v1/clients/broken', { status: 500, code: 'INTERNAL', detail: 'An unexpected error occurred' }, 500);
    const failure = read(api.GET('/api/v1/clients/{clientId}', { params: { path: { clientId: 'broken' } } }));
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 500, message: 'An unexpected error occurred' });
  });

  it('mutate() returns results for forms and only redirects on 401', async () => {
    onApi('POST', '/api/v1/clients', { id: 'new' }, 201);
    await expect(mutate(api.POST('/api/v1/clients', { body: { name: 'A' } }))).resolves.toEqual({
      ok: true,
      data: { id: 'new' },
    });

    onApi('POST', '/api/v1/clients', { status: 409, detail: 'Taken', issues: [{ path: 'body.email', message: 'Taken' }] }, 409);
    const conflict = await mutate(api.POST('/api/v1/clients', { body: { name: 'A' } }));
    expect(conflict).toMatchObject({ ok: false, error: { status: 409, problem: { detail: 'Taken' } } });

    onApi('DELETE', '/api/v1/clients/c/movements/m', {}, 204);
    await expect(
      mutate(
        api.DELETE('/api/v1/clients/{clientId}/movements/{movementId}', { params: { path: { clientId: 'c', movementId: 'm' } } }),
      ),
    ).resolves.toMatchObject({ ok: true });

    onApi('POST', '/api/v1/clients', { status: 401 }, 401);
    await expect(mutate(api.POST('/api/v1/clients', { body: { name: 'A' } }))).rejects.toMatchObject({
      url: '/logout?reason=expired',
    });
  });
});

describe('forwardedHeaders', () => {
  const headers = (forwardedFor?: string, userAgent?: string) =>
    new Headers({ ...(forwardedFor && { 'x-forwarded-for': forwardedFor }), ...(userAgent && { 'user-agent': userAgent }) });

  it('ignores X-Forwarded-For when no proxy is trusted (it is attacker-controlled)', () => {
    expect(forwardedHeaders(headers('1.2.3.4'), 0)).toEqual({});
  });

  it('takes the entry appended by the outermost trusted proxy, not the left-most (spoofable) one', () => {
    expect(forwardedHeaders(headers('6.6.6.6, 203.0.113.7'), 1)).toEqual({ 'X-Forwarded-For': '203.0.113.7' });
    expect(forwardedHeaders(headers('6.6.6.6, 203.0.113.7, 10.0.0.2'), 2)).toEqual({ 'X-Forwarded-For': '203.0.113.7' });
    expect(forwardedHeaders(headers('2001:db8::1'), 1)).toEqual({ 'X-Forwarded-For': '2001:db8::1' });
  });

  it('drops values that are not IP addresses and chains shorter than the hop count', () => {
    expect(forwardedHeaders(headers('not-an-ip'), 1)).toEqual({});
    expect(forwardedHeaders(headers('203.0.113.7'), 2)).toEqual({});
    expect(forwardedHeaders(headers(), 1)).toEqual({});
  });

  it('forwards a truncated user agent', () => {
    expect(forwardedHeaders(headers(undefined, 'UA'), 0)).toEqual({ 'User-Agent': 'UA' });
  });
});

describe('proxyDownload', () => {
  const request = (query = '') => new NextRequest(`http://localhost:3000/exports/overview${query}`);
  const allowed = { from: dateParam, to: dateParam, sort: (value: string) => value === 'name' };

  it('redirects to login without a session', async () => {
    const res = await proxyDownload(request(), '/api/v1/reports/overview/export', allowed);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    expect(apiRequests).toHaveLength(0);
  });

  it('forwards only whitelisted, valid params and streams the file with safe headers', async () => {
    signIn();
    onApi(
      'GET',
      '/api/v1/reports/overview/export',
      new Response('a,b\r\n', {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="x.csv"' },
      }),
    );
    const res = await proxyDownload(
      request('?from=2026-01-01&to=2026-13-01&sort=name&evil=1&sort=ignored'),
      '/api/v1/reports/overview/export',
      allowed,
    );
    expect(new URL(apiRequests[0]?.url ?? '').search).toBe('?from=2026-01-01&sort=name');
    expect(apiRequests[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="x.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(await res.text()).toBe('a,b\r\n');
  });

  it('falls back to safe content headers when the API omits them', async () => {
    signIn();
    onApi('GET', '/api/v1/reports/overview/export', () => {
      const res = new Response('x');
      res.headers.delete('content-type');
      return res;
    });
    const res = await proxyDownload(request(), '/api/v1/reports/overview/export', allowed);
    expect(new URL(apiRequests[0]?.url ?? '').search).toBe('');
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="export.csv"');
  });

  it.each([
    [401, 307, null],
    [404, 404, 'Not found'],
    [500, 502, 'Export failed'],
    [422, 502, 'Export failed'],
  ])('maps API status %i to %i', async (apiStatus, status, body) => {
    signIn();
    onApi('GET', '/api/v1/reports/overview/export', { status: apiStatus }, apiStatus);
    const res = await proxyDownload(request(), '/api/v1/reports/overview/export', allowed);
    expect(res.status).toBe(status);
    if (body) expect(await res.text()).toBe(body);
    else expect(res.headers.get('location')).toBe('http://localhost:3000/logout?reason=expired');
  });

  it('treats an empty upstream body as a failure', async () => {
    signIn();
    onApi('GET', '/api/v1/reports/overview/export', new Response(null, { status: 200 }));
    expect((await proxyDownload(request(), '/api/v1/reports/overview/export', allowed)).status).toBe(502);
  });
});

describe('form helpers', () => {
  it('collects string fields and drops Next internals and files', () => {
    const data = new FormData();
    data.set('name', 'Acme');
    data.set('$ACTION_ID_abc', '');
    data.set('upload', new Blob(['x']));
    expect(formValues(data)).toEqual({ name: 'Acme' });
    expect(initialFormState).toEqual({ status: 'idle' });
  });

  it('maps Zod issues to the first message per field, with a form-level fallback', () => {
    const schema = z.object({
      name: z
        .string()
        .min(2, 'Too short')
        .regex(/^[A-Z]/, 'Capitalise'),
    });
    const result = schema.safeParse({ name: 'x' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(validationFailed(result.error, { name: 'x' })).toEqual({
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: { name: 'Too short' },
      values: { name: 'x' },
    });
    const formLevel = z
      .string()
      .refine(() => false, 'Nope')
      .safeParse('');
    if (!formLevel.success) expect(validationFailed(formLevel.error, {}).fieldErrors).toEqual({ _form: 'Nope' });
  });

  it.each([
    [429, { detail: 'Slow down' }, 'Slow down'],
    [429, {}, 'Too many attempts. Please wait and try again.'],
    [503, { detail: 'db host 10.0.0.5 unreachable' }, 'Something went wrong on our side. Please try again.'],
    [409, { detail: 'Client is archived.' }, 'Client is archived.'],
    [400, {}, 'The request could not be completed.'],
  ])('apiFailed(%i) gives a safe user message', (status, problem, message) => {
    expect(apiFailed(new ApiError({ status, ...problem }), { a: '1' })).toEqual({
      status: 'error',
      message,
      fieldErrors: {},
      values: { a: '1' },
    });
  });
});

describe('API problems', () => {
  it('uses the problem body when present and a generic one otherwise', () => {
    expect(toProblem(409, { status: 409, detail: 'x' })).toEqual({ status: 409, detail: 'x' });
    expect(toProblem(502, 'Bad gateway html')).toEqual({ status: 502, detail: 'The server could not complete the request.' });
    expect(toProblem(400, null)).toEqual({ status: 400, detail: 'Request failed.' });
    expect(new ApiError({ status: 418, title: 'Teapot' }).message).toBe('Teapot');
    expect(new ApiError({ status: 418 }).message).toBe('API request failed with status 418');
  });

  it('maps issue paths to field names', () => {
    expect(
      fieldErrorsFrom({
        status: 422,
        issues: [
          { path: 'body.email', message: 'Invalid' },
          { path: 'body.email', message: 'Second message ignored' },
          { path: 'body', message: 'Unrecognized key' },
          { path: 'query.page', message: 'Too big' },
        ],
      }),
    ).toEqual({ email: 'Invalid', _form: 'Unrecognized key', page: 'Too big' });
    expect(fieldErrorsFrom({ status: 400 })).toEqual({});
  });
});

describe('small helpers', () => {
  it('formats tones and timestamps', () => {
    expect([toneOf('1'), toneOf('-1'), toneOf('0.00')]).toEqual(['positive', 'negative', 'neutral']);
    expect(formatDateTime('2026-11-24T15:30:00Z')).toMatch(/Nov 24, 2026/);
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });

  it('keeps the fake fetch strict about unexpected calls', async () => {
    await expect(fetch('http://localhost:4000/nope')).rejects.toThrow('Unexpected API call in test: GET /nope');
    expect(json({ a: 1 }, 204).body).toBeNull();
    vi.restoreAllMocks();
  });
});
