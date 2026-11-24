import 'server-only';
import { cache } from 'react';
import { api, read } from '@/lib/api/client';

/** Deduped per request, so generateMetadata and the page share one API call. */
export const getClient = cache(async (clientId: string) =>
  read(api.GET('/api/v1/clients/{clientId}', { params: { path: { clientId } } })),
);
