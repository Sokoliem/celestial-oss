import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, type AppOptions, app } from '../app.js';
import { text } from '../elements.js';
import { ansi, type TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';

// ─── Sequence Constants ──────────────────────────────────────────────────────

describe('syncOutput sequences', () => {
  it('should expose syncOutput on the ansi object', () => {
    expect(ansi.syncOutput).toBeDefined();
  });

  it('should have correct DEC private mode 2026 begin sequence', () => {
    // DEC private mode 2026: \x1b[?2026h to begin synchronized update
    expect(ansi.syncOutput.begin).toBe('\x1b[?2026h');
  });

  it('should have correct DEC private mode 2026 end sequence', () => {
    // DEC private mode 2026: \x1b[?2026l to end synchronized update
    expect(ansi.syncOutput.end).toBe('\x1b[?2026l');
  });

  it('should have begin and end as readonly string properties', () => {
    expect(typeof ansi.syncOutput.begin).toBe('string');
    expect(typeof ansi.syncOutput.end).toBe('string');
  });

  it('begin and end should be different sequences', () => {
    expect(ansi.syncOutput.begin).not.toBe(ansi.syncOutput.end);
  });
});

// ─── Mock Terminal ───────────────────────────────────────────────────────────

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

// ─── Render Integration ──────────────────────────────────────────────────────

describe('syncOutput in render pipeline', () => {
  function makeSimpleApp(terminal: TerminalBackend, options?: Partial<AppOptions>): ReturnType<typeof app> {
    type Model = { count: number };
    type Msg = { type: 'tick' };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ count: 0 }, Cmd.none()],
      update: (_msg, model) => [{ ...model, count: model.count + 1 }, Cmd.none()],
      view: (model) => text(`Count: ${model.count}`),
      subscriptions: () => Sub.none(),
    };

    return app(config, { terminal, ...options });
  }

  it('wraps frame render with syncOutput begin/end by default', () => {
    const terminal = createMockTerminal();
    const handle = makeSimpleApp(terminal);

    // Find where syncOutput.begin and syncOutput.end appear in the output
    const beginIndices: number[] = [];
    const endIndices: number[] = [];
    for (let i = 0; i < terminal.output.length; i++) {
      if (terminal.output[i] === ansi.syncOutput.begin) beginIndices.push(i);
      if (terminal.output[i] === ansi.syncOutput.end) endIndices.push(i);
    }

    // Should have at least one begin/end pair from initial render
    expect(beginIndices.length).toBeGreaterThanOrEqual(1);
    expect(endIndices.length).toBeGreaterThanOrEqual(1);

    // Each begin should come before its corresponding end
    expect(beginIndices[0]).toBeLessThan(endIndices[0]!);

    handle.stop();
  });

  it('places render output between syncOutput begin and end', () => {
    const terminal = createMockTerminal();
    const handle = makeSimpleApp(terminal);

    // The clearScreen write (first render) must be between begin and end
    const beginIdx = terminal.output.indexOf(ansi.syncOutput.begin);
    const endIdx = terminal.output.indexOf(ansi.syncOutput.end);
    const clearIdx = terminal.output.indexOf(ansi.clearScreen);

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);
    expect(clearIdx).toBeGreaterThan(beginIdx);
    expect(clearIdx).toBeLessThan(endIdx);

    handle.stop();
  });

  it('wraps subsequent renders with syncOutput', () => {
    const terminal = createMockTerminal();
    const handle = makeSimpleApp(terminal);

    // Verify initial render was wrapped: should see begin before clear and end after render
    const allOutput = terminal.output.join('');
    expect(allOutput).toContain(ansi.syncOutput.begin);
    expect(allOutput).toContain(ansi.syncOutput.end);

    // The begin sequence must appear before the end sequence
    const beginPos = allOutput.indexOf(ansi.syncOutput.begin);
    const endPos = allOutput.indexOf(ansi.syncOutput.end);
    expect(beginPos).toBeLessThan(endPos);

    handle.stop();
  });

  it('can disable syncOutput via options', () => {
    const terminal = createMockTerminal();
    const handle = makeSimpleApp(terminal, { syncOutput: false });

    // Should NOT find any syncOutput sequences in output
    const allOutput = terminal.output.join('');
    expect(allOutput).not.toContain(ansi.syncOutput.begin);
    expect(allOutput).not.toContain(ansi.syncOutput.end);

    handle.stop();
  });

  it('enables syncOutput by default (or when explicitly true)', () => {
    const terminal = createMockTerminal();
    const handle = makeSimpleApp(terminal, { syncOutput: true });

    const allOutput = terminal.output.join('');
    expect(allOutput).toContain(ansi.syncOutput.begin);
    expect(allOutput).toContain(ansi.syncOutput.end);

    handle.stop();
  });
});
