/** Container healthcheck. Intentionally does not call the API (that has its own probe). */
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
