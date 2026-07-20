// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { deserializeFromStorage, type PersistedData, type PersistenceConfig } from '../../persistence.js';

// ─── Bug #3: Backward migration silently returns incompatible data ──────────

describe('Bug #3: backward migration returns freshModel', () => {
  it('should return freshModel when persisted version is newer than config version', () => {
    const config: PersistenceConfig<{ count: number }> = {
      key: 'test-app',
      version: 2,
    };
    const freshModel = { count: 0 };

    // Persisted data has version 5 (from a newer app version)
    const persisted: PersistedData = {
      version: 5,
      data: { count: 999, extraField: 'future-data' },
      savedAt: Date.now(),
    };
    const raw = JSON.stringify(persisted);

    const result = deserializeFromStorage(config, raw, freshModel);

    // Before fix: returns { count: 999, extraField: 'future-data' } (raw data, potentially incompatible)
    // After fix: returns freshModel { count: 0 } with a console warning
    expect(result).toEqual({ count: 0 });
  });

  it('should return freshModel even when merge function is provided', () => {
    const config: PersistenceConfig<{ count: number; label: string }> = {
      key: 'test-app',
      version: 1,
      merge: (persisted, fresh) => ({
        ...fresh,
        ...(persisted as Partial<{ count: number; label: string }>),
      }),
    };
    const freshModel = { count: 0, label: 'default' };

    const persisted: PersistedData = {
      version: 3,
      data: { count: 42, label: 'future', unknownProp: true },
      savedAt: Date.now(),
    };
    const raw = JSON.stringify(persisted);

    const result = deserializeFromStorage(config, raw, freshModel);
    expect(result).toEqual({ count: 0, label: 'default' });
  });

  it('should still allow forward migration (older version loaded in newer app)', () => {
    const config: PersistenceConfig<{ count: number; label: string }> = {
      key: 'test-app',
      version: 3,
      migrations: {
        2: (old) => ({ ...(old as Record<string, unknown>), label: 'migrated' }),
        3: (old) => old,
      },
    };
    const freshModel = { count: 0, label: '' };
    const persisted: PersistedData = {
      version: 1,
      data: { count: 10 },
      savedAt: Date.now(),
    };
    const raw = JSON.stringify(persisted);

    const result = deserializeFromStorage(config, raw, freshModel);
    // Forward migration should still work
    expect(result).toEqual({ count: 10, label: 'migrated' });
  });
});
