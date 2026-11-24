import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from '../lib/zod.js';

/** Global registry. Routes register themselves through `ApiRouter.route()`, so docs cannot drift from code. */
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'Session token returned by `POST /api/v1/auth/login`. Opaque; expires after inactivity.',
});

export const ProblemSchema = registry.register(
  'Problem',
  z
    .object({
      type: z.string().openapi({ example: 'about:blank' }),
      title: z.string().openapi({ example: 'Not Found' }),
      status: z.number().int().openapi({ example: 404 }),
      code: z.string().openapi({ example: 'NOT_FOUND' }),
      detail: z.string().openapi({ example: 'Client not found' }),
      requestId: z.string().optional(),
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    })
    .openapi({ description: 'RFC 9457 problem details.' }),
);

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Client Ledger API',
      version: '1.0.0',
      description:
        'Admin-only API for managing clients and their earnings/expenses.\n\n' +
        '1. Call `POST /api/v1/auth/login` with admin credentials.\n' +
        '2. Click **Authorize** and paste the returned `token`.\n\n' +
        'Monetary amounts are decimal **strings** with 2 fractional digits. Dates are `YYYY-MM-DD`.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Health', description: 'Liveness and readiness probes' },
      { name: 'Auth', description: 'Administrator sessions' },
      { name: 'Clients', description: 'Client records (clients never authenticate)' },
      { name: 'Movements', description: 'Earnings and expenses of a client' },
      { name: 'Reports', description: 'Balances and movement summaries' },
      { name: 'Audit', description: 'Append-only activity log' },
    ],
  });
}
