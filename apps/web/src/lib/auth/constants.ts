/** Shared by server code and the edge-safe proxy (which cannot import `server-only` modules). */
export const SESSION_COOKIE_NAMES = { secure: '__Host-cl_session', insecure: 'cl_session' } as const;

/** Routes reachable without a session. Everything else requires one. */
export const PUBLIC_PATHS = ['/login', '/logout', '/api/health'] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const INTERNAL_ORIGIN = 'http://internal.invalid';
// Control characters, spaces and backslashes: URL parsers strip or reinterpret them
// (e.g. "/<TAB>/evil.test" becomes "//evil.test"), which is how prefix checks get bypassed.
const UNSAFE_PATH_CHARS = /[\u0000- \u007f\\]/;

/**
 * Only same-site relative paths are allowed as post-login redirects (prevents open redirects
 * such as `?next=https://evil.test`, `?next=//evil.test` or `?next=/%09/evil.test`).
 * The value is re-serialised from a parsed URL, so what we return is exactly what we checked.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/clients'): string {
  if (!value || value.length > 2048 || !value.startsWith('/') || UNSAFE_PATH_CHARS.test(value)) return fallback;
  const url = new URL(value, INTERNAL_ORIGIN);
  if (url.origin !== INTERNAL_ORIGIN || isPublicPath(url.pathname)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
