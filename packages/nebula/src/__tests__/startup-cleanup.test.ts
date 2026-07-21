import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import { ansi, type TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';

function createMockTerminal(): TerminalBackend & {
  enterRawMode: ReturnType<typeof vi.fn>;
  exitRawMode: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  throwOnWrite: boolean;
  offInput: ReturnType<typeof vi.fn>;
  offResize: ReturnType<typeof vi.fn>;
} {
  const terminal = {
    throwOnWrite: false,
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: vi.fn(() => {
      if (terminal.throwOnWrite) throw new Error('terminal write failed');
    }),
    onInput: vi.fn(),
    offInput: vi.fn(),
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
  return terminal;
}

describe('app startup and shutdown cleanup', () => {
  it('does not replace methods on a caller-owned terminal backend', () => {
    const terminal = createMockTerminal();
    const originalWrite = terminal.write;
    const config: AppConfig<null, never> = {
      init: () => [null, Cmd.none()],
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('terminal'),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, { terminal });
    expect(terminal.write).toBe(originalWrite);
    handle.stop();
  });

  it('restores the terminal and detaches handlers when startup throws', () => {
    const terminal = createMockTerminal();
    const config: AppConfig<null, never> = {
      init: () => [null, Cmd.none()],
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('startup'),
      subscriptions: () => {
        throw new Error('subscriptions failed');
      },
    };

    expect(() => app(config, { terminal })).toThrow('subscriptions failed');
    expect(terminal.enterRawMode).toHaveBeenCalledOnce();
    expect(terminal.exitRawMode).toHaveBeenCalledOnce();
    expect(terminal.offInput).toHaveBeenCalled();
    expect(terminal.offResize).toHaveBeenCalled();
  });

  it('leaves raw mode if terminal setup itself fails', () => {
    const terminal = createMockTerminal();
    terminal.throwOnWrite = true;
    const config: AppConfig<null, never> = {
      init: () => [null, Cmd.none()],
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('startup'),
      subscriptions: () => Sub.none(),
    };

    expect(() => app(config, { terminal })).toThrow('terminal write failed');
    expect(terminal.enterRawMode).toHaveBeenCalledOnce();
    expect(terminal.write).toHaveBeenCalledWith(ansi.cursorShow);
    expect(terminal.write).toHaveBeenCalledWith(ansi.altScreenExit);
    expect(terminal.exitRawMode).toHaveBeenCalledOnce();
  });

  it('always exits raw mode even when terminal teardown writes fail', () => {
    const terminal = createMockTerminal();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config: AppConfig<null, never> = {
      init: () => [null, Cmd.none()],
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('shutdown'),
      subscriptions: () => Sub.none(),
    };
    const handle = app(config, { terminal });
    terminal.throwOnWrite = true;

    expect(() => handle.stop()).not.toThrow();
    expect(terminal.write).toHaveBeenCalledWith(ansi.cursorShow);
    expect(terminal.write).toHaveBeenCalledWith(ansi.altScreenExit);
    expect(terminal.exitRawMode).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Terminal session cleanup failed'));
    stderr.mockRestore();
  });

  it('continues detaching handlers after one backend cleanup fails', () => {
    const terminal = createMockTerminal();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config: AppConfig<null, never> = {
      init: () => [null, Cmd.none()],
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('shutdown'),
      subscriptions: () => Sub.none(),
    };
    const handle = app(config, { terminal });
    terminal.offInput.mockImplementation(() => {
      throw new Error('input detach failed');
    });

    expect(() => handle.stop()).not.toThrow();
    expect(terminal.offResize).toHaveBeenCalledOnce();
    expect(terminal.exitRawMode).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Runtime handler cleanup failed'));
    stderr.mockRestore();
  });

  it('keeps suspend and resume recoverable after terminal backend failures', () => {
    const terminal = createMockTerminal();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config: AppConfig<null, never> = {
      init: () => [null, Cmd.none()],
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('suspend'),
      subscriptions: () => Sub.none(),
    };
    const handle = app(config, { terminal });

    terminal.throwOnWrite = true;
    expect(() => handle.suspend()).not.toThrow();
    expect(terminal.exitRawMode).toHaveBeenCalledOnce();

    expect(() => handle.resume()).not.toThrow();
    expect(terminal.exitRawMode).toHaveBeenCalledTimes(2);

    terminal.throwOnWrite = false;
    handle.resume();
    expect(terminal.enterRawMode).toHaveBeenCalledTimes(3);

    handle.stop();
    expect(terminal.exitRawMode).toHaveBeenCalledTimes(3);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Terminal cleanup during suspend failed'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Resume failed'));
    stderr.mockRestore();
  });
});
