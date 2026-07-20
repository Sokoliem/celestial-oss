/**
 * Crash Recovery for Nebula TUI Applications
 *
 * Restores terminal state when the process crashes or is interrupted,
 * preventing the terminal from being left in a broken state (raw mode on,
 * cursor hidden, alternate screen active, mouse tracking enabled).
 *
 * Handles:
 * - Uncaught exceptions
 * - Unhandled promise rejections
 * - SIGINT (Ctrl+C)
 * - SIGTERM
 *
 * The crash handler is registered automatically when `app()` is called
 * and unregistered on normal shutdown.
 */

import * as fs from 'node:fs';
import type { TerminalBackend } from './terminal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrashRecoveryOptions {
  /** The terminal backend to restore on crash */
  terminal: TerminalBackend;

  /** Optional function that returns the current model snapshot for crash reports */
  getModel?: () => unknown;

  /** Optional file path to write crash logs to */
  crashLogPath?: string;

  /**
   * Optional function to write crash log files. Defaults to fs.writeFileSync.
   * Override this in tests or non-Node environments.
   */
  writeFile?: (path: string, content: string) => void;
}

export interface CrashRecoveryGuard {
  /** Remove all crash recovery handlers. Call this during normal shutdown. */
  uninstall(): void;
}

// ---------------------------------------------------------------------------
// Terminal restoration sequences
// ---------------------------------------------------------------------------

/** Sequences to fully restore terminal state regardless of what modes were active */
const RESTORE_SEQUENCES = [
  '\x1b[?25h', // Show cursor
  '\x1b[0m', // Reset all text attributes
  '\x1b[?1003l', // Disable all-motion mouse tracking
  '\x1b[?1002l', // Disable button-event mouse tracking
  '\x1b[?1000l', // Disable X10 mouse tracking
  '\x1b[?1006l', // Disable SGR mouse encoding
  '\x1b[?1049l', // Exit alternate screen buffer
].join('');

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Install crash recovery handlers that restore terminal state on
 * uncaught exceptions, unhandled rejections, and termination signals.
 *
 * Returns a guard object whose `uninstall()` method removes all handlers.
 * Call `uninstall()` during normal app shutdown to prevent the crash handler
 * from interfering with clean exit.
 */
export function installCrashRecovery(options: CrashRecoveryOptions): CrashRecoveryGuard {
  const { terminal, getModel, crashLogPath, writeFile } = options;
  let cleaned = false;

  function restoreTerminal(): void {
    if (cleaned) return;
    cleaned = true;

    // Write all restore sequences. Use try/catch because if stdout
    // is already destroyed we don't want to throw during crash handling.
    try {
      terminal.write(RESTORE_SEQUENCES);
    } catch {
      // Terminal write failed — nothing we can do
    }

    try {
      terminal.exitRawMode();
    } catch {
      // Raw mode exit failed — nothing we can do
    }
  }

  function buildCrashReport(error: unknown): string {
    const timestamp = new Date().toISOString();
    const errorStr = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);

    let report = `\n[nebula] Crash at ${timestamp}\n${errorStr}\n`;

    if (getModel) {
      try {
        const model = getModel();
        const modelStr = JSON.stringify(model, null, 2);
        report += `\nModel snapshot:\n${modelStr}\n`;
      } catch {
        report += '\nModel snapshot: <failed to serialize>\n';
      }
    }

    return report;
  }

  function writeCrashLog(report: string): void {
    if (!crashLogPath) return;
    try {
      if (writeFile) {
        writeFile(crashLogPath, report);
      } else {
        fs.writeFileSync(crashLogPath, report, 'utf-8');
      }
    } catch {
      // File write failed — crash report already went to stderr
    }
  }

  // --- Handler functions ---

  function onUncaughtException(error: unknown): void {
    restoreTerminal();

    const report = buildCrashReport(error);
    try {
      process.stderr.write(report);
    } catch {
      // stderr write failed
    }
    writeCrashLog(report);

    process.exit(1);
  }

  function onUnhandledRejection(reason: unknown, _promise: Promise<unknown>): void {
    restoreTerminal();

    const report = buildCrashReport(reason);
    try {
      process.stderr.write(report);
    } catch {
      // stderr write failed
    }
    writeCrashLog(report);

    process.exit(1);
  }

  function onSigint(): void {
    restoreTerminal();
    process.exit(130); // 128 + SIGINT(2)
  }

  function onSigterm(): void {
    restoreTerminal();
    process.exit(143); // 128 + SIGTERM(15)
  }

  // --- Register handlers ---

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  // --- Guard ---

  return {
    uninstall() {
      process.removeListener('uncaughtException', onUncaughtException);
      process.removeListener('unhandledRejection', onUnhandledRejection);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
    },
  };
}
