import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadDotenv({ quiet: true });

/**
 * Integration tests run against a dedicated database (never the dev one): TEST_DATABASE_URL,
 * or DATABASE_URL with `_test` appended to the database name. It is reset before the run.
 */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? 'postgresql://ledger:ledger@localhost:5433/client_ledger';
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  return url.toString();
}

const sharedEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  LOG_PRETTY: 'false',
  SWAGGER_ENABLED: 'true',
  RATE_LIMIT_LOGIN_MAX_PER_IP: '1000',
  RATE_LIMIT_GLOBAL_MAX_PER_MINUTE: '100000',
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Only generated code and the thin process entrypoints (signal wiring) are excluded; their logic lives in src/bootstrap/.
      exclude: ['src/generated/**', 'src/scripts/**', 'src/server.ts', 'src/**/*.test.ts'],
      // Unit + integration together must cover everything. Lowering this needs a reviewed reason.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          env: { ...sharedEnv, DATABASE_URL: 'postgresql://unit:unit@localhost:5432/unit_tests_never_connect' },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          env: { ...sharedEnv, DATABASE_URL: testDatabaseUrl() },
          globalSetup: ['test/global-setup.ts'],
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
