// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { apiRequests, cookieJar, json, nextCache, onApi, RedirectSignal, VALID_TOKEN } from '../../test/next-fakes';
import { SESSION_COOKIE } from '@/lib/auth/session-cookie';
import { loginAction, logoutAction, logoutEverywhereAction } from './auth/actions';
import { getCurrentAdmin, hasValidSession } from './auth/session';
import { createClientAction, setClientArchivedAction, updateClientAction } from './clients/actions';
import { getClient } from './clients/queries';
import { createMovementAction, deleteMovementAction, updateMovementAction } from './movements/actions';

const CLIENT_ID = '0195f7c2-1111-7000-8000-000000000001';
const MOVEMENT_ID = '0195f7c2-2222-7000-8000-000000000002';
const idle = { status: 'idle' as const };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const bodyOf = async (index = 0) => (await apiRequests[index]?.clone().json()) as unknown;
const redirectOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RedirectSignal);
  return (error as RedirectSignal).url;
};

describe('loginAction', () => {
  const credentials = { email: ' Admin@Example.TEST ', password: 'correct horse battery' };

  it('validates input without calling the API and never echoes the password', async () => {
    const state = await loginAction(idle, form({ email: 'nope', password: '' }));
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { email: 'Enter a valid email address', password: 'Enter your password' },
    });
    expect(state.values).toEqual({ email: 'nope' });
    expect(apiRequests).toHaveLength(0);
  });

  it('stores the session cookie and redirects to a safe next path', async () => {
    onApi('POST', '/api/v1/auth/login', { token: 'cls_new', expiresAt: '2026-11-24T20:00:00.000Z', admin: {} });
    const url = await redirectOf(loginAction(idle, form({ ...credentials, next: '/reports?range=this-year' })));
    expect(url).toBe('/reports?range=this-year');
    expect(await bodyOf()).toEqual({ email: 'admin@example.test', password: 'correct horse battery' });
    expect(cookieJar.get(SESSION_COOKIE)).toMatchObject({
      value: 'cls_new',
      options: { expires: new Date('2026-11-24T20:00:00.000Z') },
    });
  });

  it('ignores unsafe next paths', async () => {
    onApi('POST', '/api/v1/auth/login', { token: 'cls_new', expiresAt: '2026-11-24T20:00:00.000Z', admin: {} });
    expect(await redirectOf(loginAction(idle, form({ ...credentials, next: '//evil.test' })))).toBe('/clients');
  });

  it('shows one generic message for bad credentials', async () => {
    onApi('POST', '/api/v1/auth/login', { status: 401, detail: 'Invalid email or password' }, 401);
    expect(await loginAction(idle, form(credentials))).toEqual({
      status: 'error',
      message: 'Invalid email or password.',
      values: { email: credentials.email },
    });
    expect(cookieJar.size).toBe(0);
  });

  it('surfaces rate limiting', async () => {
    onApi('POST', '/api/v1/auth/login', { status: 429, detail: 'Too many login attempts. Please try again later.' }, 429);
    expect(await loginAction(idle, form(credentials))).toMatchObject({
      message: 'Too many login attempts. Please try again later.',
    });
  });
});

describe('logout actions', () => {
  it.each([
    [logoutAction, '/api/v1/auth/logout', '/login?reason=signed-out'],
    [logoutEverywhereAction, '/api/v1/auth/logout-all', '/login?reason=signed-out-everywhere'],
  ])('revokes server-side, clears the cookie and redirects', async (action, path, target) => {
    cookieJar.set(SESSION_COOKIE, { value: VALID_TOKEN });
    onApi('POST', path, {}, 204);
    expect(await redirectOf(action())).toBe(target);
    expect(apiRequests[0]?.headers.get('authorization')).toBe(`Bearer ${VALID_TOKEN}`);
    expect(cookieJar.size).toBe(0);
  });

  it.each([
    [logoutAction, '/api/v1/auth/logout', '/login?reason=signed-out'],
    [logoutEverywhereAction, '/api/v1/auth/logout-all', '/login?reason=signed-out-everywhere'],
  ])('still clears the cookie when the API is unreachable', async (action, path, target) => {
    cookieJar.set(SESSION_COOKIE, { value: VALID_TOKEN });
    onApi('POST', path, () => Promise.reject(new TypeError('fetch failed')));
    expect(await redirectOf(action())).toBe(target);
    expect(cookieJar.size).toBe(0);
  });
});

