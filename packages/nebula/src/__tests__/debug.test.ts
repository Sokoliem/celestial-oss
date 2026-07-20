import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../app.js';
import { debugPlugin } from '../debug.js';
import { text } from '../elements.js';
import { withPlugins } from '../plugin.js';
import { Cmd, Sub } from '../types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

type TestModel = { count: number; items: string[] };
type TestMsg = { type: 'increment' } | { type: 'decrement' } | { type: 'setItems'; items: string[] };

function makeTestConfig(): AppConfig<TestModel, TestMsg> {
  return {
    init: () => [{ count: 0, items: [] }, Cmd.none()],
    update: (msg, model) => {
      switch (msg.type) {
        case 'increment':
          return [{ ...model, count: model.count + 1 }, Cmd.none()];
        case 'decrement':
          return [{ ...model, count: model.count - 1 }, Cmd.none()];
        case 'setItems':
          return [{ ...model, items: msg.items }, Cmd.none()];
      }
    },
    view: (model) => text(`Count: ${model.count}`),
    subscriptions: () => Sub.none(),
  };
}

// ─── debugPlugin with no options ────────────────────────────────────────────

describe('debugPlugin with no options', () => {
  it('is a no-op plugin that does not wrap the config', () => {
    const plugin = debugPlugin<TestModel, TestMsg>();
    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    // No wrap function means withPlugins returns the original config
    expect(result).toBe(config);
  });

  it('is a no-op when all options are explicitly false', () => {
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: false,
      logRenders: false,
      logSubscriptions: false,
    });
    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    expect(result).toBe(config);
  });
});

// ─── debugPlugin with logUpdates ────────────────────────────────────────────

describe('debugPlugin with logUpdates', () => {
  it('captures update messages with timing info', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/\[nebula\] update: increment \(\d+\.\d+ms\)/);
  });

  it('includes model diff information when model changes', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });

    expect(lines[0]).toContain('model.count:');
    expect(lines[0]).toContain('0');
    expect(lines[0]).toContain('1');
  });

  it('logs multiple updates in order', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });
    result.update({ type: 'decrement' }, { count: 1, items: [] });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('increment');
    expect(lines[1]).toContain('decrement');
  });

  it('shows array length changes in diff', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'setItems', items: ['a', 'b', 'c'] }, { count: 0, items: [] });

    expect(lines[0]).toContain('setItems');
    // The diff should show items changing from empty array to 3-element array
    expect(lines[0]).toContain('model.items');
  });
});

// ─── debugPlugin with logRenders ────────────────────────────────────────────

describe('debugPlugin with logRenders', () => {
  it('captures render timing when logRenders is true', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logRenders: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.view({ count: 5, items: [] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/\[nebula\] view: rendered \(\d+\.\d+ms\)/);
  });

  it('logs each render call separately', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logRenders: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.view({ count: 1, items: [] });
    result.view({ count: 2, items: [] });
    result.view({ count: 3, items: [] });

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toContain('[nebula] view: rendered');
    }
  });

  it('still returns the original view output', () => {
    const plugin = debugPlugin<TestModel, TestMsg>({
      logRenders: true,
      output: () => {},
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);
    const vnode = result.view({ count: 42, items: [] }) as { kind: string; content: string };

    expect(vnode.kind).toBe('text');
    expect(vnode.content).toBe('Count: 42');
  });
});

// ─── debugPlugin with custom output ─────────────────────────────────────────

describe('debugPlugin with custom output', () => {
  it('routes all log lines through the custom output function', () => {
    const output = vi.fn();
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      logRenders: true,
      output,
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });
    result.view({ count: 1, items: [] });

    // One update log + one render log
    expect(output).toHaveBeenCalledTimes(2);
    expect(output.mock.calls[0]![0]).toContain('[nebula] update:');
    expect(output.mock.calls[1]![0]).toContain('[nebula] view:');
  });
});

// ─── debugPlugin combined options ───────────────────────────────────────────

describe('debugPlugin with combined options', () => {
  it('logs both updates and renders when both are enabled', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      logRenders: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });
    result.view({ count: 1, items: [] });

    const updateLines = lines.filter((l) => l.includes('update:'));
    const renderLines = lines.filter((l) => l.includes('view:'));

    expect(updateLines).toHaveLength(1);
    expect(renderLines).toHaveLength(1);
  });

  it('only logs updates when logRenders is false', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: true,
      logRenders: false,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });
    result.view({ count: 1, items: [] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('update:');
  });

  it('only logs renders when logUpdates is false', () => {
    const lines: string[] = [];
    const plugin = debugPlugin<TestModel, TestMsg>({
      logUpdates: false,
      logRenders: true,
      output: (line) => lines.push(line),
    });

    const config = makeTestConfig();
    const result = withPlugins(config, [plugin]);

    result.update({ type: 'increment' }, { count: 0, items: [] });
    result.view({ count: 1, items: [] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('view:');
  });
});

// ─── debugPlugin has correct name ───────────────────────────────────────────

describe('debugPlugin metadata', () => {
  it('has the name "debug"', () => {
    const plugin = debugPlugin<TestModel, TestMsg>({ logUpdates: true });
    expect(plugin.name).toBe('debug');
  });

  it('has the name "debug" even when no-op', () => {
    const plugin = debugPlugin<TestModel, TestMsg>();
    expect(plugin.name).toBe('debug');
  });
});
