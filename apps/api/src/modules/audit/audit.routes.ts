import type { ApiRouter } from '../../lib/http/api-router.js';
import { AuditLogCursorPageSchema, ListAuditLogsQuerySchema } from './audit.schemas.js';
import { auditService } from './audit.service.js';

export function registerAuditRoutes(api: ApiRouter): void {
  api.route({
    method: 'get',
    path: '/audit-logs',
    operationId: 'listAuditLogs',
    summary: 'List activity (newest first, cursor-paginated)',
    tags: ['Audit'],
    request: { query: ListAuditLogsQuerySchema },
    responses: { 200: { description: 'A page of audit entries', schema: AuditLogCursorPageSchema } },
    handler: async ({ query, res }) => {
      res.json(await auditService.list(query));
    },
  });
}
