import type { RequestHandler } from 'express';
import { RateLimitedError, UnauthenticatedError } from '../lib/errors.js';
import { bearerTokenOf, setAuth } from '../lib/http/auth-context.js';
import { sessionService } from '../modules/auth/session.service.js';
import { authFailureLimit } from './rate-limit.js';

/**
 * Resolves `Authorization: Bearer <session token>` into an authenticated admin.
 * Every failure mode returns the same 401 so callers learn nothing about why.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = bearerTokenOf(req);
  if (!token) throw new UnauthenticatedError();

  // Too many failed checks from this IP: only sessions we recently saw as valid may reach the database.
  const ip = String(req.ip);
  if (!sessionService.wasRecentlyValid(token) && (await authFailureLimit.isExceeded(ip))) {
    throw new RateLimitedError('Too many invalid session attempts. Please try again later.');
  }

  const auth = await sessionService.validate(token);
  if (!auth) {
    await authFailureLimit.recordFailure(ip);
    throw new UnauthenticatedError('Session is invalid or has expired');
  }

  setAuth(req, auth);
  next();
};
