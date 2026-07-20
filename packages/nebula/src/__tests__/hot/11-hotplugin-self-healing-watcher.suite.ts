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

function makeMockHandle() {
  return {
    stop: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    replaceConfig: vi.fn(),
    model: { count: 0, label: 'test' },
  };
}

// ─── Self-healing watchers ──────────────────────────────────────────────────

describe('hotPlugin self-healing watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces watch errors via onWatchError callback', async () => {
    // Simulate a watchFn that throws synchronously on first arm and succeeds on retry.
    let armCount = 0;
    const watchPaths: string[] = [];
    const _watchFn = (p: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      armCount++;
      watchPaths.push(p);
      if (armCount <= 1) {
        throw new Error('mock arm failure');
      }
      return { close: vi.fn() };
    };

    const onWatchError = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
      onWatchError,
      maxWatchRecoveries: 5,
    });

    hot.attach(makeMockHandle() as any);

    // First arm throws → onWatchError fires recoverable=true → re-arm scheduled
    expect(onWatchError).toHaveBeenCalledTimes(1);
    expect(onWatchError.mock.calls[0]![0]).toMatchObject({ recoverable: true, attempt: 1 });

    // Advance time past the backoff and verify the second arm succeeds.
    await vi.advanceTimersByTimeAsync(500);
    expect(armCount).toBeGreaterThanOrEqual(2);
  });

  it('stops re-arming after maxWatchRecoveries failures', async () => {
    let armCount = 0;
    const _watchFn = (_p: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      armCount++;
      throw new Error('persistent failure');
    };

    const onWatchError = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
      onWatchError,
      maxWatchRecoveries: 3,
    });

    hot.attach(makeMockHandle() as any);

    // Advance through enough backoff windows to exhaust the retry budget.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5500);
    }

    // Final attempt should be marked recoverable=false; subsequent ones don't fire.
    const finalCall = onWatchError.mock.calls.at(-1)?.[0];
    expect(finalCall.recoverable).toBe(false);
    // The wrapper should have stopped re-arming once recoverable was false.
    expect(armCount).toBeLessThanOrEqual(4); // 1 initial + 3 retries
  });

  it('does not self-heal when maxWatchRecoveries is 0', () => {
    let armCount = 0;
    const _watchFn = (_p: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      armCount++;
      throw new Error('fail');
    };

    const onWatchError = vi.fn();
    hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
      onWatchError,
      maxWatchRecoveries: 0,
    }).attach(makeMockHandle() as any);

    expect(armCount).toBe(1);
    expect(onWatchError).toHaveBeenCalled();
    expect(onWatchError.mock.calls[0]![0]).toMatchObject({ recoverable: false });
  });
});
