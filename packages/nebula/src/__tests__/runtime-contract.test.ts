import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../app.js';
import { text } from '../elements.js';
import type { MachineRegistry, MachineRegistryEntry } from '../machine-registry.js';
import { createPlugin, withPlugins } from '../plugin.js';
import { Cmd, Sub } from '../types.js';

type ContractModel = { count: number };
type ContractMsg = { type: 'increment' } | { type: 'phase'; state: unknown; prev: unknown | null };

function createBaseConfig(): AppConfig<ContractModel, ContractMsg> {
  return {
    init: () => [{ count: 0 }, Cmd.none()],
    update: (msg, model) => {
      if (msg.type === 'increment') {
        return [{ count: model.count + 1 }, Cmd.none()];
      }

      return [model, Cmd.none()];
    },
    view: (model) => text(`Count: ${model.count}`),
    subscriptions: () => Sub.none(),
  };
}

class FakeMachineEntry implements MachineRegistryEntry {
  running = false;
  readonly sendCalls: unknown[] = [];
  private listeners: Array<(state: unknown) => void> = [];

  constructor(readonly machineRef: unknown) {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  send(event: unknown): void {
    this.sendCalls.push(event);
  }

  onTransition(listener: (state: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  emit(state: unknown): void {
    for (const listener of [...this.listeners]) {
      listener(state);
    }
  }
}

function createRegistry() {
  const entries = new Map<string, MachineRegistryEntry>();

  const registry: MachineRegistry = {
    get(id: string): MachineRegistryEntry | undefined {
      return entries.get(id);
    },
    register(id: string, entry: MachineRegistryEntry): void {
      entries.set(id, entry);
    },
    unregister(id: string): void {
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
    set(id: string, entry: MachineRegistryEntry): void {
      registry.register(id, entry);
    },
  };
}

async function loadRuntime() {
  let inputHandler: ((data: Buffer) => void) | null = null;

  vi.resetModules();
  vi.doMock('../terminal.js', async () => {
    const actual = await vi.importActual<typeof import('../terminal.js')>('../terminal.js');
    return {
      ...actual,
      createTerminal: () => ({
        enterRawMode() {},
        exitRawMode() {},
        write() {},
        onInput(handler: (data: Buffer) => void) {
          inputHandler = handler;
        },
        offInput(handler: (data: Buffer) => void) {
          if (inputHandler === handler) inputHandler = null;
        },
        onResize() {},
        offResize() {},
        getSize() {
          return { cols: 80, rows: 24 };
        },
      }),
    };
  });

  const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);
  return {
    app,
    Cmd,
    Sub,
    emitInput(data: string) {
      inputHandler?.(Buffer.from(data));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('nebula runtime contract', () => {
  it('applies plugin lifecycle wrappers without changing the initialized model handoff', () => {
    const order: string[] = [];
    const config = createBaseConfig();

    const pluginA = createPlugin<ContractModel, ContractMsg>('plugin-a', {
      onInit: () => {
        order.push('A:init');
      },
      beforeUpdate: () => {
        order.push('A:before');
      },
      afterUpdate: () => {
        order.push('A:after');
      },
      wrapView: (view) => (model) => {
        order.push('A:view');
        return view(model);
      },
    });

    const pluginB = createPlugin<ContractModel, ContractMsg>('plugin-b', {
      onInit: () => {
        order.push('B:init');
      },
      beforeUpdate: () => {
        order.push('B:before');
      },
      afterUpdate: () => {
        order.push('B:after');
      },
      wrapView: (view) => (model) => {
        order.push('B:view');
        return view(model);
      },
    });

    const wrapped = withPlugins(config, [pluginA, pluginB]);
    const [initialModel] = wrapped.init();
    const [nextModel] = wrapped.update({ type: 'increment' }, initialModel);
    wrapped.view(nextModel);

    expect(order).toEqual(['A:init', 'B:init', 'B:before', 'A:before', 'A:after', 'B:after', 'B:view', 'A:view']);
  });

  it('preserves previous phase snapshots across runtime delivery', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const registry = createRegistry();
    const machineRef = { id: 'contract-machine' };
    const entry = new FakeMachineEntry(machineRef);
    registry.set('phase-contract', entry);
    const seen: Array<{ state: unknown; prev: unknown | null }> = [];

    const handle = app<{}, ContractMsg>({
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'phase') {
          seen.push({ state: msg.state, prev: msg.prev });
        }
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.phase({
          id: 'phase-contract',
          registry: registry.registry,
          machineRef,
          toMsg: (state, prev) => ({ type: 'phase', state, prev }),
        }),
    });

    entry.emit({ value: 'boot' });
    entry.emit({ value: 'ready' });

    expect(seen).toEqual([
      { state: { value: 'boot' }, prev: null },
      { state: { value: 'ready' }, prev: { value: 'boot' } },
    ]);

    handle.stop();
  });
});
