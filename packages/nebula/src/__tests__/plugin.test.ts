import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../app.js';
import { text } from '../elements.js';
import { createPlugin, loggerPlugin, type Plugin, withPlugins } from '../plugin.js';
import { Cmd, Sub } from '../types.js';
import type { VNode } from '../vdom.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

type TestModel = { count: number };
type TestMsg = { type: 'increment' } | { type: 'decrement' };

function makeTestConfig(): AppConfig<TestModel, TestMsg> {
  return {
    init: () => [{ count: 0 }, Cmd.none()],
    update: (msg, model) => {
      switch (msg.type) {
        case 'increment':
          return [{ count: model.count + 1 }, Cmd.none()];
        case 'decrement':
          return [{ count: model.count - 1 }, Cmd.none()];
      }
    },
    view: (model) => text(`Count: ${model.count}`),
    subscriptions: () => Sub.none(),
  };
}

// ─── withPlugins ─────────────────────────────────────────────────────────────

describe('withPlugins', () => {
  it('returns config unchanged when no plugins are provided', () => {
    const config = makeTestConfig();
    const result = withPlugins(config, []);

    expect(result).toBe(config);
  });

  it('applies a wrap plugin that transforms init', () => {
    const config = makeTestConfig();
    const plugin: Plugin<TestModel, TestMsg> = {
      name: 'init-override',
      wrap: (cfg) => ({
        ...cfg,
        init: () => {
          const [model, cmd] = cfg.init();
          return [{ count: model.count + 10 }, cmd];
        },
      }),
    };

    const result = withPlugins(config, [plugin]);
    const [model] = result.init();

    expect(model.count).toBe(10);
  });

  it('applies a wrap plugin that transforms update', () => {
    const config = makeTestConfig();
    const plugin: Plugin<TestModel, TestMsg> = {
      name: 'double-increment',
      wrap: (cfg) => ({
        ...cfg,
        update: (msg, model) => {
          const [newModel, cmd] = cfg.update(msg, model);
          if (msg.type === 'increment') {
            return [{ count: newModel.count + 1 }, cmd];
          }
          return [newModel, cmd];
        },
      }),
    };

    const result = withPlugins(config, [plugin]);
    const [model] = result.update({ type: 'increment' }, { count: 0 });

    // Original +1, plugin +1 = 2
    expect(model.count).toBe(2);
  });

  it('applies a wrap plugin that transforms view', () => {
    const config = makeTestConfig();
    const plugin: Plugin<TestModel, TestMsg> = {
      name: 'view-prefix',
      wrap: (cfg) => ({
        ...cfg,
        view: (model) => text(`[Plugin] ${(cfg.view(model) as { content: string }).content}`),
      }),
    };

    const result = withPlugins(config, [plugin]);
    const vnode = result.view({ count: 5 }) as { kind: string; content: string };

    expect(vnode.kind).toBe('text');
    expect(vnode.content).toBe('[Plugin] Count: 5');
  });

  it('composes multiple plugins left-to-right', () => {
    const config = makeTestConfig();
    const order: string[] = [];

    const pluginA: Plugin<TestModel, TestMsg> = {
      name: 'plugin-a',
      wrap: (cfg) => ({
        ...cfg,
        init: () => {
          order.push('A');
          return cfg.init();
        },
      }),
    };

    const pluginB: Plugin<TestModel, TestMsg> = {
      name: 'plugin-b',
      wrap: (cfg) => ({
        ...cfg,
        init: () => {
          order.push('B');
          return cfg.init();
        },
      }),
    };

    // Applied left-to-right: A wraps first, then B wraps A.
    // When init is called, B's wrapper runs first (outermost),
    // then calls cfg.init() which is A's wrapper.
    const result = withPlugins(config, [pluginA, pluginB]);
    result.init();

    expect(order).toEqual(['B', 'A']);
  });

  it('skips plugins without a wrap function', () => {
    const config = makeTestConfig();
    const plugin: Plugin<TestModel, TestMsg> = {
      name: 'no-op-plugin',
      // No wrap function
    };

    const result = withPlugins(config, [plugin]);

    // Should be the same config object since nothing wrapped it
    expect(result).toBe(config);
  });
});

// ─── createPlugin ────────────────────────────────────────────────────────────

