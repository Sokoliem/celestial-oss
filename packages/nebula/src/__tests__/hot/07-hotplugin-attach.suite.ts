// @ts-nocheck
import path from 'node:path';
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

function makeMockLoader(rawConfig: any) {
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

// ─── hotPlugin: attach + reload ─────────────────────────────────────────────

describe('hotPlugin attach', () => {
  let watchCallbacks: Array<(event: string, filename: string | null) => void>;
  let watchClosers: Array<{ close: ReturnType<typeof vi.fn> }>;

  function mockWatchFn() {
    watchCallbacks = [];
    watchClosers = [];
    return (_path: string, _opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => {
      watchCallbacks.push(cb);
      const closer = { close: vi.fn() };
      watchClosers.push(closer);
      return closer;
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts file watcher on attach', () => {
    const _watchFn = mockWatchFn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
    });

    hot.attach(makeMockHandle() as any);
    expect(watchCallbacks).toHaveLength(1);
  });

  it('watches additional paths when specified', () => {
    const _watchFn = mockWatchFn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      watch: ['/fake/src', '/fake/lib'],
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
    });

    hot.attach(makeMockHandle() as any);
    // entry + 2 additional
    expect(watchCallbacks).toHaveLength(3);
  });

  it('calls loader on file change (debounced)', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 100,
    });

    hot.attach(makeMockHandle() as any);

    // Trigger file change
    watchCallbacks[0]!('change', 'app.ts');

    // Not called yet (debounce)
    expect(loader).not.toHaveBeenCalled();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(150);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ entryPoint: path.resolve('/fake/app.ts') }));
  });

  it('calls replaceConfig with loaded config', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const handle = makeMockHandle();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(handle as any);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(handle.replaceConfig).toHaveBeenCalledTimes(1);
    const [newConfig, opts] = handle.replaceConfig.mock.calls[0]!;
    expect(newConfig).toHaveProperty('init');
    expect(newConfig).toHaveProperty('update');
    expect(newConfig).toHaveProperty('view');
    expect(newConfig).toHaveProperty('subscriptions');
    expect(opts).toHaveProperty('migrate');
  });

  it('calls onReload callback with count and elapsed', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const onReload = vi.fn();
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
      onReload,
    });

    hot.attach(makeMockHandle() as any);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledWith({ count: 1, elapsed: 5 });
  });

  it('watches watchPackageDirs recursively', () => {
    const watchPaths: Array<{ path: string; recursive: boolean }> = [];
    const _watchFn = (watchPath: string, opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      watchPaths.push({ path: watchPath, recursive: opts.recursive });
      return { close: vi.fn() };
    };

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader: vi.fn(),
      resolveExport: vi.fn(),
      watchPackageDirs: ['/fake/packages/quasar/src', '/fake/packages/horizon/src'],
      _watchFn,
    });

    hot.attach(makeMockHandle() as any);

    // entry (non-recursive) + 2 package dirs (recursive)
    expect(watchPaths).toHaveLength(3);
    expect(watchPaths[0]).toEqual({ path: expect.stringContaining('app.ts'), recursive: false });
    expect(watchPaths[1]).toEqual({ path: expect.stringContaining('quasar'), recursive: true });
    expect(watchPaths[2]).toEqual({ path: expect.stringContaining('horizon'), recursive: true });
  });

  it('file change in watchPackageDirs triggers reload', async () => {
    const callbacks: Array<(event: string, filename: string | null) => void> = [];
    const _watchFn = (_path: string, _opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => {
      callbacks.push(cb);
      return { close: vi.fn() };
    };

    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      watchPackageDirs: ['/fake/packages/quasar/src'],
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(makeMockHandle() as any);

    // callbacks[0] is entry watcher, callbacks[1] is package dir watcher
    expect(callbacks).toHaveLength(2);

    // Trigger change from package dir watcher
    callbacks[1]!('change', 'component.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('ignores watched file events when shouldReload returns false', async () => {
    const callbacks: Array<(event: string, filename: string | null) => void> = [];
    const _watchFn = (_path: string, _opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => {
      callbacks.push(cb);
      return { close: vi.fn() };
    };

    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const shouldReload = vi.fn().mockReturnValue(false);
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      watch: ['/fake/src'],
      loader,
      resolveExport: makeMockResolveExport(),
      shouldReload,
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(makeMockHandle() as any);
    callbacks[1]!('change', 'index.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(shouldReload).toHaveBeenCalledWith({
      watchPath: path.resolve('/fake/src'),
      event: 'change',
      filename: 'index.ts',
      changedPath: path.resolve('/fake/src', 'index.ts'),
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it('uses changedPath null when watcher does not provide a filename', async () => {
    const callbacks: Array<(event: string, filename: string | null) => void> = [];
    const _watchFn = (_path: string, _opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => {
      callbacks.push(cb);
      return { close: vi.fn() };
    };

    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const shouldReload = vi.fn().mockReturnValue(false);
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      shouldReload,
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(makeMockHandle() as any);
    callbacks[0]!('change', null);
    await vi.advanceTimersByTimeAsync(10);

    expect(shouldReload).toHaveBeenCalledWith({
      watchPath: path.resolve('/fake'),
      event: 'change',
      filename: null,
      changedPath: null,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it('watchPackageDirs works alongside watch', () => {
    let watchCount = 0;
    const _watchFn = (_path: string, _opts: { recursive: boolean }, _cb: (event: string, filename: string | null) => void) => {
      watchCount++;
      return { close: vi.fn() };
    };

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      watch: ['/fake/src'],
      watchPackageDirs: ['/fake/packages/quasar/src'],
      loader: vi.fn(),
      resolveExport: vi.fn(),
      _watchFn,
    });

    hot.attach(makeMockHandle() as any);

    // entry + watch[0] + watchPackageDirs[0]
    expect(watchCount).toBe(3);
  });

  it('increments reloadCount on each reload', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = makeMockLoader(rawConfig);
    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
    });

    expect(hot.reloadCount).toBe(0);

    hot.attach(makeMockHandle() as any);

    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(hot.reloadCount).toBe(1);

    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);
    expect(hot.reloadCount).toBe(2);
  });

  it('serializes overlapping reload requests and keeps one pending reload', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const handle = makeMockHandle();
    let activeLoads = 0;
    let maxActiveLoads = 0;
    const resolvers: Array<() => void> = [];
    const loader = vi.fn(
      () =>
        new Promise<{ exports: { default: ReturnType<typeof makeRawConfig> }; elapsed: number }>((resolve) => {
          activeLoads += 1;
          maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
          resolvers.push(() => {
            activeLoads -= 1;
            resolve({ exports: { default: rawConfig }, elapsed: 1 });
          });
        }),
    );

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(handle as any);
    watchCallbacks[0]!('change', 'app.ts');
    watchCallbacks[0]!('change', 'app.ts');
    watchCallbacks[0]!('change', 'app.ts');

    expect(loader).toHaveBeenCalledTimes(1);
    resolvers[0]!();
    await Promise.resolve();
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(2);
    resolvers[1]!();
    await Promise.resolve();
    await Promise.resolve();

    expect(handle.replaceConfig).toHaveBeenCalledTimes(2);
    expect(maxActiveLoads).toBe(1);
  });

  it('passes bustRequireCache to loader on reload', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = vi.fn().mockResolvedValue({
      exports: { default: rawConfig },
      elapsed: 5,
    });

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      bustRequireCache: ['@celestial/nebula', '@celestial/corona'],
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(makeMockHandle() as any);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith({
      entryPoint: path.resolve('/fake/app.ts'),
      bustRequireCache: ['@celestial/nebula', '@celestial/corona'],
    });
  });

  it('omits bustRequireCache from loader call when not specified', async () => {
    const _watchFn = mockWatchFn();
    const rawConfig = makeRawConfig();
    const loader = vi.fn().mockResolvedValue({
      exports: { default: rawConfig },
      elapsed: 5,
    });

    const hot = hotPlugin({
      entry: '/fake/app.ts',
      loader,
      resolveExport: makeMockResolveExport(),
      _watchFn,
      debounceMs: 0,
    });

    hot.attach(makeMockHandle() as any);
    watchCallbacks[0]!('change', 'app.ts');
    await vi.advanceTimersByTimeAsync(10);

    expect(loader).toHaveBeenCalledWith({
      entryPoint: path.resolve('/fake/app.ts'),
      bustRequireCache: undefined,
    });
  });
});
