import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MachineRegistry, MachineRegistryEntry } from '../machine-registry.js';

interface RuntimeState {
  size: { cols: number; rows: number };
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
}

class FakeMachineEntry implements MachineRegistryEntry {
  running = false;
  readonly sendCalls: unknown[] = [];
  startCalls = 0;
  stopCalls = 0;
  unsubscribeCalls = 0;
  private listeners: Array<(state: unknown) => void> = [];

  constructor(readonly machineRef: unknown) {}

  start(): void {
    this.running = true;
    this.startCalls++;
  }

  stop(): void {
    this.running = false;
    this.stopCalls++;
  }

  send(event: unknown): void {
    this.sendCalls.push(event);
  }

  onTransition(listener: (state: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.unsubscribeCalls++;
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  emit(state: unknown): void {
    for (const listener of [...this.listeners]) {
      listener(state);
    }
  }

  listenerCount(): number {
    return this.listeners.length;
  }
}

function createTestRegistry() {
  const entries = new Map<string, MachineRegistryEntry>();
  const unregisterCalls: string[] = [];

  const registry: MachineRegistry = {
    get(id: string): MachineRegistryEntry | undefined {
      return entries.get(id);
    },
    register(id: string, entry: MachineRegistryEntry): void {
      entries.set(id, entry);
    },
    unregister(id: string): void {
      unregisterCalls.push(id);
      const entry = entries.get(id);
      if (entry?.running) {
        entry.stop();
      }
      entries.delete(id);
    },
    has(id: string): boolean {
      return entries.has(id);
    },
  };

  return {
    registry,
    unregisterCalls,
    set(id: string, entry: MachineRegistryEntry): void {
      registry.register(id, entry);
    },
  };
}

async function loadRuntime() {
  const state: RuntimeState = {
    size: { cols: 80, rows: 24 },
    writes: [],
    inputHandler: null,
    resizeHandler: null,
  };

  vi.resetModules();
  vi.doMock('../terminal.js', async () => {
    const actual = await vi.importActual<typeof import('../terminal.js')>('../terminal.js');
    return {
      ...actual,
      createTerminal: () => ({
        enterRawMode() {},
        exitRawMode() {},
        write(data: string) {
          state.writes.push(data);
        },
        onInput(handler: (data: Buffer) => void) {
          state.inputHandler = handler;
        },
        offInput(handler: (data: Buffer) => void) {
          if (state.inputHandler === handler) state.inputHandler = null;
        },
        onResize(handler: () => void) {
          state.resizeHandler = handler;
        },
        offResize(handler: () => void) {
          if (state.resizeHandler === handler) state.resizeHandler = null;
        },
        getSize() {
          return state.size;
        },
      }),
    };
  });

  const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);

  return { state, app, Cmd, Sub };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('phase runtime ownership', () => {
  it('starts phase services on subscription and unregisters them when removed', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const machineRef = { id: 'alpha' };
    const entry = new FakeMachineEntry(machineRef);
    testRegistry.set('phase-1', entry);

    type Msg = { type: 'disable' } | { type: 'phase'; state: unknown; prev: unknown | null };

    const handle = app<{ enabled: boolean }, Msg>({
      init: () => [{ enabled: true }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'disable') {
          return [{ enabled: false }, Cmd.none()];
        }

        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        Sub.batch<Msg>(
          Sub.key('d', { type: 'disable' }),
          model.enabled
            ? Sub.phase({
                id: 'phase-1',
                registry: testRegistry.registry,
                machineRef,
                toMsg: (phaseState, prev) => ({ type: 'phase', state: phaseState, prev }),
              })
            : Sub.none(),
        ),
    });

    expect(entry.startCalls).toBe(1);
    expect(entry.running).toBe(true);
    expect(entry.listenerCount()).toBe(1);

    state.inputHandler?.(Buffer.from('d'));

    expect(entry.stopCalls).toBe(1);
    expect(entry.unsubscribeCalls).toBe(1);
    expect(entry.listenerCount()).toBe(0);
    expect(testRegistry.unregisterCalls).toEqual(['phase-1']);
    expect(testRegistry.registry.has('phase-1')).toBe(false);

    handle.stop();
  });

  it('re-subscribes when the machine reference changes', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const phaseMessages: Array<{ state: unknown; prev: unknown | null }> = [];
    const firstRef = { id: 'first' };
    const firstEntry = new FakeMachineEntry(firstRef);
    testRegistry.set('phase-1', firstEntry);
    const secondRef = { id: 'second' };
    const secondEntry = new FakeMachineEntry(secondRef);

    type Msg = { type: 'replace' } | { type: 'phase'; state: unknown; prev: unknown | null };

    const handle = app<{ machineRef: object }, Msg>({
      init: () => [{ machineRef: firstRef }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'replace') {
          testRegistry.set('phase-1', secondEntry);
          return [{ machineRef: secondRef }, Cmd.none()];
        }

        phaseMessages.push({ state: msg.state, prev: msg.prev });
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        Sub.batch<Msg>(
          Sub.key('r', { type: 'replace' }),
          Sub.phase({
            id: 'phase-1',
            registry: testRegistry.registry,
            machineRef: model.machineRef,
            toMsg: (phaseState, prev) => ({ type: 'phase', state: phaseState, prev }),
          }),
        ),
    });

    expect(firstEntry.startCalls).toBe(1);
    expect(firstEntry.listenerCount()).toBe(1);
    expect(secondEntry.startCalls).toBe(0);

    state.inputHandler?.(Buffer.from('r'));

    expect(firstEntry.stopCalls).toBe(1);
    expect(firstEntry.unsubscribeCalls).toBe(1);
    expect(firstEntry.listenerCount()).toBe(0);
    expect(secondEntry.startCalls).toBe(1);
    expect(secondEntry.listenerCount()).toBe(1);

    firstEntry.emit({ step: 'stale' });
    expect(phaseMessages).toHaveLength(0);

    secondEntry.emit({ step: 'fresh' });
    expect(phaseMessages).toHaveLength(1);
    expect(phaseMessages[0]?.state).toEqual({ step: 'fresh' });

    handle.stop();
  });

  it('delivers previous state snapshots for phase transitions', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const machineRef = { id: 'history' };
    const entry = new FakeMachineEntry(machineRef);
    testRegistry.set('phase-1', entry);
    const phaseMessages: Array<{ state: unknown; prev: unknown | null }> = [];

    const handle = app<{}, { type: 'phase'; state: unknown; prev: unknown | null }>({
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        phaseMessages.push({ state: msg.state, prev: msg.prev });
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.phase({
          id: 'phase-1',
          registry: testRegistry.registry,
          machineRef,
          toMsg: (phaseState, prev) => ({ type: 'phase', state: phaseState, prev }),
        }),
    });

    entry.emit({ value: 'one' });
    entry.emit({ value: 'two' });

    expect(phaseMessages).toEqual([
      { state: { value: 'one' }, prev: null },
      { state: { value: 'two' }, prev: { value: 'one' } },
    ]);

    handle.stop();
  });

