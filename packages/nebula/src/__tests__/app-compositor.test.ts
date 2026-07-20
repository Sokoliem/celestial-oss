import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { box, overlay, text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';

function createMockTerminal(): TerminalBackend & { output: string[]; inputHandlers: Array<(data: Buffer) => void> } {
  const output: string[] = [];
  const inputHandlers: Array<(data: Buffer) => void> = [];
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
      const index = inputHandlers.indexOf(handler);
      if (index >= 0) {
        inputHandlers.splice(index, 1);
      }
    },
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 12 }),
  };
}

describe('app compositor integration', () => {
  it('keeps scheduling visual frames while an overlay layoutId is animating', async () => {
    vi.useFakeTimers();

    try {
      type Model = { x: number; moved: boolean };
      type Msg = { type: 'move' };

      const terminal = createMockTerminal();
      const config: AppConfig<Model, Msg> = {
        init: () => [{ x: 1, moved: false }, Cmd.none()],
        update: (_msg, _model) => [{ x: 8, moved: true }, Cmd.none()],
        view: (model) =>
          overlay(box(text('drag')), {
            x: model.x,
            y: 2,
            width: 8,
            height: 3,
            zIndex: 3,
            layoutId: 'drag-window',
          }),
        subscriptions: (model) => (model.moved ? Sub.none() : Sub.timer(1, () => ({ type: 'move' }))),
      };

      const handle = app(config, {
        terminal,
        syncOutput: false,
        compositor: {
          animateOnlyOverrides: true,
          overrides: new Map([['drag-window', { duration: 64 }]]),
        },
      });

      const initialWrites = terminal.output.length;
      await vi.advanceTimersByTimeAsync(20);
      const afterMoveWrites = terminal.output.length;
      await vi.advanceTimersByTimeAsync(80);
      const afterAnimationWrites = terminal.output.length;

      expect(afterMoveWrites).toBeGreaterThan(initialWrites);
      expect(afterAnimationWrites).toBeGreaterThan(afterMoveWrites);

      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
