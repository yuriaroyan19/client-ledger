import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from './logger.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

export const logPrismaEvent = {
  warn: (event: unknown) => logger.warn({ prisma: event }, 'prisma warning'),
  error: (event: unknown) => logger.error({ prisma: event }, 'prisma error'),
};
prisma.$on('warn', logPrismaEvent.warn);
prisma.$on('error', logPrismaEvent.error);

export type Db = typeof prisma;
/** Transaction client type — services accept it so they can participate in a caller's transaction. */
export type DbTx = Parameters<Parameters<Db['$transaction']>[0]>[0];
/** Either the root client or a transaction client. */
export type DbClient = DbTx | Db;
