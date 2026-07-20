import { describe, expect, it } from 'vitest';
import { createProfiler, profilerPlugin } from '../profiler.js';

describe('telescope profiler re-exports', () => {
  it('createProfiler returns a Profiler with frame budget defaults', () => {
    const profiler = createProfiler();
    expect(typeof profiler.beginFrame).toBe('function');
    expect(typeof profiler.endFrame).toBe('function');
    expect(profiler.frameBudget).toBe(16);
    expect(profiler.getFrames()).toEqual([]);
  });

  it('profilerPlugin wraps a config so update/view dispatch is measured', () => {
    const profiler = createProfiler();
    const plugin = profilerPlugin<{ n: number }, { type: 'inc' }>(profiler);
    const baseConfig = {
      init: () => [{ n: 0 }, { kind: 'none' as const }] as const,
      update: (msg: { type: 'inc' }, model: { n: number }) => [msg.type === 'inc' ? { n: model.n + 1 } : model, { kind: 'none' as const }] as const,
      view: (model: { n: number }) => ({ kind: 'text' as const, content: String(model.n) }) as never,
      subscriptions: () => ({ kind: 'batch' as const, subs: [] }) as never,
    };
    const wrapped = plugin.wrap(baseConfig as never);
    expect(typeof wrapped.update).toBe('function');
    expect(typeof wrapped.view).toBe('function');
  });

  it('honors ProfilerOptions like tracing', () => {
    const profiler = createProfiler({ tracing: true });
    expect(profiler.tracer).not.toBeNull();
  });
});