  it('applies phase filters before dispatching updates', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const machineRef = { id: 'filter' };
    const entry = new FakeMachineEntry(machineRef);
    testRegistry.set('phase-1', entry);
    const phaseMessages: Array<{ state: unknown; prev: unknown | null }> = [];

    const handle = app<{}, { type: 'phase'; state: unknown; prev: unknown | null }>({
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        phaseMessages.push({ state: msg.state, prev: msg.prev });
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.phase({
          id: 'phase-1',
          registry: testRegistry.registry,
          machineRef,
          toMsg: (phaseState, prev) => ({ type: 'phase', state: phaseState, prev }),
          filter: (phaseState) => Boolean((phaseState as { allowed?: boolean }).allowed),
        }),
    });

    entry.emit({ value: 'blocked', allowed: false });
    entry.emit({ value: 'allowed', allowed: true });

    expect(phaseMessages).toEqual([{ state: { value: 'allowed', allowed: true }, prev: null }]);

    handle.stop();
  });

  it('uses the latest phase mapper and filter without restarting the service', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const machineRef = { id: 'latest' };
    const entry = new FakeMachineEntry(machineRef);
    testRegistry.set('phase-1', entry);
    const received: string[] = [];

    type Msg = { type: 'advance' } | { type: 'phase'; value: string };
    const handle = app<{ version: number }, Msg>({
      init: () => [{ version: 0 }, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'advance') return [{ version: 1 }, Cmd.none()];
        received.push(message.value);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        Sub.batch(
          Sub.key('a', { type: 'advance' as const }),
          Sub.phase<Msg>({
            id: 'phase-1',
            registry: testRegistry.registry,
            machineRef,
            filter: (phaseState) => (phaseState as { minimum: number }).minimum <= model.version,
            toMsg: (phaseState) => ({ type: 'phase', value: `${model.version}:${String((phaseState as { value: string }).value)}` }),
          }),
        ),
    });

    entry.emit({ value: 'blocked', minimum: 1 });
    state.inputHandler?.(Buffer.from('a'));
    entry.emit({ value: 'accepted', minimum: 1 });

    expect(received).toEqual(['1:accepted']);
    expect(entry.startCalls).toBe(1);
    expect(entry.unsubscribeCalls).toBe(0);
    handle.stop();
  });

  it('re-subscribes when the registry replaces an entry under the same machine reference', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const machineRef = { id: 'stable-ref' };
    const firstEntry = new FakeMachineEntry(machineRef);
    const secondEntry = new FakeMachineEntry(machineRef);
    testRegistry.set('phase-1', firstEntry);

    type Msg = { type: 'replace' } | { type: 'phase' };
    const handle = app<{}, Msg>({
      init: () => [{}, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'replace') testRegistry.set('phase-1', secondEntry);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch(
          Sub.key('r', { type: 'replace' as const }),
          Sub.phase<Msg>({ id: 'phase-1', registry: testRegistry.registry, machineRef, toMsg: () => ({ type: 'phase' }) }),
        ),
    });

    state.inputHandler?.(Buffer.from('r'));

    expect(firstEntry.stopCalls).toBe(1);
    expect(firstEntry.unsubscribeCalls).toBe(1);
    expect(secondEntry.startCalls).toBe(1);
    expect(secondEntry.listenerCount()).toBe(1);
    handle.stop();
  });

  it('cleans up active phase services on shutdown', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const testRegistry = createTestRegistry();
    const machineRef = { id: 'shutdown' };
    const entry = new FakeMachineEntry(machineRef);
    testRegistry.set('phase-1', entry);

    const handle = app<{}, { type: 'phase'; state: unknown; prev: unknown | null }>({
      init: () => [{}, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.phase({
          id: 'phase-1',
          registry: testRegistry.registry,
          machineRef,
          toMsg: (phaseState, prev) => ({ type: 'phase', state: phaseState, prev }),
        }),
    });

    expect(entry.startCalls).toBe(1);
    expect(testRegistry.registry.has('phase-1')).toBe(true);

    handle.stop();

    expect(entry.stopCalls).toBe(1);
    expect(entry.unsubscribeCalls).toBe(1);
    expect(testRegistry.unregisterCalls).toEqual(['phase-1']);
    expect(testRegistry.registry.has('phase-1')).toBe(false);
  });
});
