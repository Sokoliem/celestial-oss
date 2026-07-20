// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it, vi } from 'vitest';

// ─── Bug N5: devPlugin never closes file watchers on shutdown ───────────────

describe('Bug N5: devPlugin should close watchers on process exit', () => {
  it('should register a process exit handler that closes watchers', async () => {
    const { devPlugin } = await import('../../dev.js');

    const closedWatchers: string[] = [];
    const mockWatchFn = (watchPath: string, _opts: { recursive: boolean }, _cb: Function) => ({
      close: () => {
        closedWatchers.push(watchPath);
      },
    });

    const exitHandlers: Array<() => void> = [];
    const origOn = process.on.bind(process);
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'exit') {
        exitHandlers.push(handler as () => void);
      }
      return origOn(event as 'exit', handler as () => void);
    }) as typeof process.on);

    const plugin = devPlugin({
      watch: ['/fake/src', '/fake/lib'],
      _watchFn: mockWatchFn as any,
    });

    // Plugin must have a wrap function when watch paths are provided
    expect(plugin.wrap).toBeDefined();

    const mockConfig = {
      init: () => [{ count: 0 }, { kind: 'none' }] as any,
      update: (_msg: any, model: any) => [model, { kind: 'none' }] as any,
      view: () => ({ kind: 'text', content: 'hi' }) as any,
      subscriptions: () => ({ kind: 'none' }) as any,
    };

    const wrappedConfig = plugin.wrap!(mockConfig);
    wrappedConfig.init();

    // Simulate process exit — should close watchers
    for (const handler of exitHandlers) {
      handler();
    }

    // After fix: watchers should be closed
    expect(closedWatchers).toContain('/fake/src');
    expect(closedWatchers).toContain('/fake/lib');

    processOnSpy.mockRestore();
  });
});
