import { stripAnsi } from '@celestial/core/corona';

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BUFFER_BYTES = 1_048_576;

export interface PtyHarnessConfig {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  cols?: number;
  rows?: number;
  shell?: boolean | string;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface PtyOutputOptions {
  stripAnsi?: boolean;
  normalizeNewlines?: boolean;
}

export interface PtyWaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Only match output produced after this mark (from {@link PtyHarness.mark}).
   *
   * `waitForText` scans the whole accumulated transcript, so waiting on a string
   * the program has already printed resolves immediately and synchronises
   * nothing. Marking first turns the wait into "a *new* occurrence", which is
   * what a test driving a repeated action needs.
   */
  since?: PtyMark;
}

/** An opaque position in the PTY transcript. Obtain one from {@link PtyHarness.mark}. */
export interface PtyMark {
  readonly offset: number;
}

export interface PtyExit {
  exitCode: number;
  signal?: number;
}

export interface PtyHarness {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  output(options?: PtyOutputOptions): string;
  /** Record the current end of the transcript, for `waitForText(..., { since })`. */
  mark(): PtyMark;
  waitForText(match: string | RegExp, options?: PtyWaitOptions): Promise<string>;
  waitForExit(options?: PtyWaitOptions): Promise<PtyExit>;
  kill(signal?: string): void;
  dispose(): void;
}

interface NativePtyProcess {
  readonly pid: number;
  /** node-pty 1.x keeps this worker private, but it is the only handle that
   * must be released after an already-exited Windows ConPTY child. */
  readonly _agent?: { readonly _conoutSocketWorker?: { dispose(): void } };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: PtyExit) => void): { dispose(): void };
}

interface NodePtyModule {
  spawn(file: string, args: string[], options: { cwd?: string; env: Record<string, string>; cols: number; rows: number }): NativePtyProcess;
}

