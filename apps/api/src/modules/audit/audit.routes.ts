import type { ApiRouter } from '../../lib/http/api-router.js';
import { PaginationQuerySchema, pageSchema } from '../../lib/pagination.js';
import { z } from '../../lib/zod.js';
import { auditService } from './audit.service.js';

const AuditLogSchema = z
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

const ListAuditLogsQuerySchema = PaginationQuerySchema.extend({
  entityType: z.enum(['admin', 'client', 'movement']).optional(),
  entityId: z.uuid().optional(),
});

export function registerAuditRoutes(api: ApiRouter): void {
  api.route({
    method: 'get',
    path: '/audit-logs',
    operationId: 'listAuditLogs',
    summary: 'List activity (newest first)',
    tags: ['Audit'],
    request: { query: ListAuditLogsQuerySchema },
    responses: { 200: { description: 'A page of audit entries', schema: pageSchema(AuditLogSchema, 'AuditLogPage') } },
    handler: async ({ query, res }) => {
      res.json(await auditService.list(query));
    },
  });
}
