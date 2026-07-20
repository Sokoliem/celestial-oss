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

function createMockTerminal(): { terminal: TerminalBackend; state: MockTerminalState } {
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

  describe('installCrashRecovery', () => {
    it('registers handlers for uncaughtException, unhandledRejection, SIGINT, SIGTERM', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal } = createMockTerminal();

      installCrashRecovery({ terminal });

      expect(mockProcess.handlers.get('uncaughtException')?.size).toBeGreaterThanOrEqual(1);
      expect(mockProcess.handlers.get('unhandledRejection')?.size).toBeGreaterThanOrEqual(1);
      expect(mockProcess.handlers.get('SIGINT')?.size).toBeGreaterThanOrEqual(1);
      expect(mockProcess.handlers.get('SIGTERM')?.size).toBeGreaterThanOrEqual(1);
    });

    it('saves terminal reference for later restoration', async () => {
      const { cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal } = createMockTerminal();

      const guard = installCrashRecovery({ terminal });

      // The guard should be returned and have an uninstall method
      expect(guard).toBeDefined();
      expect(typeof guard.uninstall).toBe('function');
    });
  });

  describe('terminal state restoration on uncaught exception', () => {
    it('restores terminal state: alt screen off, cursor visible, mouse disabled, raw mode off, attributes reset', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();
      state.rawMode = true; // Simulate that we are in raw mode

      installCrashRecovery({ terminal });

      // Simulate an uncaught exception
      const handlers = mockProcess.handlers.get('uncaughtException');
      expect(handlers?.size).toBeGreaterThanOrEqual(1);
      const handler = [...handlers!][0]!;
      handler(new Error('test crash'));

      // Verify terminal state was restored
      const output = state.writes.join('');
      expect(output).toContain('\x1b[?1049l'); // alt screen exit
      expect(output).toContain('\x1b[?25h'); // cursor show
      expect(output).toContain('\x1b[0m'); // reset attributes
      expect(state.rawMode).toBe(false); // raw mode exited

      // Mouse tracking disabled sequences
      expect(output).toContain('\x1b[?1003l'); // all motion tracking off
    });

    it('writes crash report to stderr', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal } = createMockTerminal();

      installCrashRecovery({ terminal });

      const handlers = mockProcess.handlers.get('uncaughtException');
      const handler = [...handlers!][0]!;
      const testError = new Error('something went wrong');
      handler(testError);

      expect(stderrSpy).toHaveBeenCalled();
      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('something went wrong');

      stderrSpy.mockRestore();
    });

    it('includes model snapshot in crash report when provided', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal } = createMockTerminal();

      const modelSnapshot = { count: 42, status: 'running' };
      installCrashRecovery({ terminal, getModel: () => modelSnapshot });

      const handlers = mockProcess.handlers.get('uncaughtException');
      const handler = [...handlers!][0]!;
      handler(new Error('crash with model'));

      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('42');

      stderrSpy.mockRestore();
    });

    it('exits the process with code 1 after uncaught exception', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal } = createMockTerminal();

      installCrashRecovery({ terminal });

      const handlers = mockProcess.handlers.get('uncaughtException');
      const handler = [...handlers!][0]!;
      handler(new Error('fatal'));

      expect(mockProcess.exited).toBe(true);
      expect(mockProcess.exitCode).toBe(1);
    });
  });

  describe('terminal state restoration on unhandled rejection', () => {
    it('restores terminal state on unhandled promise rejection', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();
      state.rawMode = true;

      installCrashRecovery({ terminal });

      const handlers = mockProcess.handlers.get('unhandledRejection');
      const handler = [...handlers!][0]!;
      handler(new Error('promise rejected'), Promise.resolve());

      const output = state.writes.join('');
      expect(output).toContain('\x1b[?1049l'); // alt screen exit
      expect(output).toContain('\x1b[?25h'); // cursor show
      expect(state.rawMode).toBe(false);

      expect(mockProcess.exited).toBe(true);
      expect(mockProcess.exitCode).toBe(1);
    });
  });

  describe('signal handling (SIGINT/SIGTERM)', () => {
    it('restores terminal state on SIGINT', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();
      state.rawMode = true;

      installCrashRecovery({ terminal });

      const handlers = mockProcess.handlers.get('SIGINT');
      const handler = [...handlers!][0]!;
      handler();

      const output = state.writes.join('');
      expect(output).toContain('\x1b[?1049l');
      expect(output).toContain('\x1b[?25h');
      expect(state.rawMode).toBe(false);

      expect(mockProcess.exited).toBe(true);
      expect(mockProcess.exitCode).toBe(130); // Standard SIGINT exit code
    });

    it('restores terminal state on SIGTERM', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();
      state.rawMode = true;

      installCrashRecovery({ terminal });

      const handlers = mockProcess.handlers.get('SIGTERM');
      const handler = [...handlers!][0]!;
      handler();

      const output = state.writes.join('');
      expect(output).toContain('\x1b[?1049l');
      expect(output).toContain('\x1b[?25h');
      expect(state.rawMode).toBe(false);

      expect(mockProcess.exited).toBe(true);
      expect(mockProcess.exitCode).toBe(143); // Standard SIGTERM exit code
    });
  });

  describe('cleanup runs exactly once', () => {
    it('does not double-cleanup when multiple signals fire', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();
      state.rawMode = true;

      installCrashRecovery({ terminal });

      // Fire SIGINT
      const sigintHandler = [...mockProcess.handlers.get('SIGINT')!][0]!;
      sigintHandler();

      const writesAfterFirst = state.writes.length;

      // Fire uncaughtException after SIGINT already cleaned up
      const exceptionHandler = [...mockProcess.handlers.get('uncaughtException')!][0]!;
      exceptionHandler(new Error('second'));

      // No additional writes should have happened (cleanup already ran)
      expect(state.writes.length).toBe(writesAfterFirst);
    });

    it('does not double-cleanup when uninstall is called then signal fires', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();
      state.rawMode = true;

      const guard = installCrashRecovery({ terminal });

      // Uninstall (normal shutdown path)
      guard.uninstall();

      // All handlers should be removed
      expect(mockProcess.handlers.get('uncaughtException')?.size ?? 0).toBe(0);
      expect(mockProcess.handlers.get('unhandledRejection')?.size ?? 0).toBe(0);
      expect(mockProcess.handlers.get('SIGINT')?.size ?? 0).toBe(0);
      expect(mockProcess.handlers.get('SIGTERM')?.size ?? 0).toBe(0);
    });
  });

  describe('uninstall does not restore terminal', () => {
    it('uninstall only removes handlers without writing to terminal', async () => {
      const { cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal, state } = createMockTerminal();

      const guard = installCrashRecovery({ terminal });

      const writesBeforeUninstall = state.writes.length;
      guard.uninstall();

      // Uninstall should NOT write to terminal — the app's own shutdown handles that
      expect(state.writes.length).toBe(writesBeforeUninstall);
    });
  });

  describe('crash log file', () => {
    it('writes crash log to specified file path when crashLogPath is set', async () => {
      const { mockProcess, cleanup } = createMockProcess();
      cleanupProcess = cleanup;

      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      const writeFileMock = vi.fn();

      const { installCrashRecovery } = await import('../../../crash-recovery.js');
      const { terminal } = createMockTerminal();

      installCrashRecovery({
        terminal,
        crashLogPath: '/tmp/crash.log',
        getModel: () => ({ count: 99 }),
        writeFile: writeFileMock,
      });

      const handlers = mockProcess.handlers.get('uncaughtException');
      const handler = [...handlers!][0]!;
      handler(new Error('log this'));

      expect(writeFileMock).toHaveBeenCalledTimes(1);
      const [path, content] = writeFileMock.mock.calls[0]!;
      expect(path).toBe('/tmp/crash.log');
      expect(content).toContain('log this');
      expect(content).toContain('99');
    });
  });
});
