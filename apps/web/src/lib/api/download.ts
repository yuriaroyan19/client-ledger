import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionToken } from '@/lib/auth/session-cookie';
import { isValidDateOnly } from '@/lib/date-range';
import { serverEnv } from '@/lib/env';
import { forwardedHeaders } from './forwarded';

/**
 * Streams a file (CSV) from the API to the browser without buffering it in memory.
 * Only whitelisted, validated query params are forwarded — never the raw query string.
 */
export async function proxyDownload(request: NextRequest, apiPath: string, allowed: Record<string, (value: string) => boolean>) {
  const token = await getSessionToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const query = new URLSearchParams();
  for (const [key, isValid] of Object.entries(allowed)) {
    const value = request.nextUrl.searchParams.get(key);
    if (value && isValid(value)) query.set(key, value);
  }

  const upstream = await fetch(`${serverEnv.API_URL}${apiPath}${query.size ? `?${query}` : ''}`, {
    headers: { ...forwardedHeaders(request.headers, serverEnv.TRUSTED_PROXY_HOPS), Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (upstream.status === 401) return NextResponse.redirect(new URL('/logout?reason=expired', request.url));
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(upstream.status === 404 ? 'Not found' : 'Export failed', {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="export.csv"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const dateParam = (value: string) => isValidDateOnly(value);
