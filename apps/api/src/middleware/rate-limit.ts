import { MemoryStore, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env.js';
import { RateLimitedError } from '../lib/errors.js';

/**
 * In-memory stores are fine for a single API instance. When scaling horizontally,
 * plug a shared store (e.g. `rate-limit-redis`) into `store` — see docs/security.md.
 */
const common: Partial<Options> = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new RateLimitedError()),
};

const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60_000;

const stores = { global: new MemoryStore(), loginByIp: new MemoryStore(), loginByEmail: new MemoryStore() };

/** Test-only hook: rate-limit state is process-wide and would otherwise leak between tests. */
export function resetRateLimits(): void {
  for (const store of Object.values(stores)) void store.resetAll();
}

/** Coarse global limiter against floods. */
export const globalRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  store: stores.global,
  limit: env.RATE_LIMIT_GLOBAL_MAX_PER_MINUTE,
  skip: (req) => req.path.startsWith('/health'),
});

/** Login attempts per client IP (credential stuffing from one source). */
export const loginRateLimitByIp = rateLimit({
  ...common,
  windowMs,
  store: stores.loginByIp,
  limit: env.RATE_LIMIT_LOGIN_MAX_PER_IP,
  handler: (_req, _res, next) => next(new RateLimitedError('Too many login attempts. Please try again later.')),
});

/** FAILED login attempts per target account (distributed brute force against one admin). */
export const loginRateLimitByEmail = rateLimit({
  ...common,
  windowMs,
  store: stores.loginByEmail,
  limit: env.RATE_LIMIT_LOGIN_MAX_FAILURES_PER_EMAIL,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
    return `email:${typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : 'invalid'}`;
  },
  handler: (_req, _res, next) => next(new RateLimitedError('Too many failed login attempts. Please try again later.')),
});
