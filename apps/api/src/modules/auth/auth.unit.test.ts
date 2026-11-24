import { describe, expect, it } from 'vitest';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.js';
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from './session-token.js';

describe('password hashing', () => {
  it('uses argon2id and verifies correctly', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('never throws on a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('dummy verification always fails', async () => {
    await expect(verifyAgainstDummy('anything')).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  it('are prefixed, 256-bit and unique', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateSessionToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(isWellFormedSessionToken(token)).toBe(true);
  });

  it('rejects malformed tokens before touching the database', () => {
    expect(isWellFormedSessionToken('cls_short')).toBe(false);
    expect(isWellFormedSessionToken(`xyz_${'a'.repeat(43)}`)).toBe(false);
    expect(isWellFormedSessionToken(`${generateSessionToken()}' OR 1=1`)).toBe(false);
  });

  it('hashes deterministically and never stores the raw token', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});
