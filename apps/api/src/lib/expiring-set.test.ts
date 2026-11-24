import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpiringSet } from './expiring-set.js';

afterEach(() => vi.useRealTimers());

describe('ExpiringSet', () => {
  it('remembers keys until they expire', () => {
    vi.useFakeTimers();
    const set = new ExpiringSet(10, 1_000);
    set.add('a');
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(set.has('a')).toBe(false);
    expect(set.has('a')).toBe(false); // expired entries are dropped
  });

  it('evicts the oldest entries beyond its size, and re-adding refreshes a key', () => {
    const set = new ExpiringSet(2, 60_000);
    set.add('a');
    set.add('b');
    set.add('a'); // a is now newest
    set.add('c'); // evicts b
    expect([set.has('a'), set.has('b'), set.has('c')]).toEqual([true, false, true]);
    set.clear();
    expect(set.has('a')).toBe(false);
  });
});
