/**
 * Render Watchdog
 *
 * Detects infinite loops or extremely long renders using a worker thread
 * that monitors a SharedArrayBuffer heartbeat. When the main thread's
 * render exceeds the timeout, the watchdog restores the terminal and
 * terminates the process — because a blocked event loop is unrecoverable.
 */

import { Worker } from 'node:worker_threads';

export interface RenderWatchdog {
  /** Call immediately before entering the render/dispatch pipeline. */
  beginRender(): void;
  /** Call immediately after the render/dispatch pipeline completes. */
  endRender(): void;
  /** Shut down the watchdog worker. */
  dispose(): void;
}

// Terminal restoration sequences (same as crash-recovery.ts)
const RESTORE_SEQUENCES = [
  '\\x1b[?25h', // Show cursor
  '\\x1b[0m', // Reset attributes
  '\\x1b[?1003l', // Disable all-motion mouse tracking
  '\\x1b[?1002l', // Disable button-event mouse tracking
  '\\x1b[?1000l', // Disable X10 mouse tracking
  '\\x1b[?1006l', // Disable SGR mouse encoding
  '\\x1b[?1049l', // Exit alternate screen buffer
].join('');

// Worker script — runs in a separate thread with its own event loop.
// Uses SharedArrayBuffer to read the main thread's render state without messaging.
const WATCHDOG_WORKER_CODE = `
'use strict';
const { workerData, parentPort } = require('node:worker_threads');
const { sharedBuffer, timeoutMs, restoreSequences } = workerData;
const state = new Int32Array(sharedBuffer);

// state[0]: 0 = idle, 1 = rendering
// state[1]: low 32 bits of Date.now() when render started (wraps every ~49 days)

const check = setInterval(() => {
  if (Atomics.load(state, 0) === 1) {
    const startLow = Atomics.load(state, 1);
    const nowLow = Date.now() & 0x7FFFFFFF;
    // Handle wraparound: if nowLow < startLow, we wrapped — add 2^31
    const elapsed = nowLow >= startLow ? nowLow - startLow : (0x7FFFFFFF - startLow) + nowLow;
    if (elapsed > timeoutMs) {
      // Restore terminal before killing — main thread event loop is blocked so
      // its crash-recovery handlers won't fire.
      try {
        process.stdout.write(restoreSequences);
      } catch {}
      process.stderr.write(
        '\\n[nebula] FATAL: render exceeded ' + timeoutMs + 'ms timeout (possible infinite loop in hot-reloaded code).\\n' +
        'The event loop was blocked and could not recover. Terminating process.\\n'
      );
      // On Windows, process.kill(pid, 'SIGTERM') calls TerminateProcess.
      // On POSIX, it sends SIGTERM which the event loop can't process (blocked).
      // Either way, the process exits after we've restored the terminal.
      process.kill(process.pid, 'SIGTERM');
    }
  }
}, 250);

// Clean shutdown via message
parentPort?.on('message', (msg) => {
  if (msg === 'dispose') {
    clearInterval(check);
    process.exit(0);
  }
});
`;

/**
 * Create a render watchdog that terminates the process if a render
 * exceeds the given timeout. Uses a worker thread so it can detect
 * a blocked event loop.
 *
 * @param timeoutMs Maximum allowed render duration in milliseconds.
 *                  Recommended: 5000-10000 for development.
 */
export function createRenderWatchdog(timeoutMs: number): RenderWatchdog {
  // SharedArrayBuffer layout: [state (idle/rendering), startTimeLow]
  const sharedBuffer = new SharedArrayBuffer(8);
  const state = new Int32Array(sharedBuffer);

  let worker: Worker | null = null;
  try {
    worker = new Worker(WATCHDOG_WORKER_CODE, {
      eval: true,
      workerData: { sharedBuffer, timeoutMs, restoreSequences: RESTORE_SEQUENCES },
    });
    // Don't let the watchdog prevent process exit
    worker.unref();
    // Suppress unhandled error events from the worker
    worker.on('error', () => {});
  } catch {
    // Worker creation failed (e.g., SharedArrayBuffer not available).
    // Return a no-op watchdog — the app runs without timeout protection.
  }

  return {
    beginRender() {
      Atomics.store(state, 1, Date.now() & 0x7fffffff);
      Atomics.store(state, 0, 1);
    },
    endRender() {
      Atomics.store(state, 0, 0);
    },
    dispose() {
      if (worker) {
        worker.postMessage('dispose');
        worker = null;
      }
    },
  };
}
