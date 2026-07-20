import { describe, expect, it } from 'vitest';
import { deserializeFromStorage, migrateData, type PersistedData, type PersistenceConfig, serializeForStorage } from '../persistence.js';

describe('serializeForStorage', () => {
  it('produces valid JSON with version and timestamp', () => {
    const config: PersistenceConfig<{ count: number }> = {
      key: 'test-app',
      version: 1,
    };
    const model = { count: 42 };

    const raw = serializeForStorage(config, model);
    const parsed: PersistedData = JSON.parse(raw);

    expect(parsed.version).toBe(1);
    expect(parsed.data).toEqual({ count: 42 });
    expect(typeof parsed.savedAt).toBe('number');
    expect(parsed.savedAt).toBeGreaterThan(0);
  });

  it('with select: only persists selected fields', () => {
    const config: PersistenceConfig<{ count: number; transient: string }> = {
      key: 'test-app',
      version: 1,
      select: (model) => ({ count: model.count }),
    };
    const model = { count: 42, transient: 'should-not-persist' };

    const raw = serializeForStorage(config, model);
    const parsed: PersistedData = JSON.parse(raw);

    expect(parsed.data).toEqual({ count: 42 });
    expect((parsed.data as Record<string, unknown>)['transient']).toBeUndefined();
  });

  it('persists entire model when select is not provided', () => {
    const config: PersistenceConfig<{ a: number; b: string }> = {
      key: 'test-app',
      version: 2,
    };
    const model = { a: 1, b: 'hello' };

    const raw = serializeForStorage(config, model);
    const parsed: PersistedData = JSON.parse(raw);

    expect(parsed.data).toEqual({ a: 1, b: 'hello' });
    expect(parsed.version).toBe(2);
  });
});

describe('deserializeFromStorage', () => {
  it('restores model correctly', () => {
    const config: PersistenceConfig<{ count: number }> = {
      key: 'test-app',
      version: 1,
    };
    const freshModel = { count: 0 };
    const persisted: PersistedData = {
      version: 1,
      data: { count: 42 },
      savedAt: Date.now(),
    };
    const raw = JSON.stringify(persisted);

    const result = deserializeFromStorage(config, raw, freshModel);

    expect(result).toEqual({ count: 42 });
  });

  it('with merge: merges persisted data into fresh model', () => {
    const config: PersistenceConfig<{ count: number; theme: string }> = {
      key: 'test-app',
      version: 1,
      merge: (persisted, fresh) => ({
        ...fresh,
        ...(persisted as Partial<{ count: number; theme: string }>),
      }),
    };
    const freshModel = { count: 0, theme: 'dark' };
    const persisted: PersistedData = {
      version: 1,
      data: { count: 42 },
      savedAt: Date.now(),
    };
    const raw = JSON.stringify(persisted);

    const result = deserializeFromStorage(config, raw, freshModel);

    expect(result).toEqual({ count: 42, theme: 'dark' });
  });

  it('applies migrations when version differs', () => {
    const config: PersistenceConfig<{ count: number; label: string }> = {
      key: 'test-app',
      version: 3,
      migrations: {
        2: (old) => ({ ...(old as Record<string, unknown>), label: 'default' }),
        3: (old) => {
          const o = old as Record<string, unknown>;
          return { ...o, label: String(o['label']).toUpperCase() };
        },
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

    // Migration 2: adds label='default', migration 3: uppercases label
    expect(result).toEqual({ count: 10, label: 'DEFAULT' });
  });

  it('returns fresh model on invalid JSON', () => {
    const config: PersistenceConfig<{ count: number }> = {
      key: 'test-app',
      version: 1,
    };
    const freshModel = { count: 0 };

    const result = deserializeFromStorage(config, 'not-json!!!', freshModel);

    expect(result).toEqual({ count: 0 });
  });
});

describe('migrateData', () => {
  it('applies migrations sequentially from fromVersion+1 to toVersion', () => {
    const migrations: Record<number, (old: unknown) => unknown> = {
      2: (old) => ({ ...(old as Record<string, unknown>), field2: 'added-in-v2' }),
      3: (old) => ({ ...(old as Record<string, unknown>), field3: 'added-in-v3' }),
      4: (old) => ({ ...(old as Record<string, unknown>), field4: 'added-in-v4' }),
    };

    const result = migrateData({ field1: 'original' }, 1, 4, migrations);

    expect(result).toEqual({
      field1: 'original',
      field2: 'added-in-v2',
      field3: 'added-in-v3',
      field4: 'added-in-v4',
    });
  });

  it('handles version gaps by skipping missing migrations', () => {
    const migrations: Record<number, (old: unknown) => unknown> = {
      // No migration for version 2
      3: (old) => ({ ...(old as Record<string, unknown>), v3: true }),
      // No migration for version 4
      5: (old) => ({ ...(old as Record<string, unknown>), v5: true }),
    };

    const result = migrateData({ base: true }, 1, 5, migrations);

    expect(result).toEqual({ base: true, v3: true, v5: true });
  });

  it('returns data unchanged when fromVersion equals toVersion', () => {
    const migrations: Record<number, (old: unknown) => unknown> = {
      2: () => ({ changed: true }),
    };

    const data = { unchanged: true };
    const result = migrateData(data, 2, 2, migrations);

    expect(result).toEqual({ unchanged: true });
  });

  it('returns data unchanged when fromVersion > toVersion', () => {
    const migrations: Record<number, (old: unknown) => unknown> = {
      2: () => ({ changed: true }),
    };

    const data = { unchanged: true };
    const result = migrateData(data, 5, 2, migrations);

    expect(result).toEqual({ unchanged: true });
  });

  it('applies single migration correctly', () => {
    const migrations: Record<number, (old: unknown) => unknown> = {
      2: (old) => {
        const o = old as { count: number };
        return { count: o.count * 2 };
      },
    };

    const result = migrateData({ count: 5 }, 1, 2, migrations);

    expect(result).toEqual({ count: 10 });
  });
});
