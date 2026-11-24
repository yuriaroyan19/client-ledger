import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

// Unit project: DATABASE_URL points at a port nothing listens on, so readiness must fail cleanly.
describe('health probes and app wiring', () => {
  const app = createApp();

  it('liveness does not depend on the database', async () => {
    const res = await request(app).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number) });
  });

  it('readiness reports 503 when the database is unreachable', async () => {
    const res = await request(app).get('/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'unavailable', uptimeSeconds: expect.any(Number) });
  });

  it('serves the OpenAPI document when Swagger is enabled', async () => {
    const res = await request(app).get('/docs/openapi.json').expect(200);
    expect(res.body).toMatchObject({ openapi: expect.stringMatching(/^3\./), paths: expect.any(Object) });
  });

  it('marks API responses as non-cacheable and hides the framework', async () => {
    const res = await request(app).get('/api/v1/auth/me').expect(401);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
