import { afterEach, describe, expect, it } from 'vitest';
import { createSplitterController } from '../splitter.js';
import type { SplitterSnapshot } from '../splitter-controller-types.js';
import { localStoragePersistence, memoryPersistence } from '../splitter-persistence.js';

describe('splitter persistence', () => {
  describe('memoryPersistence', () => {
    it('hydrates the controller on construct from a saved snapshot', () => {
      const persistence = memoryPersistence<'a' | 'b'>();
      // Round 1: build, drag, persist via the adapter.
      const first = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'b', child: { kind: 'empty' }, weight: 0.5 },
        ],
        persistence,
      });
      first.setWeight('a', 0.8);
      expect(first.getWeight('a')).toBeCloseTo(0.8, 5);

      // Round 2: a fresh controller with the same persistence picks up state.
      const second = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'b', child: { kind: 'empty' }, weight: 0.5 },
        ],
        persistence,
      });
      expect(second.getWeight('a')).toBeCloseTo(0.8, 5);
      expect(second.getWeight('b')).toBeCloseTo(0.2, 5);
    });

    it('persists collapse state across instances', () => {
      const persistence = memoryPersistence<'main' | 'side'>();
      const first = createSplitterController({
        panes: [
          { id: 'main', child: { kind: 'empty' }, weight: 0.7 },
          { id: 'side', child: { kind: 'empty' }, weight: 0.3, collapsible: true },
        ],
        persistence,
      });
      first.setCollapsed('side', true);

      const second = createSplitterController({
        panes: [
          { id: 'main', child: { kind: 'empty' }, weight: 0.7 },
          { id: 'side', child: { kind: 'empty' }, weight: 0.3, collapsible: true },
        ],
        persistence,
      });
      expect(second.isCollapsed('side')).toBe(true);
    });

    it('accepts a seed snapshot at construction', () => {
      const seed: SplitterSnapshot<'a' | 'b'> = {
        version: 1,
        panes: [
          { id: 'a', weight: 0.25, collapsed: false },
          { id: 'b', weight: 0.75, collapsed: false },
        ],
      };
      const persistence = memoryPersistence<'a' | 'b'>(seed);
      const controller = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'b', child: { kind: 'empty' }, weight: 0.5 },
        ],
        persistence,
      });
      expect(controller.getWeight('a')).toBeCloseTo(0.25, 5);
      expect(controller.getWeight('b')).toBeCloseTo(0.75, 5);
    });

    it('reset() persists the reset state', () => {
      const persistence = memoryPersistence<'a' | 'b'>();
      const controller = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 1 },
          { id: 'b', child: { kind: 'empty' }, weight: 1 },
        ],
        persistence,
      });
      controller.setWeight('a', 0.9);
      controller.reset();

      const restored = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 1 },
          { id: 'b', child: { kind: 'empty' }, weight: 1 },
        ],
        persistence,
      });
      expect(restored.getWeight('a')).toBeCloseTo(0.5, 5);
    });
  });

  describe('localStoragePersistence', () => {
    const KEY = '__test:splitter';
    const originalStorage = (globalThis as { localStorage?: unknown }).localStorage;

    function installFakeStorage(): Map<string, string> {
      const store = new Map<string, string>();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
        },
      });
      return store;
    }

    afterEach(() => {
      if (originalStorage === undefined) {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      } else {
        Object.defineProperty(globalThis, 'localStorage', {
          configurable: true,
          value: originalStorage,
        });
      }
    });

    it('round-trips through a fake localStorage', () => {
      installFakeStorage();
      const persistence = localStoragePersistence<'a' | 'b'>(KEY);

      const first = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'b', child: { kind: 'empty' }, weight: 0.5 },
        ],
        persistence,
      });
      first.setWeight('a', 0.7);

      const second = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'b', child: { kind: 'empty' }, weight: 0.5 },
        ],
        persistence,
      });
      expect(second.getWeight('a')).toBeCloseTo(0.7, 5);
    });

    it('returns null on missing key without throwing', () => {
      installFakeStorage();
      const persistence = localStoragePersistence(KEY);
      expect(persistence.load()).toBeNull();
    });

    it('returns null on malformed payload (does not throw)', () => {
      const store = installFakeStorage();
      store.set(KEY, '{not valid json');
      const persistence = localStoragePersistence(KEY);
      expect(persistence.load()).toBeNull();
    });

    it('rejects snapshots with a different version', () => {
      const store = installFakeStorage();
      store.set(KEY, JSON.stringify({ version: 99, panes: [] }));
      const persistence = localStoragePersistence(KEY);
      expect(persistence.load()).toBeNull();
    });

    it('falls back to a no-op when localStorage is unavailable', () => {
      // Ensure no fake is installed.
      delete (globalThis as { localStorage?: unknown }).localStorage;
      const persistence = localStoragePersistence('whatever');
      expect(persistence.load()).toBeNull();
      expect(() => persistence.save({ version: 1, panes: [] })).not.toThrow();
    });
  });
});
