import type { NextRequest } from 'next/server';
import { dateParam, proxyDownload } from '@/lib/api/download';

const SORTS = new Set(['name', 'balance_desc', 'balance_asc']);

export async function GET(request: NextRequest) {
  return proxyDownload(request, '/api/v1/reports/overview/export', {
    from: dateParam,
    to: dateParam,
    sort: (value) => SORTS.has(value),
  });
}
