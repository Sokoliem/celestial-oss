// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig, AppHandle } from '../../app.js';
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

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('hotPlugin lifecycle', () => {
  it('detach stops file watchers', () => {
    const closeFns: Array<ReturnType<typeof vi.fn>> = [];
    const _watchFn = (_path: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      const close = vi.fn();
      closeFns.push(close);
      return { close };
    };

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
    });

    hot.attach(makeMockHandle() as any);
    expect(closeFns).toHaveLength(1);

    hot.detach();
    expect(closeFns[0]).toHaveBeenCalledTimes(1);
  });

  it('reloadCount starts at 0', () => {
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
    });
    expect(hot.reloadCount).toBe(0);
  });

  it('detach closes watchPackageDirs watchers too', () => {
    const closeFns: Array<ReturnType<typeof vi.fn>> = [];
    const _watchFn = (_path: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      const close = vi.fn();
      closeFns.push(close);
      return { close };
    };

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      watchPackageDirs: ['/fake/packages/quasar/src'],
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
    });

    hot.attach(makeMockHandle() as any);
    expect(closeFns).toHaveLength(2); // entry + package dir

    hot.detach();
    expect(closeFns[0]).toHaveBeenCalledTimes(1);
    expect(closeFns[1]).toHaveBeenCalledTimes(1);
  });

  it('double attach cleans up old watchers before creating new ones', () => {
    const closeFns: Array<ReturnType<typeof vi.fn>> = [];
    const _watchFn = (_path: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      const close = vi.fn();
      closeFns.push(close);
      return { close };
    };

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
    });

    const handle1 = makeMockHandle() as unknown as AppHandle;
    const handle2 = makeMockHandle() as unknown as AppHandle;

    hot.attach(handle1);
    expect(closeFns).toHaveLength(1);
    expect(closeFns[0]).not.toHaveBeenCalled();

    // Second attach should close first watcher, then create new one
    hot.attach(handle2);
    expect(closeFns[0]).toHaveBeenCalledTimes(1); // old watcher closed
    expect(closeFns).toHaveLength(2); // new watcher created
  });
});
