/**
 * Native clipboard shell-out for `@celestial/nexus/native`.
 *
 * Ported from `apps/claude-wrapper/src/native-clipboard.ts` (the PRD-cited
 * baseline implementation) with:
 *   - a SpawnFn dependency-injection seam so tests do not need to mock
 *     `node:child_process` globally;
 *   - read support via pbpaste / wl-paste / xclip -o / xsel -o /
 *     `powershell Get-Clipboard` on win32;
 *   - tool-probe caching keyed off PATH;
 *   - structured ClipboardResult / nativeTool reporting for telemetry.
 *
 * Browser / rift consumers should not import this module — it is only
 * reachable through the `./native` subpath export.
 */

import type { ClipboardReadOpts, ClipboardResult, ClipboardWriteOpts } from '../clipboard.js';
import { type ChildHandle, detectClipboardTools, getEnv, type ProcessEnvProbe, type SpawnFn } from './process-env.js';

export type {
  ChildHandle,
  ClipboardToolProbe,
  ProcessEnvProbe,
  SpawnFn,
} from './process-env.js';

interface ClipboardCommand {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly tool: NonNullable<ClipboardResult['nativeTool']>;
}

interface ReadCommand {
  readonly cmd: string;
  readonly args: readonly string[];
}

let cachedSpawn: SpawnFn | null = null;

async function defaultSpawn(): Promise<SpawnFn> {
  if (cachedSpawn) return cachedSpawn;
  const { spawn } = await import('node:child_process');
  cachedSpawn = (cmd, args, opts) =>
    spawn(cmd, [...args], {
      stdio: [...(opts?.stdio ?? ['pipe', 'ignore', 'ignore'])] as ('pipe' | 'ignore')[],
    }) as unknown as ChildHandle;
  return cachedSpawn;
}

function probe(opts: { env?: ProcessEnvProbe } | undefined): ProcessEnvProbe {
  return opts?.env ?? getEnv();
}

function writeCommands(env: ProcessEnvProbe): readonly ClipboardCommand[] {
  switch (env.platform) {
    case 'darwin':
      return [{ cmd: 'pbcopy', args: [], tool: 'pbcopy' }];
    case 'win32':
      return [{ cmd: 'clip', args: [], tool: 'clip' }];
    default: {
      const tools = detectClipboardTools(env);
      const wlcopy: ClipboardCommand = { cmd: 'wl-copy', args: [], tool: 'wl-copy' };
      const xclip: ClipboardCommand = { cmd: 'xclip', args: ['-selection', 'clipboard'], tool: 'xclip' };
      const xsel: ClipboardCommand = { cmd: 'xsel', args: ['--clipboard', '--input'], tool: 'xsel' };
      const all = env.env['WAYLAND_DISPLAY'] ? [wlcopy, xclip, xsel] : [xclip, xsel, wlcopy];
      return all.filter((c) => isTooled(c.tool, tools));
    }
  }
}

function readCommands(env: ProcessEnvProbe): readonly ReadCommand[] {
  switch (env.platform) {
    case 'darwin':
      return [{ cmd: 'pbpaste', args: [] }];
    case 'win32':
      return [{ cmd: 'powershell', args: ['-NoProfile', '-Command', 'Get-Clipboard'] }];
    default: {
      const tools = detectClipboardTools(env);
      const wlpaste: ReadCommand = { cmd: 'wl-paste', args: [] };
      const xclipR: ReadCommand = { cmd: 'xclip', args: ['-selection', 'clipboard', '-o'] };
      const xselR: ReadCommand = { cmd: 'xsel', args: ['--clipboard', '--output'] };
      const ordered = env.env['WAYLAND_DISPLAY'] ? [wlpaste, xclipR, xselR] : [xclipR, xselR, wlpaste];
      return ordered.filter((c) => isReadTooled(c.cmd, tools));
    }
  }
}

function isTooled(tool: ClipboardCommand['tool'], tools: ReturnType<typeof detectClipboardTools>): boolean {
  switch (tool) {
    case 'pbcopy':
      return tools.pbcopy;
    case 'clip':
      return tools.clip;
    case 'wl-copy':
      return tools.wlCopy;
    case 'xclip':
      return tools.xclip;
    case 'xsel':
      return tools.xsel;
  }
}

function isReadTooled(cmd: string, tools: ReturnType<typeof detectClipboardTools>): boolean {
  switch (cmd) {
    case 'pbpaste':
      return tools.pbpaste;
    case 'wl-paste':
      return tools.wlPaste;
    case 'xclip':
      return tools.xclip;
    case 'xsel':
      return tools.xsel;
    case 'powershell':
      return tools.powershell;
    default:
      return true;
  }
}

