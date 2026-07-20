// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../app.js';
import { text } from '../../elements.js';
import { isProperCmd } from '../../hot.js';
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

describe('isProperCmd', () => {
  it('returns true for Cmd.none()', () => {
    expect(isProperCmd(Cmd.none())).toBe(true);
  });

  it('returns false for plain { kind: "none" }', () => {
    expect(isProperCmd({ kind: 'none' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isProperCmd(null)).toBe(false);
    expect(isProperCmd(undefined)).toBe(false);
  });
});
