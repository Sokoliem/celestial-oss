/**
 * Test fixtures for nexus native-subpath dependency injection.
 *
 * Mirrors atlas's `DetectCapabilitiesOptions.env` injection pattern so
 * tests can drive `writeClipboard` / `readClipboard` / `openUrl` across
 * platforms without mocking `node:child_process` globally.
 */

import { EventEmitter } from 'node:events';
import type { ChildHandle, ClipboardToolProbe, ProcessEnvProbe, SpawnFn, SpawnOpts } from '../../native/process-env.js';

/** Build a `ProcessEnvProbe` for the given platform with optional env overrides. */
export function makeProbe(platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}): ProcessEnvProbe {
  return { platform, env };
}

/** Convenience: SSH-flagged Linux probe. */
export function makeSshProbe(extra: NodeJS.ProcessEnv = {}): ProcessEnvProbe {
  return makeProbe('linux', { SSH_CONNECTION: '10.0.0.1 22 10.0.0.2 1234', PATH: '/usr/bin', ...extra });
}

export interface SpawnInvocation {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly opts: SpawnOpts | undefined;
  readonly stdin: string[];
  /** Raw stdin chunks preserving Buffer payloads (BOM, UTF-16LE, etc.). */
  readonly stdinRaw: Buffer[];
}

export interface SpawnPlan {
  /** Exit code to deliver via `close`. Default 0. */
  readonly code?: number | null;
  /** Synchronous error to throw at spawn time (ENOENT-style). */
  readonly spawnError?: Error;
  /** Emit `error` after spawn (delayed). */
  readonly emitError?: Error;
  /** Stdout chunks to emit before close. */
  readonly stdout?: readonly string[];
  /** Delay (ms) before close fires. Default 0. */
  readonly closeDelayMs?: number;
}

/**
 * Build a `SpawnFn` mock that returns a programmable child for each cmd.
 *
 * Default behaviour: every command exits cleanly with code 0. Override per
 * command via `plans`.
 */
export function makeSpawn(plans: Record<string, SpawnPlan> = {}): SpawnFn & { invocations: SpawnInvocation[] } {
  const invocations: SpawnInvocation[] = [];
  const fn: SpawnFn = (cmd, args, opts) => {
    const plan = plans[cmd] ?? {};
    if (plan.spawnError) throw plan.spawnError;
    const stdinBuf: string[] = [];
    const stdinRaw: Buffer[] = [];
    invocations.push({ cmd, args, opts, stdin: stdinBuf, stdinRaw });

    const stdinEmitter = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const childEmitter = new EventEmitter();

    const child: ChildHandle = {
      stdin: {
        end(data?: string | Buffer) {
          if (typeof data === 'string') {
            stdinBuf.push(data);
            stdinRaw.push(Buffer.from(data, 'utf-8'));
          } else if (data) {
            stdinRaw.push(Buffer.from(data));
            stdinBuf.push(data.toString('utf-8'));
          }
        },
        on(ev, cb) {
          stdinEmitter.on(ev, cb);
        },
      },
      stdout: plan.stdout
        ? {
            on(ev, cb) {
              stdoutEmitter.on(ev, cb as (...a: unknown[]) => void);
            },
          }
        : null,
      on(ev, cb) {
        childEmitter.on(ev, cb as (...a: unknown[]) => void);
      },
      kill() {
        return true;
      },
    };

    queueMicrotask(() => {
      if (plan.emitError) {
        childEmitter.emit('error', plan.emitError);
        return;
      }
      if (plan.stdout) {
        for (const chunk of plan.stdout) stdoutEmitter.emit('data', Buffer.from(chunk, 'utf-8'));
        stdoutEmitter.emit('end');
      }
      const fire = () => childEmitter.emit('close', plan.code ?? 0);
      if (plan.closeDelayMs && plan.closeDelayMs > 0) setTimeout(fire, plan.closeDelayMs);
      else queueMicrotask(fire);
    });

    return child;
  };
  return Object.assign(fn, { invocations });
}

/** Build a fully-populated `ClipboardToolProbe` (defaults all-true). */
export function makeToolProbe(overrides: Partial<ClipboardToolProbe> = {}): ClipboardToolProbe {
  return {
    pbcopy: true,
    pbpaste: true,
    clip: true,
    powershell: true,
    wlCopy: true,
    wlPaste: true,
    xclip: true,
    xsel: true,
    wslview: true,
    ...overrides,
  };
}
