/**
 * Open a URL in the user's default browser.
 *
 * SECURITY (PRD §13 / R-7):
 *   - URL passed as an argv element. Never `shell: true`.
 *   - URL passed as a single argv element with an explicit protocol allowlist.
 *   - Windows uses rundll32 directly rather than a command-shell built-in.
 *   - WSL prefers `wslview` over Windows interop.
 */

import type { ChildHandle, ProcessEnvProbe, SpawnFn } from './process-env.js';
import { getEnv } from './process-env.js';

export interface OpenUrlOpts {
  readonly timeoutMs?: number;
  readonly allowedProtocols?: readonly string[];
  readonly spawn?: SpawnFn;
  readonly env?: ProcessEnvProbe;
}

export interface OpenUrlResult {
  readonly ok: boolean;
  readonly tool?: 'open' | 'xdg-open' | 'rundll32' | 'wslview';
  readonly error?: string;
  readonly durationMs?: number;
}

interface OpenCommand {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly tool: NonNullable<OpenUrlResult['tool']>;
}

let cachedSpawn: SpawnFn | null = null;

async function defaultSpawn(): Promise<SpawnFn> {
  if (cachedSpawn) return cachedSpawn;
  const { spawn } = await import('node:child_process');
  cachedSpawn = (cmd, args, opts) =>
    spawn(cmd, [...args], {
      stdio: [...(opts?.stdio ?? ['ignore', 'ignore', 'ignore'])] as ('pipe' | 'ignore')[],
    }) as unknown as ChildHandle;
  return cachedSpawn;
}

function isWsl(env: NodeJS.ProcessEnv): boolean {
  return env['WSL_DISTRO_NAME'] !== undefined || env['WSLENV'] !== undefined;
}

function commandsFor(probe: ProcessEnvProbe, url: string): readonly OpenCommand[] {
  switch (probe.platform) {
    case 'darwin':
      return [{ cmd: 'open', args: [url], tool: 'open' }];
    case 'win32':
      return [{ cmd: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url], tool: 'rundll32' }];
    default: {
      if (isWsl(probe.env)) {
        return [
          { cmd: 'wslview', args: [url], tool: 'wslview' },
          { cmd: 'xdg-open', args: [url], tool: 'xdg-open' },
        ];
      }
      return [{ cmd: 'xdg-open', args: [url], tool: 'xdg-open' }];
    }
  }
}

function runOne(spawnFn: SpawnFn, command: OpenCommand, timeoutMs: number): Promise<OpenUrlResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let child: ChildHandle;
    try {
      child = spawnFn(command.cmd, command.args, { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (err) {
      resolve({ ok: false, tool: command.tool, error: `${command.cmd}: ${String(err)}`, durationMs: Date.now() - started });
      return;
    }

    let settled = false;
    const settle = (r: OpenUrlResult) => {
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
      settle({ ok: false, tool: command.tool, error: `${command.cmd}: timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.on('error', (err) => settle({ ok: false, tool: command.tool, error: `${command.cmd}: ${err.message}` }));
    child.on('close', (code) => settle({ ok: code === 0, tool: command.tool, error: code === 0 ? undefined : `${command.cmd} exited ${code}` }));
  });
}

export async function openUrl(url: string, opts: OpenUrlOpts = {}): Promise<OpenUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    return { ok: false, error: `invalid URL: ${err instanceof Error ? err.message : String(err)}` };
  }

  const allowedProtocols = new Set((opts.allowedProtocols ?? ['http:', 'https:', 'mailto:']).map((protocol) => `${protocol.replace(/:$/, '').toLowerCase()}:`));
  if (!allowedProtocols.has(parsed.protocol.toLowerCase())) {
    return { ok: false, error: `URL protocol is not allowed: ${parsed.protocol}` };
  }

  const env = opts.env ?? getEnv();
  const timeout = opts.timeoutMs ?? 5000;
  if (!Number.isFinite(timeout) || timeout <= 0) return { ok: false, error: 'timeoutMs must be a positive finite number' };
  const spawnFn = opts.spawn ?? (await defaultSpawn());
  const commands = commandsFor(env, url);
  let lastError: string | undefined;
  let lastTool: OpenUrlResult['tool'];
  let totalDuration = 0;
  for (const command of commands) {
    const result = await runOne(spawnFn, command, timeout);
    totalDuration += result.durationMs ?? 0;
    if (result.ok) return result;
    lastError = result.error;
    lastTool = result.tool;
  }
  return { ok: false, tool: lastTool, error: lastError ?? 'no open tool succeeded', durationMs: totalDuration };
}
