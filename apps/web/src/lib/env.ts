import 'server-only';
import { z } from 'zod';

/** Server-side configuration, validated once. Never import this from a Client Component. */
const ServerEnvSchema = z.object({
  API_URL: z.url().default('http://localhost:4000'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** Reverse proxies in front of this app that append to X-Forwarded-For. 0 = exposed directly. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
});

export const serverEnv = ServerEnvSchema.parse({
  API_URL: process.env.API_URL,
  COOKIE_SECURE: process.env.COOKIE_SECURE,
  TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
});