function encodeForPlatform(text: string, env: ProcessEnvProbe, tool: ClipboardResult['nativeTool']): string | Buffer {
  // Windows clip.exe accepts UTF-16LE BOM-prefixed input for emoji / CJK robustness (Q-WinEncoding).
  if (env.platform === 'win32' && tool === 'clip') {
    const bom = Buffer.from([0xff, 0xfe]);
    const body = Buffer.from(text, 'utf16le');
    return Buffer.concat([bom, body]);
  }
  return text;
}

async function runOne(
  spawnFn: SpawnFn,
  command: ClipboardCommand,
  payload: string | Buffer,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string; durationMs: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    let child: ChildHandle;
    try {
      child = spawnFn(command.cmd, command.args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch (err) {
      resolve({ ok: false, error: `${command.cmd}: ${String(err)}`, durationMs: Date.now() - started });
      return;
    }

    let settled = false;
    const settle = (r: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...r, durationMs: Date.now() - started });
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      settle({ ok: false, error: `${command.cmd}: timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.on('error', (err) => settle({ ok: false, error: `${command.cmd}: ${err.message}` }));
    child.on('close', (code) => settle({ ok: code === 0, error: code === 0 ? undefined : `${command.cmd} exited ${code}` }));

    if (!child.stdin) {
      settle({ ok: false, error: `${command.cmd}: no stdin` });
      return;
    }
    child.stdin.on('error', (err) => settle({ ok: false, error: `${command.cmd}: ${err.message}` }));
    try {
      if (typeof payload === 'string') {
        child.stdin.end(payload, 'utf-8');
      } else {
        child.stdin.end(payload);
      }
    } catch (err) {
      settle({ ok: false, error: `${command.cmd}: ${String(err)}` });
    }
  });
}

async function readOne(spawnFn: SpawnFn, command: ReadCommand, timeoutMs: number): Promise<{ ok: boolean; text?: string; error?: string; durationMs: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    let child: ChildHandle;
    try {
      child = spawnFn(command.cmd, command.args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      resolve({ ok: false, error: `${command.cmd}: ${String(err)}`, durationMs: Date.now() - started });
      return;
    }

    let settled = false;
    const chunks: Buffer[] = [];
    const settle = (r: { ok: boolean; text?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...r, durationMs: Date.now() - started });
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      settle({ ok: false, error: `${command.cmd}: timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.stdout.on('end', () => {
        // wait for close
      });
    }
    child.on('error', (err) => settle({ ok: false, error: `${command.cmd}: ${err.message}` }));
    child.on('close', (code) => {
      if (code === 0) {
        const text = Buffer.concat(chunks).toString('utf-8');
        settle({ ok: true, text });
      } else {
        settle({ ok: false, error: `${command.cmd} exited ${code}` });
      }
    });
  });
}

export async function nativeClipboardCopy(text: string, opts?: ClipboardWriteOpts): Promise<ClipboardResult> {
  const env = probe(opts);
  const timeout = opts?.nativeTimeoutMs ?? 2000;
  const spawnFn = opts?.spawn ?? (await defaultSpawn());
  const commands = writeCommands(env);
  if (commands.length === 0) {
    return { ok: false, source: 'none', error: 'no native clipboard tool available' };
  }
  let lastError: string | undefined;
  let totalDuration = 0;
  for (const command of commands) {
    const payload = encodeForPlatform(text, env, command.tool);
    const result = await runOne(spawnFn, command, payload, timeout);
    totalDuration += result.durationMs;
    if (result.ok) {
      return { ok: true, source: 'native', nativeTool: command.tool, durationMs: result.durationMs };
    }
    lastError = result.error;
  }
  return { ok: false, source: 'none', error: lastError ?? 'no native clipboard tool succeeded', durationMs: totalDuration };
}

export async function nativeClipboardRead(
  opts?: ClipboardReadOpts,
): Promise<{ text: string | null; source: 'native' | 'none'; error?: string; durationMs?: number }> {
  const env = probe(opts);
  const timeout = opts?.nativeTimeoutMs ?? 2000;
  const spawnFn = opts?.spawn ?? (await defaultSpawn());
  const commands = readCommands(env);
  if (commands.length === 0) {
    return { text: null, source: 'none', error: 'no native clipboard reader available' };
  }
  let lastError: string | undefined;
  let totalDuration = 0;
  for (const command of commands) {
    const result = await readOne(spawnFn, command, timeout);
    totalDuration += result.durationMs;
    if (result.ok) {
      return { text: result.text ?? '', source: 'native', durationMs: result.durationMs };
    }
    lastError = result.error;
  }
  return { text: null, source: 'none', error: lastError, durationMs: totalDuration };
}
