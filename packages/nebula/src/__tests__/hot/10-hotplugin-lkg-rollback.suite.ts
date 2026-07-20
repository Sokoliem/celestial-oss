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

// ─── Last-known-good rollback ───────────────────────────────────────────────

describe('hotPlugin LKG rollback', () => {
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

  it('rolls back to last-known-good config after consecutive failures', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    // Successful load → 2 failures
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ exports: { default: rawConfig }, elapsed: 2 })
      .mockRejectedValueOnce(new Error('first fail'))
      .mockRejectedValueOnce(new Error('second fail'));

    const onRollback = vi.fn();
    const onError = vi.fn();
    const handle = makeMockHandle();

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      rollbackAfter: 2,
      onError,
      onRollback,
    });

    hot.attach(handle as any);

    // Cycle 1: success — establish LKG
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(handle.replaceConfig).toHaveBeenCalledTimes(1);

    // Cycle 2: fail
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onRollback).not.toHaveBeenCalled();

    // Cycle 3: fail again — should trigger LKG rollback
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onRollback.mock.calls[0]![0]).toMatchObject({
      reason: 'consecutive-failures',
      consecutiveFailures: 2,
    });

    // Verify rollback called replaceConfig with the LKG config
    expect(handle.replaceConfig).toHaveBeenCalledTimes(2);
    const [rollbackConfig, rollbackOpts] = handle.replaceConfig.mock.calls[1]!;
    expect(rollbackConfig).toHaveProperty('view');
    expect(rollbackOpts).toMatchObject({ validate: true });
  });

  it('does not roll back without an established LKG', async () => {
    const _watchFn = mockWatchFn();
    // First two loads fail outright; no LKG ever captured.
    const loader = vi.fn().mockRejectedValue(new Error('always fails'));
    const onRollback = vi.fn();
    const onError = vi.fn();

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      rollbackAfter: 2,
      onError,
      onRollback,
    });

    hot.attach(makeMockHandle() as any);

    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onRollback).not.toHaveBeenCalled();
  });

  it('rollbackToLastGood() rolls back externally with no failures', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = vi.fn().mockResolvedValueOnce({ exports: { default: rawConfig }, elapsed: 1 });
    const onRollback = vi.fn();
    const handle = makeMockHandle();

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      onRollback,
    });

    hot.attach(handle as any);

    // Establish LKG via a successful reload
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(handle.replaceConfig).toHaveBeenCalledTimes(1);

    // External rollback request — no consecutive failures, no LKG miss
    const rolled = hot.rollbackToLastGood('test-trigger');
    expect(rolled).toBe(true);
    expect(handle.replaceConfig).toHaveBeenCalledTimes(2);
    expect(onRollback).toHaveBeenCalledWith(expect.objectContaining({ reason: 'external-request', detail: 'test-trigger' }));
  });

  it('rollbackToLastGood() returns false when no LKG is available', async () => {
    const _watchFn = mockWatchFn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(makeMockHandle() as any);
    expect(hot.rollbackToLastGood('test')).toBe(false);
  });

  it('resets failure counter after a successful reload', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ exports: { default: rawConfig }, elapsed: 1 })
      .mockRejectedValueOnce(new Error('fail-A'))
      .mockResolvedValueOnce({ exports: { default: rawConfig }, elapsed: 2 })
      .mockRejectedValueOnce(new Error('fail-B'));

    const onRollback = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      rollbackAfter: 2,
      onRollback,
    });

    hot.attach(makeMockHandle() as any);

    for (let i = 0; i < 4; i++) {
      watchCallbacks[0]!('change', 'app.ts');
      await vi.advanceTimersByTimeAsync(10);
    }

    // Sequence: success → fail → success → fail
    // The single trailing failure should NOT trigger rollback because the
    // counter was reset by the success.
    expect(onRollback).not.toHaveBeenCalled();
  });
});
