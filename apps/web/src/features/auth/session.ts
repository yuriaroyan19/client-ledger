import 'server-only';
import { cache } from 'react';
import { api, read } from '@/lib/api/client';
import { getSessionToken } from '@/lib/auth/session-cookie';

/**
 * The signed-in admin for this request. `cache` dedupes the API call across the layout,
 * pages and generateMetadata within a single render.
 */
export const getCurrentAdmin = cache(async () => read(api.GET('/api/v1/auth/me')));

/** Non-redirecting check used by public pages (login) and the logout handler. */
export async function hasValidSession(): Promise<boolean> {
  if (!(await getSessionToken())) return false;
  const { response } = await api.GET('/api/v1/auth/me');
  return response.ok;
}