describe('session helpers', () => {
  it('hasValidSession is false without a cookie (no API call) and mirrors the API otherwise', async () => {
    expect(await hasValidSession()).toBe(false);
    expect(apiRequests).toHaveLength(0);
    cookieJar.set(SESSION_COOKIE, { value: VALID_TOKEN });
    onApi('GET', '/api/v1/auth/me', { id: 'a', email: 'a@test.local', name: 'A' });
    expect(await hasValidSession()).toBe(true);
    onApi('GET', '/api/v1/auth/me', { status: 401 }, 401);
    expect(await hasValidSession()).toBe(false);
  });

  it('getCurrentAdmin and getClient read through the API', async () => {
    onApi('GET', '/api/v1/auth/me', { id: 'a', email: 'a@test.local', name: 'A' });
    onApi('GET', `/api/v1/clients/${CLIENT_ID}`, { id: CLIENT_ID, name: 'Acme' });
    expect(await getCurrentAdmin()).toMatchObject({ name: 'A' });
    expect(await getClient(CLIENT_ID)).toMatchObject({ name: 'Acme' });
  });
});

describe('client actions', () => {
  const valid = { name: '  Acme  ', email: 'Billing@Acme.TEST', phone: '', notes: '' };

  it('creates a client with normalised fields and redirects to it', async () => {
    onApi('POST', '/api/v1/clients', { id: CLIENT_ID }, 201);
    expect(await redirectOf(createClientAction(idle, form(valid)))).toBe(`/clients/${CLIENT_ID}?created=1`);
    expect(await bodyOf()).toEqual({ name: 'Acme', email: 'billing@acme.test', phone: null, notes: null });
  });

  it('returns field errors from local validation and from the API', async () => {
    expect(await createClientAction(idle, form({ name: '' }))).toMatchObject({
      fieldErrors: { name: 'Name is required' },
      values: { name: '' },
    });
    onApi(
      'POST',
      '/api/v1/clients',
      { status: 409, detail: 'Email in use', issues: [{ path: 'body.email', message: 'Email in use' }] },
      409,
    );
    expect(await createClientAction(idle, form(valid))).toMatchObject({
      status: 'error',
      message: 'Email in use',
      fieldErrors: { email: 'Email in use' },
    });
  });

  it('updates a client, revalidates its page and rejects unknown ids', async () => {
    expect(await updateClientAction('../admins', idle, form(valid))).toEqual({ status: 'error', message: 'Unknown client.' });
    expect(await updateClientAction(CLIENT_ID, idle, form({ name: '' }))).toMatchObject({
      fieldErrors: { name: 'Name is required' },
    });
    expect(apiRequests).toHaveLength(0);

    onApi('PATCH', `/api/v1/clients/${CLIENT_ID}`, { id: CLIENT_ID });
    expect(await redirectOf(updateClientAction(CLIENT_ID, idle, form({ ...valid, phone: '+1 555 0100' })))).toBe(
      `/clients/${CLIENT_ID}?updated=1`,
    );
    expect(await bodyOf()).toEqual({ name: 'Acme', email: 'billing@acme.test', phone: '+1 555 0100', notes: null });
    expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`);

    onApi('PATCH', `/api/v1/clients/${CLIENT_ID}`, { status: 500 }, 500);
    expect(await updateClientAction(CLIENT_ID, idle, form(valid))).toMatchObject({
      message: 'Something went wrong on our side. Please try again.',
    });
  });

  it.each([
    [true, 'archive'],
    [false, 'restore'],
  ])('archived=%s calls /%s and revalidates', async (archived, endpoint) => {
    onApi('POST', `/api/v1/clients/${CLIENT_ID}/${endpoint}`, { id: CLIENT_ID });
    await setClientArchivedAction(CLIENT_ID, archived);
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/clients');
    expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`);
  });

  it('archive rejects invalid ids and propagates API failures', async () => {
    await expect(setClientArchivedAction('nope', true)).rejects.toThrow();
    onApi('POST', `/api/v1/clients/${CLIENT_ID}/archive`, { status: 404, detail: 'Client not found' }, 404);
    await expect(setClientArchivedAction(CLIENT_ID, true)).rejects.toMatchObject({ status: 404 });
  });
});

