import type { Prisma } from '../../generated/prisma/client.js';
import type { Actor } from '../../lib/http/auth-context.js';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { toPage, toSkipTake, type Page, type PaginationQuery } from '../../lib/pagination.js';

/** Closed list of auditable actions — add new ones here so they stay greppable and documented. */
export const AUDIT_ACTIONS = [
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.logout',
  'auth.logout_all',
  'client.created',
  'client.updated',
  'client.archived',
  'client.restored',
  'movement.created',
  'movement.updated',
  'movement.deleted',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = 'admin' | 'client' | 'movement';

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditLogView {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
  admin: { id: string; name: string } | null;
}

export const auditService = {
  /** Pass the transaction client so the audit row commits/rolls back with the change it describes. */
  async record(entry: AuditEntry, actor: Actor, db: DbClient = prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        ...(entry.metadata !== undefined && { metadata: entry.metadata }),
        adminId: actor.adminId,
        ipAddress: actor.ip,
        requestId: actor.requestId,
      },
    });
  },

  async list(query: PaginationQuery & { entityType?: string; entityId?: string }): Promise<Page<AuditLogView>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { admin: { select: { id: true, name: true } } },
        ...toSkipTake(query),
      }),
      prisma.auditLog.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
        admin: row.admin,
      })),
      total,
      query,
    );
  },
};
