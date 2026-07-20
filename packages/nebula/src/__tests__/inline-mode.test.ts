import { afterEach, describe, expect, it, vi } from 'vitest';

interface RuntimeState {
  size: { cols: number; rows: number };
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
  rawMode: boolean;
}

function createMockTerminalState(): RuntimeState {
  return {
    size: { cols: 80, rows: 24 },
    writes: [],
    inputHandler: null,
    resizeHandler: null,
    rawMode: false,
  };
}

function createMockTerminal(state: RuntimeState) {
  return {
    enterRawMode() {
      state.rawMode = true;
    },
    exitRawMode() {
      state.rawMode = false;
    },
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
  };
}

async function loadRuntime() {
  vi.resetModules();

  const state = createMockTerminalState();

  vi.doMock('../terminal.js', async () => {
    const actual = await vi.importActual<typeof import('../terminal.js')>('../terminal.js');
    return {
      ...actual,
      createTerminal: () => createMockTerminal(state),
    };
  });

  const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);

  return { state, app, Cmd, Sub };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

const ALT_SCREEN_ENTER = '\x1b[?1049h';
const ALT_SCREEN_EXIT = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

describe('inline mode', () => {
  it('does NOT emit alternate screen sequences when inline is set', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'hello' }),
        subscriptions: () => Sub.none<string>(),
      },
      { inline: { height: 5 } },
    );

    const allOutput = state.writes.join('');
    expect(allOutput).not.toContain(ALT_SCREEN_ENTER);

    handle.stop();

    const allOutputAfterStop = state.writes.join('');
    expect(allOutputAfterStop).not.toContain(ALT_SCREEN_EXIT);
  });

  it('emits newlines to reserve space for the inline region', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const height = 7;

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'hello' }),
        subscriptions: () => Sub.none<string>(),
      },
      { inline: { height } },
    );

    const allOutput = state.writes.join('');
    // Should emit exactly `height` newlines followed by cursor-up to return to start
    expect(allOutput).toContain('\n'.repeat(height));
    expect(allOutput).toContain(`\x1b[${height}A`);

    handle.stop();
  });

  it('uses default height of 10 when inline is true (boolean)', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'hello' }),
        subscriptions: () => Sub.none<string>(),
      },
      { inline: true },
    );

    const allOutput = state.writes.join('');
    // Default height = 10
    expect(allOutput).toContain('\n'.repeat(10));
    expect(allOutput).toContain(`\x1b[10A`);

    handle.stop();
  });

  it('clips render output to the specified inline height', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const inlineHeight = 3;

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'hello' }),
        subscriptions: () => Sub.none<string>(),
      },
      { inline: { height: inlineHeight } },
    );

    // The render should use the inline height, not the full terminal height.
    // We verify by checking that planLayout was called with inlineHeight rows.
    // The output should not contain cursor positions beyond inlineHeight.
    const allOutput = state.writes.join('');

    // In inline mode, cursor-to positions (1-based) should never exceed inlineHeight
    const cursorToPattern = /\x1b\[(\d+);(\d+)H/g;
    let match = cursorToPattern.exec(allOutput);
    while (match !== null) {
      const row = parseInt(match[1]!, 10);
      expect(row).toBeLessThanOrEqual(inlineHeight);
      match = cursorToPattern.exec(allOutput);
    }

    handle.stop();
  });

  it('moves cursor below content and shows cursor on cleanup', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const inlineHeight = 5;

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'hello' }),
        subscriptions: () => Sub.none<string>(),
      },
      { inline: { height: inlineHeight } },
    );

    // Clear writes so we can inspect just the shutdown sequence
    state.writes.length = 0;
    handle.stop();

    const shutdownOutput = state.writes.join('');

    // Should move cursor down to below the inline region
    expect(shutdownOutput).toContain(`\x1b[${inlineHeight}B`);
    // Should show cursor
    expect(shutdownOutput).toContain(CURSOR_SHOW);
    // Should print a trailing newline to separate from future output
    expect(shutdownOutput).toContain('\n');
    // Should NOT emit alternate screen exit
    expect(shutdownOutput).not.toContain(ALT_SCREEN_EXIT);
  });

  it('fullscreen mode (default) is unchanged - still uses alternate screen', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    const handle = app({
      init: () => [0, Cmd.none<string>()],
      update: (_msg: string, model: number) => [model, Cmd.none<string>()],
      view: () => ({ kind: 'text' as const, content: 'hello' }),
      subscriptions: () => Sub.none<string>(),
    });

    const allOutput = state.writes.join('');
    expect(allOutput).toContain(ALT_SCREEN_ENTER);

    handle.stop();

    const allOutputAfterStop = state.writes.join('');
    expect(allOutputAfterStop).toContain(ALT_SCREEN_EXIT);
  });

  it('saves and restores cursor position during render cycle', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model + 1, Cmd.none<string>()],
        view: (model: number) => ({ kind: 'text' as const, content: `count: ${model}` }),
        subscriptions: () => Sub.key('a', 'inc'),
      },
      { inline: { height: 5 } },
    );

    // Save cursor = \x1b7, restore cursor = \x1b8
    const SAVE_CURSOR = '\x1b7';
    const RESTORE_CURSOR = '\x1b8';

    const initOutput = state.writes.join('');

    // Startup saves cursor once (DECSC) and the initial render both restores and saves
    // Total: at least 2 saves (startup + render) and at least 1 restore (render)
    const saveCount = initOutput.split(SAVE_CURSOR).length - 1;
    const restoreCount = initOutput.split(RESTORE_CURSOR).length - 1;

    expect(saveCount).toBeGreaterThanOrEqual(2);
    expect(restoreCount).toBeGreaterThanOrEqual(1);

    handle.stop();
  });

  it('hides the cursor during inline rendering', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    const handle = app(
      {
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'hello' }),
        subscriptions: () => Sub.none<string>(),
      },
      { inline: { height: 5 } },
    );

    const allOutput = state.writes.join('');
    expect(allOutput).toContain(CURSOR_HIDE);

    handle.stop();
  });
});
