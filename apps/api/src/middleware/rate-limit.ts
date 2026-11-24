import { MemoryStore, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env.js';
import { RateLimitedError } from '../lib/errors.js';
import { bearerTokenOf, getAuth } from '../lib/http/auth-context.js';
import { isWellFormedSessionToken } from '../modules/auth/session-token.js';
import { sessionService } from '../modules/auth/session.service.js';

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

const stores = {
  anonymous: new MemoryStore(),
  session: new MemoryStore(),
  loginByIp: new MemoryStore(),
  loginByEmail: new MemoryStore(),
  authFailures: new MemoryStore(),
};
// Used directly (not through the middleware factory), so it needs its window set here.
stores.authFailures.init({ windowMs: 60_000 } as Options);

/** Test-only hook: rate-limit state is process-wide and would otherwise leak between tests. */
export function resetRateLimits(): void {
  for (const store of Object.values(stores)) void store.resetAll();
  sessionService.forgetRecentlyValid();
}

/**
 * Failed session-token checks per IP. Well-formed forged tokens skip the anonymous limiter and never
 * reach the per-session one, so without this a fake-cookie loop could hammer the database freely.
 * Once an IP is over budget, `authenticate` refuses tokens this API hasn't recently seen as valid
 * BEFORE the database lookup. Real admins behind the same IP (the web container) keep working, because
 * their sessions were issued or validated recently.
 */
export const authFailureLimit = {
  async isExceeded(ip: string): Promise<boolean> {
    const hits = (await stores.authFailures.get(ip))?.totalHits ?? 0;
    return hits >= env.RATE_LIMIT_AUTH_FAILURES_PER_MINUTE;
  },
  async recordFailure(ip: string): Promise<void> {
    await stores.authFailures.increment(ip);
  },
};

/**
 * Per-IP limit for requests WITHOUT a well-formed session token. All browser traffic reaches the
 * API from the web container's single IP, so signed-in requests must not share this bucket:
 * otherwise one client (even with a fake cookie) could exhaust it and lock every admin out.
 * Requests with a token are limited per session after authentication (`sessionRateLimit`);
 * forged tokens never reach a real session's bucket.
 */
export const anonymousRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  store: stores.anonymous,
  limit: env.RATE_LIMIT_ANONYMOUS_MAX_PER_MINUTE,
  skip: (req) => req.path.startsWith('/health') || isWellFormedSessionToken(bearerTokenOf(req) ?? ''),
});

/** Per-session limit. Runs after `authenticate`, so the key is a session the API itself validated. */
export const sessionRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  store: stores.session,
  limit: env.RATE_LIMIT_SESSION_MAX_PER_MINUTE,
  // Always mounted after `authenticate` (see ApiRouter), so the session is present.
  keyGenerator: (req) => `session:${String(getAuth(req)?.sessionId)}`,
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