describe('createPlugin', () => {
  it('creates a plugin with the given name', () => {
    const plugin = createPlugin<TestModel, TestMsg>('my-plugin', {});
    expect(plugin.name).toBe('my-plugin');
  });

  it('fires onInit hook when init is called', () => {
    const onInit = vi.fn();
    const plugin = createPlugin<TestModel, TestMsg>('init-hook', { onInit });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    const [model] = result.init();

    expect(onInit).toHaveBeenCalledOnce();
    expect(onInit).toHaveBeenCalledWith({ count: 0 });
    expect(model.count).toBe(0);
  });

  it('fires beforeUpdate hook before update runs', () => {
    const callOrder: string[] = [];

    const plugin = createPlugin<TestModel, TestMsg>('before-hook', {
      beforeUpdate: (msg, model) => {
        callOrder.push(`before:${msg.type}:${model.count}`);
      },
    });

    const config = makeTestConfig();
    // Wrap original update to track call order
    const originalUpdate = config.update;
    config.update = (msg, model) => {
      callOrder.push(`update:${msg.type}:${model.count}`);
      return originalUpdate(msg, model);
    };

    const result = withPlugins(config, [plugin]);
    result.update({ type: 'increment' }, { count: 5 });

    expect(callOrder).toEqual(['before:increment:5', 'update:increment:5']);
  });

  it('fires afterUpdate hook after update runs', () => {
    const afterUpdate = vi.fn();
    const plugin = createPlugin<TestModel, TestMsg>('after-hook', { afterUpdate });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    result.update({ type: 'increment' }, { count: 3 });

    expect(afterUpdate).toHaveBeenCalledOnce();
    expect(afterUpdate).toHaveBeenCalledWith(
      { type: 'increment' },
      { count: 3 }, // prevModel
      { count: 4 }, // nextModel
    );
  });

  it('fires both beforeUpdate and afterUpdate in correct order', () => {
    const callOrder: string[] = [];

    const plugin = createPlugin<TestModel, TestMsg>('both-hooks', {
      beforeUpdate: () => {
        callOrder.push('before');
      },
      afterUpdate: () => {
        callOrder.push('after');
      },
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    result.update({ type: 'increment' }, { count: 0 });

    expect(callOrder).toEqual(['before', 'after']);
  });

  it('applies wrapView hook to transform view output', () => {
    const plugin = createPlugin<TestModel, TestMsg>('view-hook', {
      wrapView: (originalView) => (model) => {
        const inner = originalView(model) as { content: string };
        return text(`Wrapped: ${inner.content}`);
      },
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    const vnode = result.view({ count: 7 }) as { kind: string; content: string };

    expect(vnode.kind).toBe('text');
    expect(vnode.content).toBe('Wrapped: Count: 7');
  });

  it('preserves subscriptions when no subscription hook is provided', () => {
    const plugin = createPlugin<TestModel, TestMsg>('no-sub-hook', {
      onInit: () => {},
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    // subscriptions should be the original function
    expect(result.subscriptions).toBe(config.subscriptions);
  });
});

// ─── loggerPlugin ────────────────────────────────────────────────────────────

describe('loggerPlugin', () => {
  it('captures all messages by default', () => {
    const logger = loggerPlugin<TestModel, TestMsg>();
    const config = makeTestConfig();
    const result = withPlugins(config, [logger]);

    result.update({ type: 'increment' }, { count: 0 });
    result.update({ type: 'decrement' }, { count: 1 });

    // Access the log through the plugin object
    const log = (logger as unknown as { log: Array<{ msg: TestMsg; model: TestModel }> }).log;
    expect(log).toHaveLength(2);
    expect(log[0]!.msg).toEqual({ type: 'increment' });
    expect(log[0]!.model).toEqual({ count: 0 });
    expect(log[1]!.msg).toEqual({ type: 'decrement' });
    expect(log[1]!.model).toEqual({ count: 1 });
  });

  it('respects the filter option', () => {
    const logger = loggerPlugin<TestModel, TestMsg>({
      filter: (msg) => msg.type === 'increment',
    });
    const config = makeTestConfig();
    const result = withPlugins(config, [logger]);

    result.update({ type: 'increment' }, { count: 0 });
    result.update({ type: 'decrement' }, { count: 1 });
    result.update({ type: 'increment' }, { count: 0 });

    const log = (logger as unknown as { log: Array<{ msg: TestMsg; model: TestModel }> }).log;
    expect(log).toHaveLength(2);
    expect(log[0]!.msg).toEqual({ type: 'increment' });
    expect(log[1]!.msg).toEqual({ type: 'increment' });
  });

  it('calls the output callback for each logged message', () => {
    const outputFn = vi.fn();
    const logger = loggerPlugin<TestModel, TestMsg>({ output: outputFn });
    const config = makeTestConfig();
    const result = withPlugins(config, [logger]);

    result.update({ type: 'increment' }, { count: 0 });

    expect(outputFn).toHaveBeenCalledOnce();
    expect(outputFn).toHaveBeenCalledWith({ type: 'increment' }, { count: 0 });
  });

  it('still calls the original update and returns correct result', () => {
    const logger = loggerPlugin<TestModel, TestMsg>();
    const config = makeTestConfig();
    const result = withPlugins(config, [logger]);

    const [model, cmd] = result.update({ type: 'increment' }, { count: 5 });

    expect(model.count).toBe(6);
    expect(cmd._tag).toBe('cmd');
  });
});

// ─── TypeScript type compatibility ───────────────────────────────────────────

describe('Plugin type compatibility', () => {
  it('accepts correctly typed plugins', () => {
    // This test verifies that the TypeScript types work correctly
    // by constructing valid plugin values. If this compiles, the types are correct.
    const plugin: Plugin<TestModel, TestMsg> = {
      name: 'typed-plugin',
      wrap: (config) => {
        // config is correctly typed: AppConfig<TestModel, TestMsg>
        const [model] = config.init();
        expect(model.count).toBeDefined();
        return config;
      },
    };

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    result.init();
  });

  it('supports plugins composed via createPlugin with all hooks', () => {
    const plugin = createPlugin<TestModel, TestMsg>('full-hooks', {
      onInit: (model: TestModel) => {
        expect(typeof model.count).toBe('number');
      },
      beforeUpdate: (msg: TestMsg, model: TestModel) => {
        expect(msg.type).toBeDefined();
        expect(typeof model.count).toBe('number');
      },
      afterUpdate: (_msg: TestMsg, prev: TestModel, next: TestModel) => {
        expect(typeof prev.count).toBe('number');
        expect(typeof next.count).toBe('number');
      },
      wrapView: (view: (model: TestModel) => VNode) => (model: TestModel) => {
        return view(model);
      },
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    result.init();
    result.update({ type: 'increment' }, { count: 0 });
    result.view({ count: 1 });
  });
});
