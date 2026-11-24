import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP Password Storage Cheat Sheet — argon2id, m=19 MiB, t=2, p=1.
 * Argon2id is the library default (its `Algorithm` const enum is unusable with
 * verbatimModuleSyntax); password.test.ts asserts hashes start with `$argon2id$`.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU time as a real verification. Used when the email is unknown so
 * response timing does not reveal which admin accounts exist (user enumeration).
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(await dummyHash, password);
  return false;
}
