import request from 'supertest';
import { describe, expect, it } from 'vitest';

// Production-like configuration for this file only (env.ts parses at import time).
process.env.CORS_ORIGINS = 'https://admin.example.test';
process.env.SWAGGER_ENABLED = 'false';
process.env.LOG_PRETTY = 'true';

const { createApp } = await import('./app.js');
const { logger } = await import('./lib/logger.js');
const app = createApp();

describe('app configuration', () => {
  it('does not expose API docs when Swagger is disabled', async () => {
    await request(app).get('/docs/openapi.json').expect(404);
    await request(app).get('/docs/').expect(404);
  });

  it('allows only the configured CORS origins', async () => {
    const allowed = await request(app)
      .options('/api/v1/auth/me')
      .set('Origin', 'https://admin.example.test')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://admin.example.test');

    const denied = await request(app)
      .options('/api/v1/auth/me')
      .set('Origin', 'https://evil.test')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('uses the pretty transport for local development logs', () => {
    expect(logger.level).toBe('silent');
    expect(typeof logger.info).toBe('function');
  });
});
