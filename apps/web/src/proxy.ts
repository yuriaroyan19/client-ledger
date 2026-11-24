import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, SESSION_COOKIE_NAMES } from '@/lib/auth/constants';

/**
 * Runs before every page request:
 *  1. Optimistic auth gate — no session cookie ⇒ redirect to /login. (The real check is the API
 *     validating the token on every call; this only avoids rendering protected pages for nobody.)
 *  2. Per-request nonce-based Content-Security-Policy (blocks injected scripts — XSS defence in depth).
 */
function buildCsp(nonce: string, isHttps: boolean): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Only meaningful (and only safe) when the site is served over HTTPS.
    ...(isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAMES.secure) || request.cookies.has(SESSION_COOKIE_NAMES.insecure);

  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isHttps = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = buildCsp(nonce, isHttps);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Skip static assets and metadata files; they need neither auth nor a nonce.
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
