import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { sessionService } from '../modules/auth/session.service.js';

export interface ServerOptions {
  port: number;
  purgeIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

export interface RunningServer {
  server: Server;
  /** Resolves once the server is listening. */
  ready: Promise<AddressInfo>;
  /** Graceful stop: drain connections, disconnect Prisma. Resolves to the process exit code. Idempotent. */
  shutdown: (signal: string) => Promise<number>;
}

/** Starts the HTTP server with slow-client timeouts, hourly session purge and graceful shutdown. */
export function startServer({ port, purgeIntervalMs = 60 * 60_000, shutdownTimeoutMs = 10_000 }: ServerOptions): RunningServer {
  const server = createApp().listen(port);
  const ready = new Promise<AddressInfo>((resolve) => {
    server.once('listening', () => {
      logger.info({ port: (server.address() as AddressInfo).port }, 'API listening');
      resolve(server.address() as AddressInfo);
    });
  });

  // Guard against slowloris-style connections.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  const purgeTimer = setInterval(() => {
    sessionService
      .purgeExpired()
      .then((count) => count > 0 && logger.info({ count }, 'purged expired sessions'))
      .catch((error: unknown) => logger.error({ err: error }, 'session purge failed'));
  }, purgeIntervalMs);
  purgeTimer.unref();

  let stopping: Promise<number> | undefined;
  function shutdown(signal: string): Promise<number> {
    stopping ??= new Promise<number>((resolve) => {
      logger.info({ signal }, 'shutting down');
      clearInterval(purgeTimer);
      const force = setTimeout(() => {
        logger.error('forced shutdown after timeout');
        server.closeAllConnections();
        resolve(1);
      }, shutdownTimeoutMs);
      force.unref();

      server.close((error) => {
        void prisma.$disconnect().finally(() => {
          clearTimeout(force);
          if (error) logger.error({ err: error }, 'error while closing server');
          resolve(error ? 1 : 0);
        });
      });
    });
    return stopping;
  }

  return { server, ready, shutdown };
}
