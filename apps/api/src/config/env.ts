import { z } from 'zod';

/**
 * Environment is parsed once at startup. The process refuses to boot on invalid config
 * (fail fast) — never read `process.env` anywhere else in the codebase.
 */
const booleanString = z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanString.default(false),

  /** Session idle timeout: a session unused for this long expires. */
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(30),
  /** Absolute session lifetime regardless of activity. */
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 7)
    .default(12),

  /** Comma-separated origins allowed for CORS. Empty = CORS disabled (BFF-only access). */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Express `trust proxy` setting. Needed to read the real client IP behind the web BFF / a load balancer. */
  TRUST_PROXY: z.string().default('loopback, linklocal, uniquelocal'),

  SWAGGER_ENABLED: booleanString.default(true),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  RATE_LIMIT_LOGIN_MAX_PER_IP: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_LOGIN_MAX_FAILURES_PER_EMAIL: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_GLOBAL_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(600),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
export const isProduction = env.NODE_ENV === 'production';
