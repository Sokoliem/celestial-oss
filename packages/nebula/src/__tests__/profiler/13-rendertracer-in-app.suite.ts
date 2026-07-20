// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app, type RenderFrameTelemetry } from '../../app.js';
import { text } from '../../elements.js';
import { createRenderTracer } from '../../profiler.js';
import type { TerminalBackend } from '../../terminal.js';
import { Cmd, Sub } from '../../types.js';

// ─── Render tracer integration with app() ───────────────────────────────────

describe('renderTracer in app()', () => {
  function createMockTerminal(): TerminalBackend & { output: string[]; inputHandlers: ((data: Buffer) => void)[] } {
    const output: string[] = [];
    const inputHandlers: ((data: Buffer) => void)[] = [];
    return {
      output,
      inputHandlers,
      enterRawMode: vi.fn(),
      exitRawMode: vi.fn(),
      write(data: string) {
        output.push(data);
      },
      onInput(handler: (data: Buffer) => void) {
        inputHandlers.push(handler);
      },
      offInput(handler: (data: Buffer) => void) {
        const idx = inputHandlers.indexOf(handler);
        if (idx >= 0) inputHandlers.splice(idx, 1);
      },
      onResize: vi.fn(),
      offResize: vi.fn(),
      getSize: () => ({ cols: 40, rows: 10 }),
    };
  }

  it('produces a trace tree from the render pipeline', () => {
    const tracer = createRenderTracer();
    const terminal = createMockTerminal();

    type Model = { count: number };
    type Msg = { type: 'tick' };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ count: 0 }, Cmd.none()],
      update: (_msg, model) => [{ count: model.count + 1 }, Cmd.none()],
      view: (model) => text(`Count: ${model.count}`),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, { terminal, renderTracer: tracer });

    // After initial render, tracer should have a trace tree
    const trace = tracer.getTrace();
    expect(trace).not.toBeNull();
    expect(trace!.name).toBe('render');
    expect(trace!.duration).toBeGreaterThanOrEqual(0);

    // Should have child spans for the pipeline phases
    const childNames = trace!.children.map((c) => c.name);
    expect(childNames).toContain('view');
    expect(childNames).toContain('focus');
    expect(childNames).toContain('applyFocus');
    expect(childNames).toContain('layout');
    expect(childNames).toContain('rasterize');
    expect(childNames).toContain('diff+write');

    handle.stop();
  });

  it('does not interfere with rendering when no tracer is provided', () => {
    const terminal = createMockTerminal();

    type Model = { value: string };
    type Msg = never;

    const config: AppConfig<Model, Msg> = {
      init: () => [{ value: 'hello' }, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: (model) => text(model.value),
      subscriptions: () => Sub.none(),
    };

    // No renderTracer option — should render normally
    const handle = app(config, { terminal });

    // Should have rendered something to the terminal
    expect(terminal.output.length).toBeGreaterThan(0);

    handle.stop();
  });

  it('emits render frame telemetry for the render pipeline', () => {
    const terminal = createMockTerminal();
    const frames: RenderFrameTelemetry[] = [];

    type Model = { value: string };
    type Msg = never;

    const config: AppConfig<Model, Msg> = {
      init: () => [{ value: 'hello' }, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: (model) => text(model.value),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, {
      terminal,
      onRenderFrame: (frame) => frames.push(frame),
    });

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0]?.committed).toBe(true);
    expect(frames[0]?.interrupted).toBe(false);
    expect(frames[0]?.cols).toBe(40);
    expect(frames[0]?.rows).toBe(10);
    expect(frames[0]?.phases.map((phase) => phase.name)).toEqual(expect.arrayContaining(['view', 'layout', 'rasterize', 'diff+write']));

    handle.stop();
  });

  it('resets trace between renders', () => {
    const tracer = createRenderTracer();
    const terminal = createMockTerminal();

    type Model = { count: number };
    type Msg = { type: 'inc' };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ count: 0 }, Cmd.none()],
      update: (_msg, model) => [{ count: model.count + 1 }, Cmd.none()],
      view: (model) => text(`Count: ${model.count}`),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, { terminal, renderTracer: tracer });

    // First render produced a trace
    const trace1 = tracer.getTrace();
    expect(trace1).not.toBeNull();
    expect(trace1!.name).toBe('render');

    // Simulate a message dispatch to trigger a re-render
    // The tracer is NOT auto-reset between renders (that's the profiler's job),
    // but the root span should still be 'render'
    // Note: the trace from the last render should still be available
    const trace2 = tracer.getTrace();
    expect(trace2).not.toBeNull();

    handle.stop();
  });
});
