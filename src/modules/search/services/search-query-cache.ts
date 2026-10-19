/** Bounded process-local cache for successful AI calls and requests in flight. */
export class SearchQueryCache<T> {
  private readonly entries = new Map<
    string,
    { value: Promise<T>; expiresAt: number }
  >();

  constructor(
    private readonly maxEntries = 200,
    private readonly ttlMs = 60_000,
  ) {}

  getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.value;
    }
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    const entry = {
      value: Promise.resolve().then(create),
      expiresAt: Infinity,
    };
    entry.value = entry.value.then(
      (value) => {
        entry.expiresAt = Date.now() + this.ttlMs;
        return value;
      },
      (error: unknown) => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      },
    );
    this.entries.set(key, entry);
    return entry.value;
  }
}
