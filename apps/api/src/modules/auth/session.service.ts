import { env } from '../../config/env.js';
import type { AuthContext } from '../../lib/http/auth-context.js';
import { ExpiringSet } from '../../lib/expiring-set.js';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from './session-token.js';

const MINUTE = 60_000;
/** Avoid a DB write on every request: refresh `lastUsedAt` at most once per minute. */
const TOUCH_INTERVAL_MS = MINUTE;

export interface CreatedSession {
  token: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}

function idleTimeoutMs(): number {
  return env.SESSION_IDLE_TIMEOUT_MINUTES * MINUTE;
}

/**
 * Opaque, server-side sessions (instead of JWTs) so that logout, "log out everywhere"
 * and incident response revoke access immediately. See docs/decisions/0002-sessions-over-jwt.md.
 */
/**
 * Token hashes this process recently issued or validated. Used ONLY to decide whether the failed-auth
 * limiter may block a request; it never grants access (every request is still validated against the
 * database). Bounded, so forged tokens can't grow it: only real sessions are ever added.
 */
const recentlyValid = new ExpiringSet(10_000, env.SESSION_IDLE_TIMEOUT_MINUTES * MINUTE);

export const sessionService = {
  async create(
    adminId: string,
    meta: { ip: string | null; userAgent: string | null },
    db: DbClient = prisma,
  ): Promise<CreatedSession> {
    const token = generateSessionToken();
    const now = Date.now();
    const expiresAt = new Date(now + env.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * MINUTE);
    const tokenHash = hashSessionToken(token);
    await db.session.create({
      data: { adminId, tokenHash, ipAddress: meta.ip, userAgent: meta.userAgent, expiresAt },
    });
    recentlyValid.add(tokenHash);
    return { token, expiresAt, idleExpiresAt: new Date(Math.min(now + idleTimeoutMs(), expiresAt.getTime())) };
  },

  async validate(token: string): Promise<AuthContext | null> {
    if (!isWellFormedSessionToken(token)) return null;

    const tokenHash = hashSessionToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { admin: { select: { id: true, email: true, name: true } } },
    });
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;
    if (session.lastUsedAt.getTime() + idleTimeoutMs() <= now) return null;

    if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } });
    }
    recentlyValid.add(tokenHash);
    return { admin: session.admin, sessionId: session.id };
  },

  /** True if this process issued or validated the token recently (see `recentlyValid`). */
  wasRecentlyValid(token: string): boolean {
    return recentlyValid.has(hashSessionToken(token));
  },

  /** Test-only: forget recently seen sessions. */
  forgetRecentlyValid(): void {
    recentlyValid.clear();
  },

  async revoke(sessionId: string, db: DbClient = prisma): Promise<void> {
    await db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  async revokeAllForAdmin(adminId: string, db: DbClient = prisma): Promise<number> {
    const { count } = await db.session.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  },

  /** Housekeeping: hard-delete sessions that can never be used again. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * MINUTE);
    const { count } = await prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }, { lastUsedAt: { lt: cutoff } }] },
    });
    return count;
  },
};
