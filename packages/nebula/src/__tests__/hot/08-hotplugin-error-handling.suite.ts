// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../app.js';
import { text } from '../../elements.js';
import { hotPlugin } from '../../hot.js';
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

function makeMockResolveExport() {
  return (exports: Record<string, unknown>) => {
    return (exports as any).default ?? exports;
  };
}

function makeMockHandle() {
  return {
    stop: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    replaceConfig: vi.fn(),
    model: { count: 0, label: 'test' },
  };
}

// ─── Error handling ─────────────────────────────────────────────────────────

describe('hotPlugin error handling', () => {
  let watchCallbacks: Array<(event: string, filename: string | null) => void>;

  function mockWatchFn() {
    watchCallbacks = [];
    return (_path: string, _opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => {
      watchCallbacks.push(cb);
      return { close: vi.fn() };
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onError on loader failure without crashing', async () => {
    const _watchFn = mockWatchFn();
    const loader = vi.fn().mockRejectedValue(new Error('syntax error'));
    const onError = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      onError,
    });

    hot.attach(makeMockHandle() as any);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]![0].message).toBe('syntax error');
  });

  it('calls onError on bad export without crashing', async () => {
    const _watchFn = mockWatchFn();
    const loader = vi.fn().mockResolvedValue({ exports: {}, elapsed: 1 });
    const resolveExport = () => {
      throw new Error('No app config found');
    };
    const onError = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport,
      _watchFn,
      debounceMs: 0,
      onError,
    });

    hot.attach(makeMockHandle() as any);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toBe('No app config found');
  });

  it('continues watching after error', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    // First call fails, second succeeds
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ exports: { default: rawConfig }, elapsed: 3 });
    const onError = vi.fn();
    const onReload = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      onError,
      onReload,
    });

    hot.attach(makeMockHandle() as any);

    // First change → error
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();

    // Second change → success
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
