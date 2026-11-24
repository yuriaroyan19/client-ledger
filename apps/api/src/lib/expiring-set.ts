/**
 * Bounded in-memory set whose entries expire. Oldest entries are evicted first when full, so
 * memory stays capped no matter how many keys are added.
 */
export class ExpiringSet {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  add(key: string): void {
    this.entries.delete(key); // re-insert so it becomes the newest
    this.entries.set(key, Date.now() + this.ttlMs);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxSize) break;
      this.entries.delete(oldest);
    }
  }

  has(key: string): boolean {
    const expiresAt = this.entries.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt > Date.now()) return true;
    this.entries.delete(key);
    return false;
  }

  clear(): void {
    this.entries.clear();
  }
}
