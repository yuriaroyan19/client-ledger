/** Process entrypoint: wires OS signals to the server lifecycle (src/bootstrap/server.ts). */
import { startServer } from './bootstrap/server.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const { shutdown } = startServer({ port: env.PORT });
logger.info({ env: env.NODE_ENV, docs: env.SWAGGER_ENABLED ? '/docs' : 'disabled' }, 'API starting');

const stop = (signal: string) => void shutdown(signal).then((code) => process.exit(code));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  stop('uncaughtException');
});
