/**
 * Writes the OpenAPI document to `openapi.json`. The web app generates its typed API client
 * from this file (`npm run api:types` in apps/web), so commit it whenever routes change.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.LOG_LEVEL ??= 'silent';

const { buildRouters } = await import('../routes.js');
const { generateOpenApiDocument } = await import('../docs/openapi.js');

buildRouters();
const target = resolve(import.meta.dirname, '../../openapi.json');
writeFileSync(target, `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`);
console.log(`OpenAPI document written to ${target}`);
process.exit(0);
