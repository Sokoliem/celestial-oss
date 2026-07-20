// @ts-nocheck
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../app.js';
import { text } from '../../elements.js';
import { withPlugins } from '../../plugin.js';
import { createProfiler, profilerPlugin } from '../../profiler.js';
import { Cmd, Sub } from '../../types.js';

// ─── profilerPlugin ─────────────────────────────────────────────────────────

describe('profilerPlugin', () => {
  type TestModel = { count: number };
  type TestMsg = { type: 'increment' };

  function makeConfig(): AppConfig<TestModel, TestMsg> {
    return {
      init: () => [{ count: 0 }, Cmd.none()],
      update: (_msg, model) => [{ count: model.count + 1 }, Cmd.none()],
      view: (model) => text(`Count: ${model.count}`),
      subscriptions: () => Sub.none(),
    };
  }

  it('creates a plugin named "profiler"', () => {
    const p = createProfiler();
    const plugin = profilerPlugin<TestModel, TestMsg>(p);
    expect(plugin.name).toBe('profiler');
  });

  it('measures update calls via the plugin', () => {
    const p = createProfiler();
    const plugin = profilerPlugin<TestModel, TestMsg>(p);
    const config = withPlugins(makeConfig(), [plugin]);

    config.update({ type: 'increment' }, { count: 0 });

    // The plugin wraps update with beginFrame/endFrame
    const frames = p.getFrames();
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0]!.samples.some((s) => s.name === 'update')).toBe(true);
  });

  it('measures view calls via the plugin', () => {
    const p = createProfiler();
    const plugin = profilerPlugin<TestModel, TestMsg>(p);
    const config = withPlugins(makeConfig(), [plugin]);

    // First trigger an update to get a frame with view measurement
    p.beginFrame();
    config.view({ count: 5 });
    const frame = p.endFrame();

    expect(frame.samples.some((s) => s.name === 'view')).toBe(true);
  });

  it('still returns correct update results', () => {
    const p = createProfiler();
    const plugin = profilerPlugin<TestModel, TestMsg>(p);
    const config = withPlugins(makeConfig(), [plugin]);

    const [model, cmd] = config.update({ type: 'increment' }, { count: 3 });
    expect(model.count).toBe(4);
    expect(cmd._tag).toBe('cmd');
  });
});
