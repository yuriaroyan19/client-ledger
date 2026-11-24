#!/usr/bin/env node
/**
 * Creates `.env` (Docker) and `apps/api/.env` (local dev) from `.env.example`, filling every
 * secret with a strong random value. Never overwrites existing files.
 *
 *   npm run env:init
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const secret = (bytes) => randomBytes(bytes).toString('base64url');

function write(path, content) {
  if (existsSync(path)) {
    console.log(`• ${path} already exists — left untouched`);
    return false;
  }
  writeFileSync(path, content, { mode: 0o600 });
  console.log(`✓ created ${path}`);
  return true;
}

const dbPassword = secret(24);
const adminPassword = secret(15);

const rootEnv = readFileSync('.env.example', 'utf8')
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${dbPassword}`)
  .replace(/^ADMIN_PASSWORD=$/m, `ADMIN_PASSWORD=${adminPassword}`);
const createdRoot = write('.env', rootEnv);

// Local (non-Docker) API development talks to the Docker database on 127.0.0.1:$DB_PORT.
const values = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
write(
  'apps/api/.env',
  [
    'NODE_ENV=development',
    `DATABASE_URL=postgresql://${values.POSTGRES_USER}:${values.POSTGRES_PASSWORD}@localhost:${values.DB_PORT ?? 5433}/${values.POSTGRES_DB}?schema=public`,
    'LOG_PRETTY=true',
    'LOG_LEVEL=debug',
    `ADMIN_EMAIL=${values.ADMIN_EMAIL}`,
    `ADMIN_PASSWORD=${values.ADMIN_PASSWORD}`,
    `SEED_DEMO_DATA=${values.SEED_DEMO_DATA ?? 'true'}`,
    '',
  ].join('\n'),
);
write('apps/web/.env.local', ['API_URL=http://localhost:4000', 'COOKIE_SECURE=false', ''].join('\n'));

if (createdRoot) {
  console.log(`\nAdmin sign-in:  ${values.ADMIN_EMAIL}  /  ${values.ADMIN_PASSWORD}`);
  console.log('(stored in .env — change ADMIN_EMAIL/ADMIN_PASSWORD there before the first start if you prefer)');
}
