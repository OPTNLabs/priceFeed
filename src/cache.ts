export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): CacheEntry<T> | null {
    const hit = this.peek(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      return null;
    }
    return hit;
  }

  peek(key: string): CacheEntry<T> | null {
    return this.store.get(key) ?? null;
  }

  set(key: string, value: T, ttlMs: number): CacheEntry<T> {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    this.store.set(key, entry);
    return entry;
  }
}
