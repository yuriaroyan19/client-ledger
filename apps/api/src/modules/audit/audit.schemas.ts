import { MAX_PAGE_SIZE } from '../../lib/pagination.js';
import { z } from '../../lib/zod.js';

export const AuditLogSchema = z
  .object({
    id: z.uuid(),
    action: z.string().openapi({ example: 'movement.created' }),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    metadata: z.unknown(),
    ipAddress: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    admin: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  })
  .openapi('AuditLog');

/**
 * Cursor pagination: the audit log only grows, so counting every row on each view would get slower
 * forever. Pass the previous page's `nextCursor` as `before` to load older entries.
 */
export const ListAuditLogsQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  before: z.uuid().optional().openapi({ description: 'Return entries older than this entry id (a previous `nextCursor`).' }),
  entityType: z.enum(['admin', 'client', 'movement']).optional(),
  entityId: z.uuid().optional(),
});

export const AuditLogCursorPageSchema = z
  .object({
    items: z.array(AuditLogSchema),
    nextCursor: z
      .uuid()
      .nullable()
      .openapi({ description: 'Pass as `before` for the next (older) page; null on the last page.' }),
  })
  .openapi('AuditLogCursorPage');

export type ListAuditLogsQuery = z.output<typeof ListAuditLogsQuerySchema>;
export type AuditLogView = z.output<typeof AuditLogSchema>;
