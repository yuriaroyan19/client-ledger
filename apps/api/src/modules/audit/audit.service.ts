import type { Prisma } from '../../generated/prisma/client.js';
import type { Actor } from '../../lib/http/auth-context.js';
import { prisma, type DbClient } from '../../lib/prisma.js';
import type { AuditLogView, ListAuditLogsQuery } from './audit.schemas.js';

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

  /**
   * Newest first, keyset-paginated on (createdAt, id): no COUNT over the whole table, and stable
   * pages even when entries share a timestamp. Reads one extra row to know whether more exist.
   */
  async list(query: ListAuditLogsQuery): Promise<{ items: AuditLogView[]; nextCursor: string | null }> {
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(query.entityType && { entityType: query.entityType }),
        ...(query.entityId && { entityId: query.entityId }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { admin: { select: { id: true, name: true } } },
      take: query.pageSize + 1,
      ...(query.before && { cursor: { id: query.before }, skip: 1 }),
    });
    const hasMore = rows.length > query.pageSize;
    const items = rows.slice(0, query.pageSize).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      admin: row.admin,
    }));
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? last.id : null };
  },
};
