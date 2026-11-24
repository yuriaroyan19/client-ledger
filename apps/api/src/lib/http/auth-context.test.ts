import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { logPrismaEvent } from '../prisma.js';
import { logger } from '../logger.js';
import { httpSerializers } from '../../middleware/request-logger.js';
import { actorFrom, requestIdOf, setAuth } from './auth-context.js';

const fakeRequest = (fields: Record<string, unknown>, headers: Record<string, string> = {}) =>
  ({ ...fields, get: (name: string) => headers[name.toLowerCase()] }) as unknown as Request;

describe('request identity', () => {
  it('stringifies string and numeric request ids and ignores anything else', () => {
    expect(requestIdOf(fakeRequest({ id: 'abc' }))).toBe('abc');
    expect(requestIdOf(fakeRequest({ id: 42 }))).toBe('42');
    expect(requestIdOf(fakeRequest({ id: { evil: true } }))).toBeUndefined();
    expect(requestIdOf(fakeRequest({}))).toBeUndefined();
  });

  it('builds an anonymous actor with nulls for missing data', () => {
    expect(actorFrom(fakeRequest({}))).toEqual({ adminId: null, ip: null, requestId: null, userAgent: null });
  });

  it('builds an authenticated actor and truncates long user agents', () => {
    const req = fakeRequest({ id: 'req-1', ip: '203.0.113.9' }, { 'user-agent': 'x'.repeat(2000) });
    setAuth(req, { admin: { id: 'admin-1', email: 'a@test.local', name: 'A' }, sessionId: 's-1' });
    const actor = actorFrom(req);
    expect(actor).toMatchObject({ adminId: 'admin-1', ip: '203.0.113.9', requestId: 'req-1' });
    expect(actor.userAgent).toHaveLength(512);
  });
});

describe('logging helpers', () => {
  it('serialises only safe request and response fields (never headers or bodies)', () => {
    const req = {
      id: 'r',
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '::1',
      headers: { authorization: 'Bearer x' },
      body: { password: 'p' },
    };
    expect(httpSerializers.req(req)).toEqual({ id: 'r', method: 'POST', url: '/api/v1/auth/login', remoteAddress: '::1' });
    // Query strings carry search terms (client names, emails): never logged.
    const search = { ...req, url: '/api/v1/clients?search=jane%40acme.test&page=2' };
    expect(httpSerializers.req(search).url).toBe('/api/v1/clients');
    expect(httpSerializers.res({ statusCode: 201, headers: { 'set-cookie': 'x' } } as { statusCode: number })).toEqual({
      statusCode: 201,
    });
  });

  it('forwards Prisma warnings and errors to the logger', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    logPrismaEvent.warn({ message: 'slow' });
    logPrismaEvent.error({ message: 'boom' });
    expect(warn).toHaveBeenCalledWith({ prisma: { message: 'slow' } }, 'prisma warning');
    expect(error).toHaveBeenCalledWith({ prisma: { message: 'boom' } }, 'prisma error');
    vi.restoreAllMocks();
  });
});
