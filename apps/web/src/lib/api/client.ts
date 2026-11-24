import 'server-only';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import createClient, { type Middleware } from 'openapi-fetch';
import { getSessionToken } from '@/lib/auth/session-cookie';
import { serverEnv } from '@/lib/env';
import { forwardedHeaders } from './forwarded';
import { ApiError, toProblem } from './problem';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];

/**
 * Backend-for-frontend client. Runs only on the server: it reads the httpOnly session cookie
 * and calls the API with a bearer token, so the browser never talks to — or authenticates
 * against — the API directly. Types come from the API's OpenAPI document (`npm run api:types`).
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await getSessionToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);

    for (const [name, value] of Object.entries(forwardedHeaders(await headers(), serverEnv.TRUSTED_PROXY_HOPS))) {
      request.headers.set(name, value);
    }
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: serverEnv.API_URL, cache: 'no-store' });
api.use(authMiddleware);

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * For reads in Server Components: returns data, or navigates on auth/404 errors.
 *  - 401 → /logout?reason=expired (clears the stale cookie, then shows the login page)
 *  - 404 → the nearest not-found boundary
 *  - anything else → throws to the nearest error boundary
 */
export async function read<T>(request: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (response.ok && data !== undefined) return data;
  if (response.status === 401) redirect('/logout?reason=expired');
  if (response.status === 404) notFound();
  throw new ApiError(toProblem(response.status, error));
}

/**
 * For mutations in Server Actions: never throws for expected API errors so forms can show them.
 * A 401 still redirects to the login page.
 */
export async function mutate<T>(request: Promise<Result<T>>): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const { data, error, response } = await request;
  if (response.status === 401) redirect('/logout?reason=expired');
  if (response.ok) return { ok: true, data: data as T };
  return { ok: false, error: new ApiError(toProblem(response.status, error)) };
}
