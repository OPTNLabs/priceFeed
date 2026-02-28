export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): CacheEntry<T> | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit;
  }

  set(key: string, value: T, ttlMs: number): CacheEntry<T> {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    this.store.set(key, entry);
    return entry;
  }
}