describe('movement actions', () => {
  const valid = { type: 'EXPENSE', amount: '1,250.50', occurredOn: '2026-11-24', description: ' Hosting ' };

  it('creates a movement and keeps type and date for the next entry', async () => {
    onApi('POST', `/api/v1/clients/${CLIENT_ID}/movements`, { id: MOVEMENT_ID, amount: '1250.50' }, 201);
    expect(await createMovementAction(CLIENT_ID, idle, form(valid))).toEqual({
      status: 'success',
      message: 'Expense of $1,250.50 recorded.',
      values: { type: 'EXPENSE', occurredOn: '2026-11-24' },
    });
    expect(await bodyOf()).toEqual({ type: 'EXPENSE', amount: '1250.50', occurredOn: '2026-11-24', description: 'Hosting' });
    expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`);

    onApi('POST', `/api/v1/clients/${CLIENT_ID}/movements`, { id: MOVEMENT_ID, amount: '5.00' }, 201);
    expect(await createMovementAction(CLIENT_ID, idle, form({ ...valid, type: 'EARNING', amount: '5' }))).toMatchObject({
      message: 'Earning of $5.00 recorded.',
    });
  });

  it('rejects unknown clients, invalid input and API errors without losing what was typed', async () => {
    expect(await createMovementAction('x', idle, form(valid))).toEqual({ status: 'error', message: 'Unknown client.' });
    expect(await createMovementAction(CLIENT_ID, idle, form({ ...valid, amount: '12,50' }))).toMatchObject({
      fieldErrors: { amount: 'Enter an amount like 1250.50 (use a dot for decimals)' },
      values: { amount: '12,50' },
    });
    onApi('POST', `/api/v1/clients/${CLIENT_ID}/movements`, { status: 409, detail: 'Client is archived.' }, 409);
    expect(await createMovementAction(CLIENT_ID, idle, form(valid))).toMatchObject({
      message: 'Client is archived.',
      values: { description: ' Hosting ' },
    });
  });

  it('updates a movement and returns to the client page', async () => {
    expect(await updateMovementAction(CLIENT_ID, 'nope', idle, form(valid))).toEqual({
      status: 'error',
      message: 'Unknown movement.',
    });
    expect(await updateMovementAction(CLIENT_ID, MOVEMENT_ID, idle, form({ ...valid, occurredOn: '2026-02-30' }))).toMatchObject({
      fieldErrors: { occurredOn: 'Enter a valid date' },
    });
    onApi('PATCH', `/api/v1/clients/${CLIENT_ID}/movements/${MOVEMENT_ID}`, { status: 404, detail: 'Movement not found' }, 404);
    expect(await updateMovementAction(CLIENT_ID, MOVEMENT_ID, idle, form(valid))).toMatchObject({
      message: 'Movement not found',
    });

    onApi('PATCH', `/api/v1/clients/${CLIENT_ID}/movements/${MOVEMENT_ID}`, { id: MOVEMENT_ID });
    expect(await redirectOf(updateMovementAction(CLIENT_ID, MOVEMENT_ID, idle, form(valid)))).toBe(
      `/clients/${CLIENT_ID}?movement=updated`,
    );
  });

  it('deletes idempotently (404 is fine) but surfaces other failures', async () => {
    await expect(deleteMovementAction(CLIENT_ID, 'nope')).rejects.toThrow('Unknown movement.');
    const url = `/api/v1/clients/${CLIENT_ID}/movements/${MOVEMENT_ID}`;
    onApi('DELETE', url, {}, 204);
    await deleteMovementAction(CLIENT_ID, MOVEMENT_ID);
    onApi('DELETE', url, () => json({ status: 404 }, 404));
    await deleteMovementAction(CLIENT_ID, MOVEMENT_ID);
    expect(nextCache.revalidatePath).toHaveBeenCalledTimes(2);
    onApi('DELETE', url, { status: 409, detail: 'Client is archived.' }, 409);
    await expect(deleteMovementAction(CLIENT_ID, MOVEMENT_ID)).rejects.toMatchObject({ status: 409 });
  });
});
