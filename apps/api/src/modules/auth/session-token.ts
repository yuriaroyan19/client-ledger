import { createHash, randomBytes } from 'node:crypto';

/**
 * Session tokens are 256-bit random values. The `cls_` prefix makes leaked tokens
 * recognisable by secret scanners. Only the SHA-256 digest is persisted, so a database
 * leak does not yield usable tokens (a fast hash is fine for high-entropy secrets).
 */
const PREFIX = 'cls_';
const TOKEN_PATTERN = /^cls_[A-Za-z0-9_-]{43}$/;

export function generateSessionToken(): string {
  return `${PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isWellFormedSessionToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
