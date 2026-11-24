import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('parseEnv', () => {
  it('applies secure defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.SESSION_IDLE_TIMEOUT_MINUTES).toBe(30);
  });

  it('parses comma-separated origins', () => {
    expect(parseEnv({ ...base, CORS_ORIGINS: 'https://a.test, https://b.test,' }).CORS_ORIGINS).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('fails fast with a readable message', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...base, SESSION_IDLE_TIMEOUT_MINUTES: '1' })).toThrow(/SESSION_IDLE_TIMEOUT_MINUTES/);
  });
});
