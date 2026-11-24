import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/error-handler.js';
import { requestLogger } from '../../middleware/request-logger.js';
import { generateOpenApiDocument } from '../../docs/openapi.js';
import { z } from '../zod.js';
import { ApiRouter, toOpenApiPath } from './api-router.js';

function buildApp() {
  const api = new ApiRouter('/t');
  api.route({
    method: 'post',
    path: '/items/:itemId',
    operationId: 'testCreateItem',
    summary: 'test',
    tags: ['Test'],
    auth: false,
    request: {
      params: z.object({ itemId: z.uuid() }),
      query: z.object({ dryRun: z.enum(['true', 'false']).default('false') }),
      body: z.strictObject({ name: z.string().min(1) }),
    },
    responses: { 200: { description: 'ok' } },
    handler: ({ params, query, body, res }) => {
      res.json({ params, query, body });
    },
  });
  api.route({
    method: 'get',
    path: '/private',
    operationId: 'testPrivate',
    summary: 'test',
    tags: ['Test'],
    responses: { 200: { description: 'ok' } },
    handler: ({ res }) => {
      res.json({ ok: true });
    },
  });
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use('/t', api.router);
  app.use(errorHandler);
  return app;
}

const ITEM_ID = '0192d1e4-5b6a-7c8d-9e0f-112233445566';

describe('ApiRouter', () => {
  it('passes validated, transformed input to the handler', async () => {
    const res = await request(buildApp()).post(`/t/items/${ITEM_ID}`).send({ name: 'x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { itemId: ITEM_ID }, query: { dryRun: 'false' }, body: { name: 'x' } });
  });

  it('reports every invalid location at once as a 422 problem', async () => {
    const res = await request(buildApp()).post('/t/items/not-a-uuid?dryRun=maybe').send({ name: '', extra: true });
    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const paths = (res.body as { issues: Array<{ path: string }> }).issues.map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['params.itemId', 'query.dryRun', 'body.name', 'body']));
  });

  it('rejects malformed JSON with 400 without leaking parser details', async () => {
    const res = await request(buildApp()).post(`/t/items/${ITEM_ID}`).set('content-type', 'application/json').send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'BAD_REQUEST', detail: 'Malformed JSON body' });
    expect(JSON.stringify(res.body)).not.toContain('SyntaxError');
  });

  it('requires authentication by default', async () => {
    const res = await request(buildApp()).get('/t/private');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects malformed bearer tokens without a database lookup', async () => {
    const res = await request(buildApp()).get('/t/private').set('authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('echoes safe request ids and replaces unsafe ones', async () => {
    const safe = await request(buildApp()).get('/t/private').set('x-request-id', 'trace-12345678');
    expect(safe.headers['x-request-id']).toBe('trace-12345678');
    const unsafe = await request(buildApp()).get('/t/private').set('x-request-id', '<script>');
    expect(unsafe.headers['x-request-id']).not.toBe('<script>');
  });
});

describe('ApiRouter edge cases', () => {
  it('validates a missing body as an empty object', async () => {
    const res = await request(buildApp()).post(`/t/items/${ITEM_ID}`);
    expect(res.status).toBe(422);
    expect(res.body.issues).toEqual([expect.objectContaining({ path: 'body.name' })]);
  });

  it('documents default error responses without overriding declared ones', () => {
    const api = new ApiRouter('/doc');
    api.route({
      method: 'post',
      path: '/custom',
      operationId: 'testCustomResponses',
      summary: 'test',
      tags: ['Test'],
      request: { body: z.strictObject({ a: z.string() }) },
      responses: { 200: { description: 'ok' }, 422: { description: 'Custom validation description' } },
      handler: ({ res }) => {
        res.json({});
      },
    });
    const operation = generateOpenApiDocument().paths?.['/doc/custom']?.post;
    expect(operation?.responses?.['422']).toEqual({ description: 'Custom validation description' });
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '401', '422', '429', '500']);
    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
  });
});

describe('toOpenApiPath', () => {
  it('converts express params', () => {
    expect(toOpenApiPath('/clients/:clientId/movements/:movementId')).toBe('/clients/{clientId}/movements/{movementId}');
  });
});