function quoteShellArg(value: string): string {
  if (value.length === 0) return process.platform === 'win32' ? '""' : "''";
  if (process.platform === 'win32') {
    // Match the Windows C runtime quoting rules used by most executables
    // launched through cmd.exe. Backslashes immediately before a quote (and
    // trailing backslashes) must be doubled so the child receives them intact.
    return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function spawnSpec(config: PtyHarnessConfig): { file: string; args: string[] } {
  if (!config.shell) return { file: config.command, args: [...(config.args ?? [])] };
  const shell =
    typeof config.shell === 'string'
      ? config.shell
      : process.platform === 'win32'
        ? (process.env['ComSpec'] ?? 'cmd.exe')
        : (process.env['SHELL'] ?? '/bin/sh');
  const command = [config.command, ...(config.args ?? [])].map(quoteShellArg).join(' ');
  return process.platform === 'win32' ? { file: shell, args: ['/d', '/s', '/c', command] } : { file: shell, args: ['-lc', command] };
}

function normalizedOutput(value: string, options?: PtyOutputOptions): string {
  const normalized = options?.normalizeNewlines === false ? value : value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return options?.stripAnsi === false ? normalized : stripAnsi(normalized);
}

function matches(value: string, matcher: string | RegExp): boolean {
  if (typeof matcher === 'string') return value.includes(matcher);
  matcher.lastIndex = 0;
  const result = matcher.test(value);
  matcher.lastIndex = 0;
  return result;
}

function timeoutError(operation: string, timeoutMs: number, transcript: string): Error {
  const tail = utf8Tail(transcript, 2_000);
  return new Error(`${operation} timed out after ${timeoutMs}ms.\nPTY transcript tail:\n${tail}`);
}

function exitError(operation: string, event: PtyExit, transcript: string): Error {
  const signal = event.signal === undefined ? '' : ` (signal ${event.signal})`;
  const tail = utf8Tail(transcript, 2_000);
  return new Error(`${operation} could not complete because the PTY exited with code ${event.exitCode}${signal}.\nPTY transcript tail:\n${tail}`);
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('PTY wait aborted.', { cause: signal.reason });
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
  const normalized = Math.floor(value);
  if (normalized < 1) throw new RangeError(`${label} must be at least 1.`);
  return normalized;
}

function utf8Tail(value: string, maxBytes: number): string {
  const encoded = Buffer.from(value, 'utf8');
  if (encoded.byteLength <= maxBytes) return value;

  let start = encoded.byteLength - maxBytes;
  while (start < encoded.byteLength && (encoded[start]! & 0xc0) === 0x80) start++;
  return encoded.subarray(start).toString('utf8');
}

async function loadNodePty(): Promise<NodePtyModule> {
  try {
    return (await import('node-pty')) as unknown as NodePtyModule;
  } catch (error) {
    throw new Error('The Celestial PTY harness requires the optional peer dependency "node-pty". Install it with "pnpm add -D node-pty".', { cause: error });
  }
}

export async function createPtyHarness(config: PtyHarnessConfig): Promise<PtyHarness> {
  if (typeof config.command !== 'string' || config.command.trim().length === 0) {
    throw new Error('createPtyHarness requires a non-empty command.');
  }
  if (typeof config.shell === 'string' && config.shell.trim().length === 0) {
    throw new Error('PTY shell must be a non-empty path when specified as a string.');
  }
  const cols = positiveInteger(config.cols ?? DEFAULT_COLUMNS, 'PTY columns');
  const rows = positiveInteger(config.rows ?? DEFAULT_ROWS, 'PTY rows');
  const timeoutMs = positiveInteger(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'PTY timeout');
  const maxBufferBytes = positiveInteger(config.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES, 'PTY maxBufferBytes');
  const nodePty = await loadNodePty();
  const spec = spawnSpec(config);
  const environment = Object.fromEntries(
    Object.entries({
      ...process.env,
      // A Celestial app nested inside ConPTY already receives VT input. Starting
      // Nebula's native-console bridge there creates a second console process
      // that can outlive the scenario on Windows. Callers may override this.
      CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE: '1',
      ...(config.env ?? {}),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const processHandle = nodePty.spawn(spec.file, spec.args, {
    cwd: config.cwd,
    env: environment,
    cols,
    rows,
  });

  let transcript = '';
  let exit: PtyExit | undefined;
  let disposed = false;
  const outputListeners = new Set<() => void>();
  const exitListeners = new Set<(event: PtyExit) => void>();
  const pendingWaitRejectors = new Set<(reason: Error) => void>();

  const dataSubscription = processHandle.onData((chunk) => {
    transcript = utf8Tail(transcript + chunk, maxBufferBytes);
    for (const listener of [...outputListeners]) listener();
  });
  const exitSubscription = processHandle.onExit((event) => {
    exit = event;
    for (const listener of [...outputListeners]) listener();
    for (const listener of [...exitListeners]) listener(event);
    exitListeners.clear();
  });

  function assertActive(): void {
    if (disposed) throw new Error('PTY harness has been disposed.');
  }

  const harness: PtyHarness = {
    get pid() {
      return processHandle.pid;
    },
    write(data) {
      assertActive();
      processHandle.write(data);
    },
    resize(cols, rows) {
      assertActive();
      const nextCols = positiveInteger(cols, 'PTY columns');
      const nextRows = positiveInteger(rows, 'PTY rows');
      processHandle.resize(nextCols, nextRows);
    },
    output(options) {
      return normalizedOutput(transcript, options);
    },
    mark() {
      assertActive();
      return { offset: normalizedOutput(transcript).length };
    },
    waitForText(match, options) {
      assertActive();
      const effectiveTimeout = positiveInteger(options?.timeoutMs ?? timeoutMs, 'PTY wait timeout');
      const signal = options?.signal;
      if (signal?.aborted) return Promise.reject(abortError(signal));
      // The transcript is a rolling tail, so a mark can fall off the front. Clamping
      // means an evicted mark degrades to "search everything" rather than throwing.
      const searchable = (value: string): string => (options?.since ? value.slice(Math.min(options.since.offset, value.length)) : value);
      const current = normalizedOutput(transcript);
      if (matches(searchable(current), match)) return Promise.resolve(current);
      if (exit) return Promise.reject(exitError(`waitForText(${String(match)})`, exit, current));
      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = (): void => {
          clearTimeout(timer);
          outputListeners.delete(check);
          exitListeners.delete(onExit);
          pendingWaitRejectors.delete(cancel);
          signal?.removeEventListener('abort', onAbort);
        };
        const succeed = (value: string): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };
        const cancel = (reason: Error): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(reason);
        };
        const check = (): boolean => {
          const next = normalizedOutput(transcript);
          if (!matches(searchable(next), match)) return false;
          succeed(next);
          return true;
        };
        const onExit = (event: PtyExit): void => {
          if (!check()) cancel(exitError(`waitForText(${String(match)})`, event, normalizedOutput(transcript)));
        };
        const onAbort = (): void => cancel(signal ? abortError(signal) : new Error('PTY wait aborted.'));
        const timer = setTimeout(() => {
          // A PTY data callback and its timeout can become ready in the same
          // event-loop turn on a saturated runner. Re-check the accumulated
          // transcript at the deadline before rejecting so a receipt that is
          // already present cannot be reported as missing.
          if (!check()) cancel(timeoutError(`waitForText(${String(match)})`, effectiveTimeout, normalizedOutput(transcript)));
        }, effectiveTimeout);
        outputListeners.add(check);
        exitListeners.add(onExit);
        pendingWaitRejectors.add(cancel);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
    },
    waitForExit(options) {
      assertActive();
      if (exit) return Promise.resolve(exit);
      const effectiveTimeout = positiveInteger(options?.timeoutMs ?? timeoutMs, 'PTY wait timeout');
      const signal = options?.signal;
      if (signal?.aborted) return Promise.reject(abortError(signal));
      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = (): void => {
          clearTimeout(timer);
          exitListeners.delete(onExit);
          pendingWaitRejectors.delete(cancel);
          signal?.removeEventListener('abort', onAbort);
        };
        const cancel = (reason: Error): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(reason);
        };
        const onAbort = (): void => cancel(signal ? abortError(signal) : new Error('PTY wait aborted.'));
        const timer = setTimeout(() => {
          cancel(timeoutError('waitForExit', effectiveTimeout, normalizedOutput(transcript)));
        }, effectiveTimeout);
        const onExit = (event: PtyExit) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(event);
        };
        exitListeners.add(onExit);
        pendingWaitRejectors.add(cancel);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
    },
    kill(signal) {
      if (disposed || exit) return;
      processHandle.kill(signal);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const disposalError = new Error('PTY harness was disposed before the wait completed.');
      for (const rejectWait of [...pendingWaitRejectors]) rejectWait(disposalError);
      pendingWaitRejectors.clear();
      // node-pty 1.x can retain its ConPTY output worker after the child has
      // already emitted exit. Killing an exited PTY starts a console-list
      // helper that races the vanished process, so close the retained worker
      // directly when available and fall back to the public API.
      const exitedWindowsWorker = process.platform === 'win32' && exit ? processHandle._agent?._conoutSocketWorker : undefined;
      if (exitedWindowsWorker) {
        try {
          exitedWindowsWorker.dispose();
        } catch {
          // Cleanup is best-effort and must remain idempotent.
        }
      } else if (!exit || process.platform === 'win32') {
        try {
          processHandle.kill();
        } catch {
          // Cleanup is best-effort and must remain idempotent.
        }
      }
      dataSubscription.dispose();
      exitSubscription.dispose();
      outputListeners.clear();
      exitListeners.clear();
    },
  };

  return harness;
}
