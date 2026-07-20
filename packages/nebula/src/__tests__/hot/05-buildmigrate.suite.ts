// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../app.js';
import { text } from '../../elements.js';
import { buildMigrate } from '../../hot.js';
import { Cmd, Sub } from '../../types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

type TestModel = { count: number; label: string };
type TestMsg = 'inc' | 'dec';

function _makeConfig(): AppConfig<TestModel, TestMsg> {
  return {
    init: () => [{ count: 0, label: 'test' }, Cmd.none()],
    update: (msg, model) => {
      if (msg === 'inc') return [{ ...model, count: model.count + 1 }, Cmd.none()];
      return [{ ...model, count: model.count - 1 }, Cmd.none()];
    },
    view: (model) => text(`${model.label}:${model.count}`),
    subscriptions: () => Sub.key('a', 'inc' as TestMsg),
  };
}

function _makeRawConfig() {
  return {
    init: () => [{ count: 0, label: 'raw' }, { kind: 'none' }],
    update: (msg: string, model: TestModel) => {
      if (msg === 'inc') return [{ ...model, count: model.count + 1 }, { kind: 'none' }];
      return [model, { kind: 'none' }];
    },
    view: (model: TestModel) => ({ kind: 'text', content: `${model.label}:${model.count}` }),
    subscriptions: () => ({
      kind: 'batch',
      subs: [
        { kind: 'key', key: 'a', msg: 'inc' },
        { kind: 'timer', ms: 100, toMsg: () => 'tick' },
      ],
    }),
  };
}

function _makeMockLoader(rawConfig: any) {
  return vi.fn().mockResolvedValue({
    exports: { default: rawConfig },
    elapsed: 5,
  });
}

function _makeMockResolveExport() {
  return (exports: Record<string, unknown>) => {
    return (exports as any).default ?? exports;
  };
}

function _makeMockHandle() {
  return {
    stop: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    replaceConfig: vi.fn(),
    model: { count: 0, label: 'test' },
  };
}

// ─── buildMigrate ───────────────────────────────────────────────────────────

describe('buildMigrate', () => {
  it('auto-merge preserves old fields and adds new defaults', () => {
    const newConfig = {
      init: () => [{ count: 0, label: 'new', extra: true }, Cmd.none()] as const,
      update: vi.fn(),
      view: vi.fn(),
      subscriptions: vi.fn(),
    };
    const migrate = buildMigrate('auto-merge', newConfig as any);
    const result = migrate({ count: 42, label: 'old' }) as any;

    expect(result.count).toBe(42);
    expect(result.label).toBe('old');
    expect(result.extra).toBe(true);
  });

  it('reset discards old model and uses fresh init', () => {
    const newConfig = {
      init: () => [{ count: 0, label: 'fresh' }, Cmd.none()] as const,
      update: vi.fn(),
      view: vi.fn(),
      subscriptions: vi.fn(),
    };
    const migrate = buildMigrate('reset', newConfig as any);
    const result = migrate({ count: 99, label: 'stale' }) as any;

    expect(result.count).toBe(0);
    expect(result.label).toBe('fresh');
  });

  it('custom function receives old model and fresh defaults', () => {
    const newConfig = {
      init: () => [{ count: 0, label: 'fresh' }, Cmd.none()] as const,
      update: vi.fn(),
      view: vi.fn(),
      subscriptions: vi.fn(),
    };
    const custom = (old: unknown, fresh: unknown) => ({
      ...(fresh as any),
      count: (old as any).count * 2,
    });
    const migrate = buildMigrate(custom, newConfig as any);
    const result = migrate({ count: 5, label: 'old' }) as any;

    expect(result.count).toBe(10);
    expect(result.label).toBe('fresh');
  });
});
