import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

/**
 * Brings the dedicated test database up to date with `migrate deploy` (non-destructive; Prisma creates
 * the database if missing). Each test file truncates its own data via `resetDatabase()` in helpers.ts.
 */
export default function setup(project: TestProject): void {
  const url = project.config.env.DATABASE_URL;
  const databaseName = url ? new URL(url).pathname.slice(1) : '';
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to use a database whose name does not end in "_test" (got "${databaseName}").`);
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
