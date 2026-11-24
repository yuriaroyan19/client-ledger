/**
 * In-memory stand-ins for the Next.js request APIs, so server code (pages, actions, route handlers,
 * the BFF API client) can run in Vitest. Wired up in test/setup.ts and reset after every test.
 */
import { vi } from 'vitest';

/** A token with the exact shape the API issues (`cls_` + 43 base64url chars). */
export const VALID_TOKEN = `cls_${'A'.repeat(43)}`;

export class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
  }
}

interface StoredCookie {
  value: string;
  options?: Record<string, unknown>;
}

export const cookieJar = new Map<string, StoredCookie>();
export const requestHeaders = new Headers();

export const cookieStore = {
  get: (name: string) => {
    const cookie = cookieJar.get(name);
    return cookie ? { name, value: cookie.value } : undefined;
  },
  set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
    cookieJar.set(name, { value, ...(options && { options }) });
  }),
  delete: vi.fn((options: string | { name: string }) => {
    cookieJar.delete(typeof options === 'string' ? options : options.name);
  }),
};

export const nextHeaders = {
  cookies: vi.fn(async () => cookieStore),
  headers: vi.fn(async () => requestHeaders),
};

export const nextNavigation = {
  redirect: vi.fn((url: string): never => {
    throw new RedirectSignal(url);
  }),
  notFound: vi.fn((): never => {
    throw new NotFoundSignal();
  }),
  usePathname: vi.fn(() => '/'),
};

export const nextCache = { revalidatePath: vi.fn() };

// ---- API (fetch) stub ------------------------------------------------------------------------

type Handler = (request: Request) => Response | Promise<Response>;
const routes = new Map<string, Handler>();
export const apiRequests: Request[] = [];

/** Registers a fake API response for `METHOD /path` (query string ignored). */
export function onApi(method: string, path: string, handler: Handler | Response | object, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, (request) => {
    if (typeof handler === 'function') return (handler as Handler)(request);
    if (handler instanceof Response) return handler.clone();
    return json(handler, status);
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

export async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  apiRequests.push(request);
  const { pathname } = new URL(request.url);
  const handler = routes.get(`${request.method} ${pathname}`);
  if (!handler) throw new Error(`Unexpected API call in test: ${request.method} ${pathname}`);
  return handler(request);
}

export function resetNextFakes(): void {
  cookieJar.clear();
  for (const key of [...requestHeaders.keys()]) requestHeaders.delete(key);
  routes.clear();
  apiRequests.length = 0;
  nextNavigation.usePathname.mockImplementation(() => '/');
}
