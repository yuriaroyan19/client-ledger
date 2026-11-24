/**
 * The ONLY module allowed to import from 'zod' directly (enforced by ESLint).
 * It extends zod with `.openapi()` so every schema can document itself.
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };
export type { ZodType } from 'zod';
