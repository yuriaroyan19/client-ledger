import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

/** Accept a caller-provided correlation id only if it is short and harmless. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Log only what is useful. Never bodies (passwords, financial data) and never query strings:
 * they carry search terms such as client names and emails.
 */
export const httpSerializers = {
  req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({
    id: req.id,
    method: req.method,
    url: req.url.replace(/\?.*$/s, ''),
    remoteAddress: req.remoteAddress,
  }),
  res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
};

export const requestLogger = pinoHttp({
  logger,
  genReqId(req: IncomingMessage, res: ServerResponse) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health probes are noisy and carry no information.
  autoLogging: { ignore: (req) => String(req.url).startsWith('/health') },
  serializers: httpSerializers,
});
