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
  spawn(
    file: string,
    args: string[],
    options: { cwd?: string; env: Record<string, string>; cols: number; rows: number },
  ): NativePtyProcess;
}

function quoteShellArg(value: string): string {
  if (value.length === 0) return process.platform === 'win32' ? '""' : "''";
  if (process.platform === 'win32') return `"${value.replaceAll('"', '\\"')}"`;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function spawnSpec(config: PtyHarnessConfig): { file: string; args: string[] } {
  if (!config.shell) return { file: config.command, args: [...(config.args ?? [])] };
  const shell =
    typeof config.shell === 'string'
      ? config.shell
      : process.platform === 'win32'
        ? process.env['ComSpec'] ?? 'cmd.exe'
        : process.env['SHELL'] ?? '/bin/sh';
  const command = [config.command, ...(config.args ?? [])].map(quoteShellArg).join(' ');
  return process.platform === 'win32'
    ? { file: shell, args: ['/d', '/s', '/c', command] }
    : { file: shell, args: ['-lc', command] };
}

function normalizedOutput(value: string, options?: PtyOutputOptions): string {
  const normalized = options?.normalizeNewlines === false ? value : value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return options?.stripAnsi === false ? normalized : stripAnsi(normalized);
}

function matches(value: string, matcher: string | RegExp): boolean {
  if (typeof matcher === 'string') return value.includes(matcher);
  matcher.lastIndex = 0;
  return matcher.test(value);
}

function timeoutError(operation: string, timeoutMs: number, transcript: string): Error {
  const tail = transcript.slice(-2_000);
  return new Error(`${operation} timed out after ${timeoutMs}ms.\nPTY transcript tail:\n${tail}`);
}

async function loadNodePty(): Promise<NodePtyModule> {
  try {
    return (await import('node-pty')) as unknown as NodePtyModule;
  } catch (error) {
    throw new Error(
      'The Celestial PTY harness requires the optional peer dependency "node-pty". Install it with "pnpm add -D node-pty".',
      { cause: error },
    );
  }
}

export async function createPtyHarness(config: PtyHarnessConfig): Promise<PtyHarness> {
  if (!config.command) throw new Error('createPtyHarness requires a non-empty command.');
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
    cols: config.cols ?? DEFAULT_COLUMNS,
    rows: config.rows ?? DEFAULT_ROWS,
  });

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBufferBytes = config.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  let transcript = '';
  let exit: PtyExit | undefined;
  let disposed = false;
  const outputListeners = new Set<() => void>();
  const exitListeners = new Set<(event: PtyExit) => void>();

  const dataSubscription = processHandle.onData((chunk) => {
    transcript += chunk;
    if (Buffer.byteLength(transcript, 'utf8') > maxBufferBytes) transcript = transcript.slice(-maxBufferBytes);
    for (const listener of outputListeners) listener();
  });
  const exitSubscription = processHandle.onExit((event) => {
    exit = event;
    for (const listener of exitListeners) listener(event);
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
      if (cols <= 0 || rows <= 0) throw new Error('PTY dimensions must be positive.');
      processHandle.resize(cols, rows);
    },
    output(options) {
      return normalizedOutput(transcript, options);
    },
    waitForText(match, options) {
      assertActive();
      const effectiveTimeout = options?.timeoutMs ?? timeoutMs;
      const current = normalizedOutput(transcript);
      if (matches(current, match)) return Promise.resolve(current);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          outputListeners.delete(check);
          reject(timeoutError(`waitForText(${String(match)})`, effectiveTimeout, normalizedOutput(transcript)));
        }, effectiveTimeout);
        const check = () => {
          const next = normalizedOutput(transcript);
          if (!matches(next, match)) return;
          clearTimeout(timer);
          outputListeners.delete(check);
          resolve(next);
        };
        outputListeners.add(check);
      });
    },
    waitForExit(options) {
      assertActive();
      if (exit) return Promise.resolve(exit);
      const effectiveTimeout = options?.timeoutMs ?? timeoutMs;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          exitListeners.delete(onExit);
          reject(timeoutError('waitForExit', effectiveTimeout, normalizedOutput(transcript)));
        }, effectiveTimeout);
        const onExit = (event: PtyExit) => {
          clearTimeout(timer);
          exitListeners.delete(onExit);
          resolve(event);
        };
        exitListeners.add(onExit);
      });
    },
    kill(signal) {
      if (disposed || exit) return;
      processHandle.kill(signal);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
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
