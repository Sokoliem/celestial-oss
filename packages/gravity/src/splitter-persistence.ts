import type { SplitterSnapshot } from './splitter-controller-types.js';

/**
 * Pluggable persistence adapter for `createSplitterController`. The host
 * passes one in via `SplitterControllerOptions.persistence` to opt into
 * automatic load-on-construct + save-on-change behavior. When omitted,
 * the controller behaves as before (host owns storage entirely).
 */
export interface SplitterPersistence<TId extends string = string> {
  load(): SplitterSnapshot<TId> | null;
  save(snapshot: SplitterSnapshot<TId>): void;
}

/**
 * In-memory persistence. Useful for tests and for controllers whose lifetime
 * matches the app — survives controller re-instantiation within the same
 * process but not across reloads.
 */
export function memoryPersistence<TId extends string = string>(initial?: SplitterSnapshot<TId> | null): SplitterPersistence<TId> {
  let snapshot: SplitterSnapshot<TId> | null = initial ?? null;
  return {
    load: () => snapshot,
    save: (next) => {
      snapshot = next;
    },
  };
}

/**
 * Browser `localStorage`-backed persistence. Falls back to a no-op when
 * `localStorage` is unavailable (SSR, restricted contexts) so callers do
 * not have to gate.
 */
export function localStoragePersistence<TId extends string = string>(key: string): SplitterPersistence<TId> {
  const storage = readGlobalLocalStorage();
  if (!storage) {
    return { load: () => null, save: () => {} };
  }
  return {
    load: () => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SplitterSnapshot<TId>;
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.panes)) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    save: (next) => {
      try {
        storage.setItem(key, JSON.stringify(next));
      } catch {
        // Quota or privacy mode — silently drop; persistence is best-effort.
      }
    },
  };
}

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readGlobalLocalStorage(): MinimalStorage | null {
  const candidate = (globalThis as { localStorage?: MinimalStorage }).localStorage;
  if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') {
    return null;
  }
  return candidate;
}
