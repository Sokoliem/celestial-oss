/**
 * Environment / platform probes for Node-only IO primitives under `./native`.
 *
 * Pure inspection — never spawns. Designed for dependency injection so
 * tests can supply a synthetic `ProcessEnvProbe` without monkey-patching
 * `process` or mocking `node:child_process`.
 *
 * Mirrors atlas's `DetectCapabilitiesOptions.env` pattern.
 */

import { existsSync } from 'node:fs';
import { delimiter as pathDelimiter, join as pathJoin } from 'node:path';

export interface ProcessEnvProbe {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
}

export interface ClipboardToolProbe {
  readonly pbcopy: boolean;
  readonly pbpaste: boolean;
  readonly clip: boolean;
  readonly powershell: boolean;
  readonly wlCopy: boolean;
  readonly wlPaste: boolean;
  readonly xclip: boolean;
  readonly xsel: boolean;
  readonly wslview: boolean;
}

export interface ChildHandle {
  stdin?: {
    end(data?: string | Buffer, enc?: BufferEncoding): void;
    on(ev: 'error', cb: (e: Error) => void): void;
  } | null;
  stdout?: {
    on(ev: 'data', cb: (chunk: Buffer) => void): void;
    on(ev: 'end', cb: () => void): void;
  } | null;
  on(ev: 'close', cb: (code: number | null) => void): void;
  on(ev: 'error', cb: (e: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface SpawnOpts {
  readonly stdio?: readonly ['pipe' | 'ignore', 'pipe' | 'ignore', 'pipe' | 'ignore'];
}

export type SpawnFn = (cmd: string, args: readonly string[], opts?: SpawnOpts) => ChildHandle;

/** Read the live `process` env/platform (or return a safe shim off-Node). */
export function getEnv(): ProcessEnvProbe {
  if (typeof process === 'undefined') {
    return { platform: 'linux' as NodeJS.Platform, env: {} };
  }
  return { platform: process.platform, env: process.env };
}

export function getPlatform(probe?: ProcessEnvProbe): NodeJS.Platform {
  return (probe ?? getEnv()).platform;
}

/** True when the session is connected via SSH per OpenSSH-set env vars. */
export function isSshSession(probe?: ProcessEnvProbe): boolean {
  const env = (probe ?? getEnv()).env;
  return Boolean(env['SSH_CONNECTION'] || env['SSH_CLIENT'] || env['SSH_TTY']);
}

let toolCache: ClipboardToolProbe | null = null;
let toolCacheKey: string | null = null;

/**
 * Probe PATH for clipboard tool availability. Cached per (platform, PATH).
 * Sync — only inspects directory entries, never spawns.
 */
export function detectClipboardTools(probe?: ProcessEnvProbe): ClipboardToolProbe {
  const p = probe ?? getEnv();
  const key = `${p.platform}|${p.env['PATH'] ?? ''}|${p.env['PATHEXT'] ?? ''}`;
  if (toolCache && toolCacheKey === key) return toolCache;

  const has = (name: string) => commandOnPath(name, p);
  const probeResult: ClipboardToolProbe = {
    pbcopy: has('pbcopy'),
    pbpaste: has('pbpaste'),
    clip: has('clip') || has('clip.exe'),
    powershell: has('powershell') || has('powershell.exe') || has('pwsh') || has('pwsh.exe'),
    wlCopy: has('wl-copy'),
    wlPaste: has('wl-paste'),
    xclip: has('xclip'),
    xsel: has('xsel'),
    wslview: has('wslview'),
  };
  toolCache = probeResult;
  toolCacheKey = key;
  return probeResult;
}

/** Test-only: reset cached clipboard tool probe. */
export function _resetClipboardToolCache(): void {
  toolCache = null;
  toolCacheKey = null;
}

function commandOnPath(name: string, probe: ProcessEnvProbe): boolean {
  const path = probe.env['PATH'];
  if (!path) return false;
  const dirs = path.split(pathDelimiter).filter(Boolean);
  const candidates = candidatesFor(name, probe);
  for (const dir of dirs) {
    for (const candidate of candidates) {
      try {
        if (existsSync(pathJoin(dir, candidate))) return true;
      } catch {
        // ignore — keep scanning
      }
    }
  }
  return false;
}

function candidatesFor(name: string, probe: ProcessEnvProbe): readonly string[] {
  if (probe.platform !== 'win32') return [name];
  const pathext = probe.env['PATHEXT'] ?? '.EXE;.CMD;.BAT;.COM';
  const exts = pathext
    .split(';')
    .map((e) => e.toLowerCase())
    .filter(Boolean);
  const lower = name.toLowerCase();
  if (exts.some((e) => lower.endsWith(e))) return [name];
  return [name, ...exts.map((e) => `${name}${e}`)];
}
