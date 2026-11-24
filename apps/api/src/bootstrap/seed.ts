/**
 * Idempotent seed, safe to run on every container start (entrypoint: src/scripts/seed.ts).
 *  - Ensures the initial administrator from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME exists.
 *    An existing admin's password is NEVER overwritten (set ADMIN_RESET_PASSWORD=true to rotate it).
 *  - With SEED_DEMO_DATA=true and an empty database, inserts demo clients and movements.
 */
import { z } from '../lib/zod.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../modules/auth/password.js';

export const SeedEnvSchema = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  ADMIN_PASSWORD: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH),
  ADMIN_NAME: z.string().trim().min(1).max(120).default('Administrator'),
  ADMIN_RESET_PASSWORD: z.enum(['true', 'false']).default('false'),
  SEED_DEMO_DATA: z.enum(['true', 'false']).default('false'),
});

const WEAK_PASSWORDS = new Set(['change-me-please', 'password1234', 'admin1234567', '123456789012']);

async function ensureAdmin(config: z.output<typeof SeedEnvSchema>) {
  if (WEAK_PASSWORDS.has(config.ADMIN_PASSWORD.toLowerCase())) {
    throw new Error('ADMIN_PASSWORD is a well-known weak value. Choose a unique password.');
  }
  const existing = await prisma.admin.findUnique({ where: { email: config.ADMIN_EMAIL } });
  if (!existing) {
    const admin = await prisma.admin.create({
      data: { email: config.ADMIN_EMAIL, name: config.ADMIN_NAME, passwordHash: await hashPassword(config.ADMIN_PASSWORD) },
    });
    logger.info({ email: admin.email }, 'seed: administrator created');
    return { admin, created: true };
  }
  if (config.ADMIN_RESET_PASSWORD === 'true') {
    await prisma.$transaction([
      prisma.admin.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(config.ADMIN_PASSWORD) } }),
      prisma.session.updateMany({ where: { adminId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    logger.warn({ email: existing.email }, 'seed: administrator password rotated, sessions revoked');
  } else {
    logger.info({ email: existing.email }, 'seed: administrator already exists, leaving untouched');
  }
  return { admin: existing, created: false };
}

function isoDaysAgo(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function seedDemoData(adminId: string): Promise<boolean> {
  if ((await prisma.client.count()) > 0) {
    logger.info('seed: clients already exist, skipping demo data');
    return false;
  }
  const demo = [
    { name: 'Acme Corporation', email: 'billing@acme.test', phone: '+1 555 010 2030' },
    { name: 'Globex Ltd', email: 'accounts@globex.test', phone: null },
    { name: 'Initech', email: null, phone: '+44 20 7946 0958' },
    { name: 'Umbrella Studio', email: 'hello@umbrella.test', phone: null },
  ];
  const descriptions = {
    EARNING: ['Consulting retainer', 'Project milestone', 'Support contract', 'Workshop'],
    EXPENSE: ['Software licences', 'Travel', 'Hosting', 'Contractor fee'],
  } as const;

  for (const [index, data] of demo.entries()) {
    const client = await prisma.client.create({ data: { ...data, createdById: adminId } });
    const movements = Array.from({ length: 14 }, (_, i) => {
      const type = (i + index) % 3 === 0 ? 'EXPENSE' : 'EARNING';
      const amount = (((i + 1) * 137 + index * 59) % 2400) + 50 + ((i * 7) % 100) / 100;
      return {
        clientId: client.id,
        type,
        amount: amount.toFixed(2),
        description: descriptions[type][(i % 4) as 0 | 1 | 2 | 3], // i % 4 is always a valid index
        occurredOn: isoDaysAgo(i * 9 + index * 3),
        createdById: adminId,
      } as const;
    });
    await prisma.movement.createMany({ data: movements });
  }
  logger.info({ clients: demo.length }, 'seed: demo data inserted');
  return true;
}

export type SeedResult = { adminId: string; adminCreated: boolean; demoDataInserted: boolean };

/** Runs the seed against the configured database. Throws on invalid configuration. */
export async function runSeed(rawEnv: Record<string, string | undefined>): Promise<SeedResult> {
  const parsed = SeedEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid seed configuration: ${issues}`);
  }
  const { admin, created } = await ensureAdmin(parsed.data);
  const demoDataInserted = parsed.data.SEED_DEMO_DATA === 'true' && (await seedDemoData(admin.id));
  return { adminId: admin.id, adminCreated: created, demoDataInserted };
}
