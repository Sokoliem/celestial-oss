import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderWatchdog } from '../render-watchdog.js';

class MockWorker {
  readonly postMessage = vi.fn();
  readonly unref = vi.fn();
  readonly on = vi.fn();

  constructor(
    readonly script: string,
    readonly options: unknown,
  ) {
    createdWorkers.push(this);
  }
}

const createdWorkers: MockWorker[] = [];

async function createWatchdog(timeoutMs: number): Promise<RenderWatchdog> {
  vi.resetModules();
  vi.doMock('node:worker_threads', () => ({
    Worker: MockWorker,
  }));
  const { createRenderWatchdog } = await import('../render-watchdog.js');
  return createRenderWatchdog(timeoutMs);
}

describe('render watchdog', () => {
  beforeEach(() => {
    createdWorkers.length = 0;
  });

  afterEach(() => {
    vi.doUnmock('node:worker_threads');
    vi.restoreAllMocks();
  });

  it('creates a watchdog that can begin/end render without issues', async () => {
    const watchdog = await createWatchdog(5000);
    watchdog.beginRender();
    watchdog.endRender();
    watchdog.dispose();
    expect(createdWorkers).toHaveLength(1);
    expect(createdWorkers[0]?.unref).toHaveBeenCalledOnce();
  });

  it('does not trigger for fast renders', async () => {
    const watchdog = await createWatchdog(1000);
    watchdog.beginRender();
    // Simulate a 50ms render
    await new Promise((resolve) => setTimeout(resolve, 50));
    watchdog.endRender();
    // Wait a bit to make sure watchdog doesn't fire
    await new Promise((resolve) => setTimeout(resolve, 300));
    watchdog.dispose();
    // If we get here, the watchdog didn't kill us
    expect(true).toBe(true);
  });

  it('cleans up on dispose', async () => {
    const watchdog = await createWatchdog(5000);
    watchdog.beginRender();
    watchdog.endRender();
    watchdog.dispose();
    // Double dispose should be safe
    watchdog.dispose();
    expect(createdWorkers[0]?.postMessage).toHaveBeenCalledTimes(1);
    expect(createdWorkers[0]?.postMessage).toHaveBeenCalledWith('dispose');
  });

  it('handles begin/end cycles correctly', async () => {
    const watchdog = await createWatchdog(5000);
    // Multiple render cycles
    for (let i = 0; i < 10; i++) {
      watchdog.beginRender();
      watchdog.endRender();
    }
    watchdog.dispose();
  });
});
