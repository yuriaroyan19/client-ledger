import type { RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors.js';
import { setAuth } from '../lib/http/auth-context.js';
import { sessionService } from '../modules/auth/session.service.js';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Resolves `Authorization: Bearer <session token>` into an authenticated admin.
 * Every failure mode returns the same 401 so callers learn nothing about why.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
  if (!token) throw new UnauthenticatedError();

  const auth = await sessionService.validate(token);
  if (!auth) throw new UnauthenticatedError('Session is invalid or has expired');

  setAuth(req, auth);
  next();
};
