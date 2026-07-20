export interface MeasureCacheOptions {
  /** Maximum number of entries to retain. Defaults to 1024. */
  maxEntries?: number;
}

export interface MeasureCache {
  get(id: string): number | undefined;
  set(id: string, size: number): void;
  has(id: string): boolean;
  delete(id: string): boolean;
  clear(): void;
  size(): number;
}

/**
 * Id-keyed LRU cache for variable-sized measurements (rows, pixels, etc.).
 * Touching a key marks it as most-recently-used; capacity overflow evicts
 * the least-recently-used entry.
 */
export function createMeasureCache(options: MeasureCacheOptions = {}): MeasureCache {
  const requestedMaxEntries = options.maxEntries ?? 1024;
  if (!Number.isFinite(requestedMaxEntries) || !Number.isInteger(requestedMaxEntries) || requestedMaxEntries < 1) {
    throw new RangeError('maxEntries must be a positive finite integer');
  }
  const maxEntries = requestedMaxEntries;
  const entries = new Map<string, number>();

  function touch(id: string, value: number): void {
    if (entries.has(id)) {
      entries.delete(id);
    }
    entries.set(id, value);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    get(id: string): number | undefined {
      const value = entries.get(id);
      if (value === undefined) return undefined;
      touch(id, value);
      return value;
    },
    set(id: string, size: number): void {
      if (!Number.isFinite(size) || size < 0) throw new RangeError('measurement size must be a finite number >= 0');
      touch(id, size);
    },
    has(id: string): boolean {
      return entries.has(id);
    },
    delete(id: string): boolean {
      return entries.delete(id);
    },
    clear(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    },
  };
}
