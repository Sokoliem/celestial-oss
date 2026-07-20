// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../app.js';
import { text } from '../../elements.js';
import { isProperCmd, isProperSub, wrapRawConfig } from '../../hot.js';
import { Cmd, Sub } from '../../types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

type TestModel = { count: number; label: string };
type TestMsg = 'inc' | 'dec';

function makeConfig(): AppConfig<TestModel, TestMsg> {
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

function makeRawConfig() {
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

// ─── wrapRawConfig ──────────────────────────────────────────────────────────

describe('wrapRawConfig', () => {
  it('wraps plain Cmd returns to Cmd.none()', () => {
    const raw = makeRawConfig();
    const wrapped = wrapRawConfig(raw);

    const [, cmd] = wrapped.init();
    expect(isProperCmd(cmd)).toBe(true);

    const [, updateCmd] = wrapped.update('inc', { count: 0, label: 'raw' });
    expect(isProperCmd(updateCmd)).toBe(true);
  });

  it('wraps plain Sub returns via convertSub', () => {
    const raw = makeRawConfig();
    const wrapped = wrapRawConfig(raw);

    const subs = wrapped.subscriptions({ count: 0, label: 'raw' });
    expect(isProperSub(subs)).toBe(true);
  });

  it('passes through VNodes unchanged', () => {
    const raw = makeRawConfig();
    const wrapped = wrapRawConfig(raw);

    const vnode = wrapped.view({ count: 5, label: 'raw' });
    expect(vnode).toEqual({ kind: 'text', content: 'raw:5' });
  });

  it('passes through proper Cmd/Sub unchanged', () => {
    const config = makeConfig();
    const wrapped = wrapRawConfig(config);

    const [, cmd] = wrapped.init();
    expect(isProperCmd(cmd)).toBe(true);

    const subs = wrapped.subscriptions({ count: 0, label: 'test' });
    expect(isProperSub(subs)).toBe(true);
  });
});
