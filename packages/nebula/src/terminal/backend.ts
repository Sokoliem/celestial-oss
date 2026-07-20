import { createWin32InputBridge, needsWin32InputBridge } from '../win32-input.js';

export interface TerminalBackend {
  /** Enter raw mode (disable line buffering, echo, etc.) */
  enterRawMode(): void;
  /** Exit raw mode (restore original terminal settings) */
  exitRawMode(): void;
  /** Write a string to the terminal output */
  write(data: string): void;
  /** Register a handler for raw input data */
  onInput(handler: (data: Buffer) => void): void;
  /** Remove a previously registered input handler */
  offInput(handler: (data: Buffer) => void): void;
  /** Register a handler for terminal resize events */
  onResize(handler: () => void): void;
  /** Remove a previously registered resize handler */
  offResize(handler: () => void): void;
  /** Get the current terminal dimensions */
  getSize(): { cols: number; rows: number };
}

export function createTerminal(): TerminalBackend {
  if (needsWin32InputBridge()) {
    return createWindowsTerminal();
  }
  return createUnixTerminal();
}

function createUnixTerminal(): TerminalBackend {
  let wasRaw = false;

  return {
    enterRawMode() {
      if (process.stdin.isTTY) {
        wasRaw = process.stdin.isRaw;
        process.stdin.setRawMode(true);
        process.stdin.resume();
      }
    },

    exitRawMode() {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw);
        process.stdin.pause();
      }
    },

    write(data: string) {
      process.stdout.write(data);
    },

    onInput(handler: (data: Buffer) => void) {
      process.stdin.on('data', handler);
    },

    offInput(handler: (data: Buffer) => void) {
      process.stdin.off('data', handler);
    },

    onResize(handler: () => void) {
      process.stdout.on('resize', handler);
    },

    offResize(handler: () => void) {
      process.stdout.off('resize', handler);
    },

    getSize(): { cols: number; rows: number } {
      return {
        cols: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
      };
    },
  };
}

function createWindowsTerminal(): TerminalBackend {
  const bridge = createWin32InputBridge();
  let bridgeStarted = false;
  let wasRaw = false;

  return {
    enterRawMode() {
      if (process.stdin.isTTY) {
        wasRaw = process.stdin.isRaw;
        process.stdin.setRawMode(true);
        process.stdin.resume();
      }

      if (!bridgeStarted) {
        bridgeStarted = bridge.start();
        if (!bridgeStarted) {
          process.stderr.write('[nebula] Win32 mouse bridge failed to start\n');
        }
      }
    },

    exitRawMode() {
      bridge.stop();
      bridgeStarted = false;

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw);
        process.stdin.pause();
      }
    },

    write(data: string) {
      process.stdout.write(data);
    },

    onInput(handler: (data: Buffer) => void) {
      process.stdin.on('data', handler);
    },

    offInput(handler: (data: Buffer) => void) {
      process.stdin.off('data', handler);
    },

    onResize(handler: () => void) {
      process.stdout.on('resize', handler);
    },

    offResize(handler: () => void) {
      process.stdout.off('resize', handler);
    },

    getSize(): { cols: number; rows: number } {
      return {
        cols: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
      };
    },
  };
}
