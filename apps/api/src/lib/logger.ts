import { pino, type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured JSON logger. Secrets and PII-heavy fields are redacted at the source so
 * they can never reach log storage, even if someone logs a whole request object.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.authorization',
];

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: 'client-ledger-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  formatters: { level: (label) => ({ level: label }) },
};

export const logger = env.LOG_PRETTY
  ? pino({ ...options, transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } })
  : pino(options);

export type Logger = typeof logger;
