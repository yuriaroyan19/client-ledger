import { env } from '../../config/env.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import type { Actor, AuthContext } from '../../lib/http/auth-context.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/audit.service.js';
import { verifyAgainstDummy, verifyPassword } from './password.js';
import { sessionService } from './session.service.js';

/** One message for every failure — never reveal whether the email exists. */
const INVALID_CREDENTIALS = 'Invalid email or password';

/** Audits the failed attempt (attributed to the admin only if the account exists) and rejects. */
async function rejectLogin(email: string, adminId: string | null, actor: Actor): Promise<never> {
  await auditService.record(
    { action: 'auth.login.failed', entityType: 'admin', ...(adminId !== null && { entityId: adminId }), metadata: { email } },
    { ...actor, adminId },
  );
  throw new UnauthenticatedError(INVALID_CREDENTIALS);
}

export const authService = {
  async login(email: string, password: string, actor: Actor) {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      // Same argon2 cost as a real check, so response timing doesn't reveal which emails exist.
      await verifyAgainstDummy(password);
      return rejectLogin(email, null, actor);
    }
    if (!(await verifyPassword(admin.passwordHash, password))) return rejectLogin(email, admin.id, actor);

    const session = await prisma.$transaction(async (tx) => {
      const created = await sessionService.create(admin.id, { ip: actor.ip, userAgent: actor.userAgent }, tx);
      await tx.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
      await auditService.record(
        { action: 'auth.login.succeeded', entityType: 'admin', entityId: admin.id },
        { ...actor, adminId: admin.id },
        tx,
      );
      return created;
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      idleTimeoutSeconds: env.SESSION_IDLE_TIMEOUT_MINUTES * 60,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    };
  },

  async logout(auth: AuthContext, actor: Actor): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await sessionService.revoke(auth.sessionId, tx);
      await auditService.record({ action: 'auth.logout', entityType: 'admin', entityId: auth.admin.id }, actor, tx);
    });
  },

  async logoutAll(auth: AuthContext, actor: Actor): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const count = await sessionService.revokeAllForAdmin(auth.admin.id, tx);
      await auditService.record(
        { action: 'auth.logout_all', entityType: 'admin', entityId: auth.admin.id, metadata: { count } },
        actor,
        tx,
      );
      return count;
    });
  },
};
