import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, ConflictError } from '../lib/errors.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { requestLogger } from './request-logger.js';

/** Mounts a route that fails with `error` and runs it through the real error middleware. */
function appThrowing(error: unknown, options: { afterHeaders?: boolean } = {}) {
  const app = express();
  app.use(requestLogger);
  app.use(express.json({ limit: '16b' }));
  app.post('/json', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/fail', (_req, res) => {
    if (options.afterHeaders) res.status(200).write('partial');
    throw error;
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db said no: secret table detail', { code, clientVersion: 'test' });

describe('errorHandler', () => {
  it('maps AppError subclasses to their status with a problem body', async () => {
    const res = await request(appThrowing(new ConflictError('Already archived')))
      .get('/fail')
      .expect(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'CONFLICT',
      detail: 'Already archived',
    });
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it.each([
    ['P2025', 404, 'NOT_FOUND', 'Resource not found'],
    ['P2002', 409, 'CONFLICT', 'A record with the same unique value already exists'],
  ])('maps Prisma %s without leaking the database message', async (code, status, errorCode, detail) => {
    const res = await request(appThrowing(prismaError(code)))
      .get('/fail')
      .expect(status);
    expect(res.body).toMatchObject({ code: errorCode, detail });
    expect(JSON.stringify(res.body)).not.toContain('secret table');
  });

  it('falls back to a generic title for non-standard status codes', async () => {
    const res = await request(appThrowing(new AppError(599, 'INTERNAL', 'odd')))
      .get('/fail')
      .expect(599);
    expect(res.body).toMatchObject({ title: 'Error', status: 599 });
  });

  it('treats other Prisma errors as unexpected', async () => {
    const res = await request(appThrowing(prismaError('P2003')))
      .get('/fail')
      .expect(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL', detail: 'An unexpected error occurred' });
    expect(JSON.stringify(res.body)).not.toContain('secret table');
  });

  it('hides the message of unexpected errors, including non-Error throws', async () => {
    const res = await request(appThrowing(new Error('password=hunter2 at db.internal:5432')))
      .get('/fail')
      .expect(500);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL',
      detail: 'An unexpected error occurred',
      requestId: expect.any(String),
    });
    await request(appThrowing('a string')).get('/fail').expect(500);
    await request(appThrowing({ type: 'some.other.type' }))
      .get('/fail')
      .expect(500);
  });

  it('maps body-parser failures', async () => {
    const app = appThrowing(new Error('unused'));
    const malformed = await request(app).post('/json').set('Content-Type', 'application/json').send('{"a":').expect(400);
    expect(malformed.body).toMatchObject({ code: 'BAD_REQUEST', detail: 'Malformed JSON body' });

    const large = await request(app)
      .post('/json')
      .send({ data: 'x'.repeat(64) })
      .expect(413);
    expect(large.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });

    const charset = await request(app)
      .post('/json')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}')
      .expect(415);
    expect(charset.body).toMatchObject({ detail: 'Unsupported request encoding' });

    const encoding = await request(app)
      .post('/json')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}')
      .expect(415);
    expect(encoding.body).toMatchObject({ detail: 'Unsupported request encoding' });
  });

  it('terminates the connection when the response is already streaming', async () => {
    await expect(request(appThrowing(new Error('mid-stream'), { afterHeaders: true })).get('/fail')).rejects.toThrow();
  });

  it('returns a problem for unknown routes', async () => {
    const res = await request(appThrowing(new Error('unused')))
      .get('/nope?x=1')
      .expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', detail: 'Route GET /nope not found' });
  });
});
