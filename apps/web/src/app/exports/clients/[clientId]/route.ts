import type { NextRequest } from 'next/server';
import { UuidSchema } from '@/features/clients/schemas';
import { dateParam, proxyDownload } from '@/lib/api/download';

export async function GET(request: NextRequest, { params }: RouteContext<'/exports/clients/[clientId]'>) {
  const { clientId } = await params;
  if (!UuidSchema.safeParse(clientId).success) return new Response('Not found', { status: 404 });
  return proxyDownload(request, `/api/v1/clients/${clientId}/report/export`, { from: dateParam, to: dateParam });
}
