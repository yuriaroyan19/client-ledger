import 'server-only';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';
import { isWellFormedSessionToken, SESSION_COOKIE_NAMES } from './constants';

/**
 * The API session token lives ONLY in an httpOnly cookie: page JavaScript can never read it,
 * so XSS cannot exfiltrate it. With Secure enabled we use the `__Host-` prefix, which forces
 * Secure + Path=/ + no Domain (blocks cookie injection from sibling subdomains).
 */
export const SESSION_COOKIE = serverEnv.COOKIE_SECURE ? SESSION_COOKIE_NAMES.secure : SESSION_COOKIE_NAMES.insecure;

/** The session token, or undefined when missing or malformed (a malformed one is never sent to the API). */
export async function getSessionToken(): Promise<string | undefined> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return isWellFormedSessionToken(value) ? value : undefined;
}

export async function setSessionToken(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: serverEnv.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', secure: serverEnv.COOKIE_SECURE, httpOnly: true, sameSite: 'lax' });
}
