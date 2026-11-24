import { NextResponse, type NextRequest } from 'next/server';
import { hasValidSession } from '@/features/auth/session';
import { clearSessionToken } from '@/lib/auth/session-cookie';

/**
 * Landing point when the API reports an expired session (see `read()` in lib/api/client.ts).
 * It only clears the cookie if the session really is invalid, so a cross-site link to this URL
 * cannot log a user out (logout CSRF). Deliberate sign-out uses a POST Server Action instead.
 */
export async function GET(request: NextRequest) {
  if (await hasValidSession()) return NextResponse.redirect(new URL('/clients', request.url));
  await clearSessionToken();
  return NextResponse.redirect(new URL('/login?reason=expired', request.url));
}
