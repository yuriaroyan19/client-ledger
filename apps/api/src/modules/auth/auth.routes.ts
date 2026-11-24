import type { ApiRouter } from '../../lib/http/api-router.js';
import { loginRateLimitByEmail, loginRateLimitByIp } from '../../middleware/rate-limit.js';
import { AdminSchema, LoginBodySchema, LogoutAllResponseSchema, SessionSchema } from './auth.schemas.js';
import { authService } from './auth.service.js';

export function registerAuthRoutes(api: ApiRouter): void {
  api.route({
    method: 'post',
    path: '/auth/login',
    operationId: 'login',
    summary: 'Sign in as an administrator',
    description: 'Rate limited per IP and per account. Returns an opaque session token.',
    tags: ['Auth'],
    auth: false,
    middleware: [loginRateLimitByIp, loginRateLimitByEmail],
    request: { body: LoginBodySchema },
    responses: {
      200: { description: 'Signed in', schema: SessionSchema },
      401: { description: 'Invalid email or password' },
    },
    handler: async ({ body, actor, res }) => {
      res.json(await authService.login(body.email, body.password, actor));
    },
  });

  api.route({
    method: 'get',
    path: '/auth/me',
    operationId: 'getCurrentAdmin',
    summary: 'Get the signed-in administrator',
    tags: ['Auth'],
    responses: { 200: { description: 'Current admin', schema: AdminSchema } },
    handler: ({ auth, res }) => {
      res.json(auth.admin);
    },
  });

  api.route({
    method: 'post',
    path: '/auth/logout',
    operationId: 'logout',
    summary: 'Revoke the current session',
    tags: ['Auth'],
    responses: { 204: { description: 'Signed out' } },
    handler: async ({ auth, actor, res }) => {
      await authService.logout(auth, actor);
      res.status(204).end();
    },
  });

  api.route({
    method: 'post',
    path: '/auth/logout-all',
    operationId: 'logoutAll',
    summary: 'Revoke every session of the current administrator',
    tags: ['Auth'],
    responses: { 200: { description: 'All sessions revoked', schema: LogoutAllResponseSchema } },
    handler: async ({ auth, actor, res }) => {
      res.json({ revokedSessions: await authService.logoutAll(auth, actor) });
    },
  });
}
