/** CLI entrypoint for the seed job (`npm run db:seed`, Docker `migrate` service). Logic: src/bootstrap/seed.ts. */
import { runSeed } from '../bootstrap/seed.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

runSeed(process.env)
  .then((result) => logger.info(result, 'seed complete'))
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
