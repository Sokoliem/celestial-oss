import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCapabilityRegistry } from '../registry.js';
import type { CapabilityChange } from '../watcher.js';
import { capabilitySubHandler, createCapabilityWatcher } from '../watcher.js';

/** Flush all pending microtasks (Promise callbacks, async/await continuations). */
async function flushMicrotasks(): Promise<void> {
  // Several `await`s are needed because chained promise chains may not resolve
  // in a single microtask tick.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('createCapabilityWatcher()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('subscribe returns an unsubscribe function', () => {
    const registry = createCapabilityRegistry();
    const watcher = createCapabilityWatcher(registry, { pollMs: 0 });
    const unsub = watcher.subscribe(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('stop() does not throw before start()', () => {
    const registry = createCapabilityRegistry();
    const watcher = createCapabilityWatcher(registry, { pollMs: 0 });
    expect(() => watcher.stop()).not.toThrow();
  });

  it('start() is idempotent (does not double-start)', async () => {
    const registry = createCapabilityRegistry();
    registry.register({ id: 'x', detect: () => 1, default: 0 });
    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });

    watcher.start();
    watcher.start(); // second start — no-op

    // Flush the bootstrap async microtasks
    await flushMicrotasks();

    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    // Advance by one poll cycle — should only get one call (not two)
    await vi.advanceTimersByTimeAsync(100);

    watcher.stop();
    // No change fired (value stayed the same)
    expect(changes.length).toBe(0);
  });

  it('fires change event when a capability value changes on poll', async () => {
    const registry = createCapabilityRegistry();
    let counter = 0;
    registry.register({ id: 'count', detect: () => ++counter, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 200, listenTtyResize: false });

    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    watcher.start();
    // Let bootstrap settle
    await flushMicrotasks();

    // Advance past one poll cycle
    await vi.advanceTimersByTimeAsync(250);
    await flushMicrotasks();

    watcher.stop();

    // At least one change should have been emitted
    expect(changes.length).toBeGreaterThan(0);
    const last = changes[changes.length - 1]!;
    expect(last.id).toBe('count');
    expect(typeof last.next).toBe('number');
  });

  it('does NOT fire when value is stable', async () => {
    const registry = createCapabilityRegistry();
    registry.register({ id: 'stable', detect: () => 'same', default: '' });

    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });
    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    watcher.start();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    watcher.stop();

    // The value never changed — should have no events after bootstrap
    expect(changes.length).toBe(0);
  });

  it('unsubscribe stops delivery', async () => {
    const registry = createCapabilityRegistry();
    let n = 0;
    registry.register({ id: 'n', detect: () => ++n, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });
    const received: CapabilityChange[] = [];
    const unsub = watcher.subscribe((c) => received.push(c));

    watcher.start();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(150);
    await flushMicrotasks();

    unsub();
    const countBeforeUnsub = received.length;

    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();
    watcher.stop();

    // After unsubscribing, no new events should arrive
    expect(received.length).toBe(countBeforeUnsub);
  });

  it('invalidate() immediately re-detects a single capability', async () => {
    const registry = createCapabilityRegistry();
    let val = 'first';
    registry.register({ id: 'cap', detect: () => val, default: '' });

    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: false });

    watcher.start();
    await flushMicrotasks();

    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    val = 'second';
    await watcher.invalidate('cap');

    expect(changes).toHaveLength(1);
    expect(changes[0]!.id).toBe('cap');
    expect(changes[0]!.next).toBe('second');

    watcher.stop();
  });

  it('invalidate() does not fire when value unchanged', async () => {
    const registry = createCapabilityRegistry();
    registry.register({ id: 'cap', detect: () => 'fixed', default: '' });

    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: false });
    watcher.start();
    await flushMicrotasks();

    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    await watcher.invalidate('cap');

    expect(changes).toHaveLength(0);
    watcher.stop();
  });

  it('invalidateAll() re-detects all capabilities', async () => {
    const registry = createCapabilityRegistry();
    let a = 1;
    let b = 10;
    registry.register({ id: 'a', detect: () => a, default: 0 });
    registry.register({ id: 'b', detect: () => b, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: false });
    watcher.start();
    await flushMicrotasks();

    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    a = 2;
    b = 20;
    await watcher.invalidateAll();

    const ids = changes.map((c) => c.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    watcher.stop();
  });

  it('subscriber exceptions do not crash the watcher', async () => {
    const registry = createCapabilityRegistry();
    let v = 0;
    registry.register({ id: 'v', detect: () => ++v, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });

    watcher.subscribe(() => {
      throw new Error('subscriber crash');
    });

    watcher.start();
    await flushMicrotasks();

    await expect(vi.advanceTimersByTimeAsync(200)).resolves.not.toThrow();
    await flushMicrotasks();
    watcher.stop();
  });

  it('stop() clears poll timer', async () => {
    const registry = createCapabilityRegistry();
    let n = 0;
    registry.register({ id: 'n', detect: () => ++n, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });
    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    watcher.start();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(150);
    await flushMicrotasks();
    watcher.stop();

    const countAtStop = changes.length;
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    // No new events after stop
    expect(changes.length).toBe(countAtStop);
  });

  it('ignores a stale bootstrap after stop and restart', async () => {
    const registry = createCapabilityRegistry();
    const resolvers: Array<(value: number) => void> = [];
    registry.register({
      id: 'slow',
      detect: () => new Promise<number>((resolve) => resolvers.push(resolve)),
      default: 0,
    });
    const listeners = new Set<() => void>();
    const mockStdout = {
      on: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
      removeListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
    };
    vi.stubGlobal('process', { env: {}, stdout: mockStdout });
    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: true });

    watcher.start();
    await flushMicrotasks();
    watcher.stop();
    watcher.start();
    await flushMicrotasks();
    expect(resolvers).toHaveLength(2);

    resolvers[0]!(1);
    await flushMicrotasks();
    expect(listeners).toHaveLength(0);

    resolvers[1]!(2);
    await flushMicrotasks();
    expect(listeners).toHaveLength(1);
    watcher.stop();
    expect(listeners).toHaveLength(0);
  });

  it('responds to TTY resize event', async () => {
    const registry = createCapabilityRegistry();
    let colorLevel = 'none';
    registry.register({ id: 'color', detect: () => colorLevel, default: 'none' });

    // Mock stdout with on/removeListener
    const listeners = new Map<string, Set<() => void>>();
    const mockStdout = {
      on: vi.fn((event: string, cb: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
      }),
      removeListener: vi.fn((event: string, cb: () => void) => {
        listeners.get(event)?.delete(cb);
      }),
    };
    vi.stubGlobal('process', { env: {}, stdout: mockStdout });

    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: true });
    const changes: CapabilityChange[] = [];
    watcher.subscribe((c) => changes.push(c));

    watcher.start();
    await flushMicrotasks();

    // Simulate a resize that also changes a capability
    colorLevel = 'truecolor';
    listeners.get('resize')?.forEach((cb) => cb());
    await flushMicrotasks();

    expect(changes.some((c) => c.id === 'color' && c.next === 'truecolor')).toBe(true);

    watcher.stop();
  });
});

describe('capabilitySubHandler()', () => {
  it('calls dispatch with toMsg result on capability change', async () => {
    vi.useFakeTimers();

    const registry = createCapabilityRegistry();
    let v = 0;
    registry.register({ id: 'cap', detect: () => ++v, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });
    watcher.start();
    await flushMicrotasks();

    const dispatched: unknown[] = [];
    const handler = capabilitySubHandler(watcher, (change) => ({ type: 'CapChanged', change }));
    const unsub = handler((msg) => dispatched.push(msg));

    await vi.advanceTimersByTimeAsync(150);
    await flushMicrotasks();

    expect(dispatched.length).toBeGreaterThan(0);
    expect((dispatched[0] as { type: string }).type).toBe('CapChanged');

    unsub();
    watcher.stop();
    vi.useRealTimers();
  });
});
