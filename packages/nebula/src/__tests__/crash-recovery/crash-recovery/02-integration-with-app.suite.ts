// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalBackend } from '../../../terminal.js';

// ---------------------------------------------------------------------------
// Mock terminal factory
// ---------------------------------------------------------------------------

interface MockTerminalState {
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
  rawMode: boolean;
  size: { cols: number; rows: number };
}

function _createMockTerminal(): { terminal: TerminalBackend; state: MockTerminalState } {
  const state: MockTerminalState = {
    writes: [],
    inputHandler: null,
    resizeHandler: null,
    rawMode: false,
    size: { cols: 80, rows: 24 },
  };

  const terminal: TerminalBackend = {
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

  return { terminal, state };
}

// ---------------------------------------------------------------------------
// Mock process signals — we need to intercept process.on / process.removeListener
// ---------------------------------------------------------------------------

type ProcessHandler = (...args: unknown[]) => void;

interface MockProcessState {
  handlers: Map<string, Set<ProcessHandler>>;
  exitCode: number | undefined;
  exited: boolean;
}

function createMockProcess(): { mockProcess: MockProcessState; cleanup: () => void } {
  const mockProcess: MockProcessState = {
    handlers: new Map(),
    exitCode: undefined,
    exited: false,
  };

  const originalOn = process.on.bind(process);
  const originalRemoveListener = process.removeListener.bind(process);
  const originalExit = process.exit.bind(process);

  // Track handlers registered by our code
  const trackedEvents = new Set(['uncaughtException', 'unhandledRejection', 'SIGINT', 'SIGTERM']);

  process.on = vi.fn(((event: string, handler: ProcessHandler) => {
    if (trackedEvents.has(event)) {
      if (!mockProcess.handlers.has(event)) {
        mockProcess.handlers.set(event, new Set());
      }
      mockProcess.handlers.get(event)!.add(handler);
      return process;
    }
    return originalOn(event, handler);
  }) as typeof process.on);

  process.removeListener = vi.fn(((event: string, handler: ProcessHandler) => {
    if (trackedEvents.has(event)) {
      mockProcess.handlers.get(event)?.delete(handler);
      return process;
    }
    return originalRemoveListener(event, handler);
  }) as typeof process.removeListener);

  process.exit = vi.fn(((code?: number) => {
    mockProcess.exitCode = code;
    mockProcess.exited = true;
  }) as typeof process.exit) as never;

  const cleanup = () => {
    process.on = originalOn;
    process.removeListener = originalRemoveListener;
    process.exit = originalExit;
  };

  return { mockProcess, cleanup };
}

describe('crash-recovery', () => {
  let cleanupProcess: () => void;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanupProcess?.();
    vi.restoreAllMocks();
  });

  describe('integration with app()', () => {
    it('crash recovery is registered when app() is called', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      vi.doMock('../terminal.js', async () => {
        const actual = await vi.importActual<typeof import('../../../terminal.js')>('../terminal.js');
        return {
          ...actual,
          createTerminal: () => ({
            enterRawMode() {},
            exitRawMode() {},
            write() {},
            onInput() {},
            offInput() {},
            onResize() {},
            offResize() {},
            getSize() {
              return { cols: 80, rows: 24 };
            },
          }),
        };
      });

      const { app } = await import('../../../app.js');
      const { Cmd, Sub } = await import('../../../types.js');

      const handle = app<number, string>({
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'ok' }),
        subscriptions: () => Sub.none<string>(),
      });

      // Crash recovery handlers should have been registered
      expect(mockProcess.handlers.get('uncaughtException')?.size).toBeGreaterThanOrEqual(1);
      expect(mockProcess.handlers.get('SIGINT')?.size).toBeGreaterThanOrEqual(1);

      handle.stop();
    });

    it('crash recovery is uninstalled when app stops normally', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      vi.doMock('../terminal.js', async () => {
        const actual = await vi.importActual<typeof import('../../../terminal.js')>('../terminal.js');
        return {
          ...actual,
          createTerminal: () => ({
            enterRawMode() {},
            exitRawMode() {},
            write() {},
            onInput() {},
            offInput() {},
            onResize() {},
            offResize() {},
            getSize() {
              return { cols: 80, rows: 24 };
            },
          }),
        };
      });

      const { app } = await import('../../../app.js');
      const { Cmd, Sub } = await import('../../../types.js');

      const handle = app<number, string>({
        init: () => [0, Cmd.none<string>()],
        update: (_msg: string, model: number) => [model, Cmd.none<string>()],
        view: () => ({ kind: 'text' as const, content: 'ok' }),
        subscriptions: () => Sub.none<string>(),
      });

      // Handlers should be registered
      expect(mockProcess.handlers.get('uncaughtException')?.size).toBeGreaterThanOrEqual(1);

      // Normal shutdown via stop()
      handle.stop();

      // Crash recovery handlers should now be removed
      expect(mockProcess.handlers.get('uncaughtException')?.size ?? 0).toBe(0);
      expect(mockProcess.handlers.get('SIGINT')?.size ?? 0).toBe(0);
    });
  });
});
