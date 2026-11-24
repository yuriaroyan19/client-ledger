import { ApiRouter } from './lib/http/api-router.js';
import { registerAuditRoutes } from './modules/audit/audit.routes.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerClientRoutes } from './modules/clients/clients.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerMovementRoutes } from './modules/movements/movements.routes.js';
import { registerReportRoutes } from './modules/reports/reports.routes.js';

export const API_PREFIX = '/api/v1';

/** Building routers also populates the OpenAPI registry — call once per process. */
export function buildRouters() {
  const health = new ApiRouter('/health');
  registerHealthRoutes(health);

  const api = new ApiRouter(API_PREFIX);
  registerAuthRoutes(api);
  registerClientRoutes(api);
  registerMovementRoutes(api);
  registerReportRoutes(api);
  registerAuditRoutes(api);

  return { health: health.router, api: api.router };
}
