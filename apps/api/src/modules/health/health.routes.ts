import type { ApiRouter } from '../../lib/http/api-router.js';
import { prisma } from '../../lib/prisma.js';
import { z } from '../../lib/zod.js';

const HealthSchema = z.object({ status: z.enum(['ok', 'unavailable']), uptimeSeconds: z.number() }).openapi('Health');

export function registerHealthRoutes(api: ApiRouter): void {
  api.route({
    method: 'get',
    path: '/live',
    operationId: 'liveness',
    summary: 'Liveness probe',
    tags: ['Health'],
    auth: false,
    responses: { 200: { description: 'Process is up', schema: HealthSchema } },
    handler: ({ res }) => {
      res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
    },
  });

  api.route({
    method: 'get',
    path: '/ready',
    operationId: 'readiness',
    summary: 'Readiness probe (checks the database)',
    tags: ['Health'],
    auth: false,
    responses: {
      200: { description: 'Ready to serve traffic', schema: HealthSchema },
      503: { description: 'Database unavailable', schema: HealthSchema },
    },
    handler: async ({ res }) => {
      const uptimeSeconds = Math.round(process.uptime());
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', uptimeSeconds });
      } catch {
        res.status(503).json({ status: 'unavailable', uptimeSeconds });
      }
    },
  });
}
