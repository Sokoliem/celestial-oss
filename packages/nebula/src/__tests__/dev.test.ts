import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../app.js';
import { devPlugin, loadState, saveState, withStateRecovery } from '../dev.js';
import { text } from '../elements.js';
import { Cmd, Sub } from '../types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

type TestModel = { count: number };
type TestMsg = { type: 'increment' } | { type: 'tick' };

function makeTestConfig(): AppConfig<TestModel, TestMsg> {
  return {
    init: () => [{ count: 0 }, Cmd.none()],
    update: (msg, model) => {
      switch (msg.type) {
        case 'increment':
          return [{ count: model.count + 1 }, Cmd.none()];
        case 'tick':
          return [model, Cmd.none()];
      }
    },
    view: (model) => text(`Count: ${model.count}`),
    subscriptions: () => Sub.none(),
  };
}

/**
 * Find and remove any state files created during tests.
 * State files are stored in os.tmpdir() with the pattern celestui-dev-state-*.json.
 */
function cleanupStateFiles(): void {
  const tmpDir = os.tmpdir();
  try {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      if (file.startsWith('celestui-dev-state-') && file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(tmpDir, file));
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch {
    // Ignore if tmpdir is unreadable
  }
}

// ─── saveState ──────────────────────────────────────────────────────────────

describe('saveState', () => {
  afterEach(() => {
    cleanupStateFiles();
  });

  it('writes model to a temp file and returns the path', () => {
    const model: TestModel = { count: 42 };
    const filePath = saveState(model);

    expect(filePath).toBeTruthy();
    expect(fs.existsSync(filePath)).toBe(true);

    const contents = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(contents);
    expect(parsed).toEqual({ count: 42 });
  });

  it('creates the file in the system temp directory', () => {
    const model: TestModel = { count: 0 };
    const filePath = saveState(model);

    expect(filePath.startsWith(os.tmpdir())).toBe(true);
  });

  it('uses the celestui-dev-state prefix in the filename', () => {
    const model: TestModel = { count: 1 };
    const filePath = saveState(model);
    const filename = path.basename(filePath);

    expect(filename).toMatch(/^celestui-dev-state-/);
    expect(filename).toMatch(/\.json$/);
  });

  it('serializes complex models correctly', () => {
    const complexModel = {
      count: 10,
      items: ['a', 'b'],
      nested: { x: 1, y: null },
    };
    const filePath = saveState(complexModel);

    const contents = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(contents);
    expect(parsed).toEqual(complexModel);
  });
});

// ─── loadState ──────────────────────────────────────────────────────────────

describe('loadState', () => {
  afterEach(() => {
    cleanupStateFiles();
  });

  it('reads saved model from a temp file', () => {
    const model: TestModel = { count: 99 };
    saveState(model);

    const loaded = loadState<TestModel>();
    expect(loaded).toEqual({ count: 99 });
  });

  it('returns null when no state file exists', () => {
    // Ensure no state files exist
    cleanupStateFiles();

    const loaded = loadState<TestModel>();
    expect(loaded).toBeNull();
  });

  it('returns null for stale state (>30s old)', () => {
    const model: TestModel = { count: 5 };
    const filePath = saveState(model);

    // Manually set the file mtime to 31 seconds ago
    const staleTime = new Date(Date.now() - 31_000);
    fs.utimesSync(filePath, staleTime, staleTime);

    const loaded = loadState<TestModel>();
    expect(loaded).toBeNull();
  });

  it('deletes the state file after reading', () => {
    const model: TestModel = { count: 7 };
    const filePath = saveState(model);

    expect(fs.existsSync(filePath)).toBe(true);

    loadState<TestModel>();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('deletes stale state file even when returning null', () => {
    const model: TestModel = { count: 3 };
    const filePath = saveState(model);

    // Make it stale
    const staleTime = new Date(Date.now() - 31_000);
    fs.utimesSync(filePath, staleTime, staleTime);

    loadState<TestModel>();

    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ─── withStateRecovery ──────────────────────────────────────────────────────

describe('withStateRecovery', () => {
  afterEach(() => {
    cleanupStateFiles();
  });

  it('uses saved state when available', () => {
    const savedModel: TestModel = { count: 50 };
    saveState(savedModel);

    const originalInit = (): [TestModel, Cmd<TestMsg>] => [{ count: 0 }, Cmd.none()];
    const recoveredInit = withStateRecovery<TestModel, TestMsg>(originalInit);

    const [model, cmd] = recoveredInit();
    expect(model).toEqual({ count: 50 });
    expect(cmd._tag).toBe('cmd');
  });

  it('falls back to original init when no saved state exists', () => {
    cleanupStateFiles();

    const originalInit = (): [TestModel, Cmd<TestMsg>] => [{ count: 0 }, Cmd.none()];
    const recoveredInit = withStateRecovery<TestModel, TestMsg>(originalInit);

    const [model] = recoveredInit();
    expect(model).toEqual({ count: 0 });
  });

  it('falls back to original init when saved state is stale', () => {
    const savedModel: TestModel = { count: 50 };
    const filePath = saveState(savedModel);

    // Make it stale
    const staleTime = new Date(Date.now() - 31_000);
    fs.utimesSync(filePath, staleTime, staleTime);

    const originalInit = (): [TestModel, Cmd<TestMsg>] => [{ count: 0 }, Cmd.none()];
    const recoveredInit = withStateRecovery<TestModel, TestMsg>(originalInit);

    const [model] = recoveredInit();
    expect(model).toEqual({ count: 0 });
  });

  it('preserves the original Cmd from init when using saved state', () => {
    const savedModel: TestModel = { count: 50 };
    saveState(savedModel);

    const originalInit = (): [TestModel, Cmd<TestMsg>] => [{ count: 0 }, Cmd.none()];
    const recoveredInit = withStateRecovery<TestModel, TestMsg>(originalInit);

    const [, cmd] = recoveredInit();
    // Even when using saved state, we still get Cmd.none() from the original init
    expect(cmd._tag).toBe('cmd');
  });
});

// ─── devPlugin ──────────────────────────────────────────────────────────────

describe('devPlugin', () => {
  it('creates a valid plugin with the name "dev"', () => {
    const plugin = devPlugin<TestModel, TestMsg>();
    expect(plugin.name).toBe('dev');
  });

  it('is a no-op when no watch patterns are specified', () => {
    const plugin = devPlugin<TestModel, TestMsg>();
    // No wrap function should exist when there's nothing to watch
    expect(plugin.wrap).toBeUndefined();
  });

  it('is a no-op when watch array is empty', () => {
    const plugin = devPlugin<TestModel, TestMsg>({ watch: [] });
    expect(plugin.wrap).toBeUndefined();
  });

  it('has a wrap function when watch patterns are specified', () => {
    const plugin = devPlugin<TestModel, TestMsg>({ watch: ['./src'] });
    expect(plugin.wrap).toBeDefined();
  });

  it('wraps config to set up file watching on init', () => {
    const mockWatchFn = vi.fn().mockReturnValue({ close: vi.fn() });

    const plugin = devPlugin<TestModel, TestMsg>({
      watch: ['./src'],
      _watchFn: mockWatchFn,
    });
    const config = makeTestConfig();
    const wrapped = plugin.wrap!(config);

    // Calling init should trigger the watch function
    wrapped.init();
    expect(mockWatchFn).toHaveBeenCalledTimes(1);
    expect(mockWatchFn).toHaveBeenCalledWith('./src', { recursive: true }, expect.any(Function));
  });

  it('calls onFileChange callback when a file changes', () => {
    let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;
    const mockWatchFn = vi.fn().mockImplementation((_path: string, _opts: object, cb: (eventType: string, filename: string | null) => void) => {
      watchCallback = cb;
      return { close: vi.fn() };
    });

    const onFileChange = vi.fn();

    const plugin = devPlugin<TestModel, TestMsg>({
      watch: ['./src'],
      onFileChange,
      debounceMs: 0, // Disable debounce for test
      _watchFn: mockWatchFn,
    });
    const config = makeTestConfig();
    const wrapped = plugin.wrap!(config);
    wrapped.init();

    // Simulate a file change
    expect(watchCallback).not.toBeNull();
    watchCallback!('change', 'app.ts');

    expect(onFileChange).toHaveBeenCalledWith('app.ts');
  });

  it('debounces rapid file changes', () => {
    let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;
    const mockWatchFn = vi.fn().mockImplementation((_path: string, _opts: object, cb: (eventType: string, filename: string | null) => void) => {
      watchCallback = cb;
      return { close: vi.fn() };
    });

    const onFileChange = vi.fn();

    vi.useFakeTimers();

    try {
      const plugin = devPlugin<TestModel, TestMsg>({
        watch: ['./src'],
        onFileChange,
        debounceMs: 300,
        _watchFn: mockWatchFn,
      });
      const config = makeTestConfig();
      const wrapped = plugin.wrap!(config);
      wrapped.init();

      // Fire multiple rapid changes
      watchCallback!('change', 'a.ts');
      watchCallback!('change', 'b.ts');
      watchCallback!('change', 'c.ts');

      // No calls yet — debounced
      expect(onFileChange).not.toHaveBeenCalled();

      // Advance past the debounce window
      vi.advanceTimersByTime(300);

      // Only the last change should have triggered the callback
      expect(onFileChange).toHaveBeenCalledTimes(1);
      expect(onFileChange).toHaveBeenCalledWith('c.ts');
    } finally {
      vi.useRealTimers();
    }
  });

  it('watches multiple paths when multiple are specified', () => {
    const mockWatchFn = vi.fn().mockReturnValue({ close: vi.fn() });

    const plugin = devPlugin<TestModel, TestMsg>({
      watch: ['./src', './lib'],
      _watchFn: mockWatchFn,
    });
    const config = makeTestConfig();
    const wrapped = plugin.wrap!(config);
    wrapped.init();

    expect(mockWatchFn).toHaveBeenCalledTimes(2);
    expect(mockWatchFn).toHaveBeenCalledWith('./src', { recursive: true }, expect.any(Function));
    expect(mockWatchFn).toHaveBeenCalledWith('./lib', { recursive: true }, expect.any(Function));
  });

  it('tracks model changes through update for state saving', () => {
    const mockWatchFn = vi.fn().mockReturnValue({ close: vi.fn() });
    const onFileChange = vi.fn();

    const plugin = devPlugin<TestModel, TestMsg>({
      watch: ['./src'],
      onFileChange,
      _watchFn: mockWatchFn,
    });
    const config = makeTestConfig();
    const wrapped = plugin.wrap!(config);
    wrapped.init();

    // Update should still pass through to the original config
    const [newModel, cmd] = wrapped.update({ type: 'increment' }, { count: 0 });
    expect(newModel).toEqual({ count: 1 });
    expect(cmd._tag).toBe('cmd');
  });
});
