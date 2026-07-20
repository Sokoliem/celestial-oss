import type { ProcessEnvProbe, SpawnFn } from './native/process-env.js';
import { getEnv, isSshSession } from './native/process-env.js';

const MAX_CLIPBOARD_BYTES = 1024 * 1024;

/** Encode text for OSC 52 clipboard write */
export function osc52Write(text: string): string {
  const encoded = Buffer.from(text, 'utf-8').toString('base64');
  return `\x1b]52;c;${encoded}\x07`;
}

/** Encode OSC 52 clipboard read request */
export function osc52ReadRequest(): string {
  return '\x1b]52;c;?\x07';
}

/** Parse an OSC 52 clipboard response */
export function parseOsc52Response(data: string): string | null {
  const match = data.match(/\x1b\]52;c;([A-Za-z0-9+/]*=*)(?:\x07|\x1b\\)/);
  if (!match || match[1]!.length > Math.ceil((MAX_CLIPBOARD_BYTES * 4) / 3) + 4) return null;
  const encoded = match[1]!;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) return null;
  const decoded = Buffer.from(encoded, 'base64');
  return decoded.length <= MAX_CLIPBOARD_BYTES ? decoded.toString('utf-8') : null;
}

/** Bracketed paste mode control sequences */
export const bracketedPaste = {
  enable: '\x1b[?2004h',
  disable: '\x1b[?2004l',
} as const;

/** Detect if data contains bracketed paste start marker and extract pasted content */
export function parseBracketedPaste(data: string): string | null {
  const startMarker = '\x1b[200~';
  const endMarker = '\x1b[201~';

  const startIdx = data.indexOf(startMarker);
  if (startIdx === -1) {
    return null;
  }

  const contentStart = startIdx + startMarker.length;
  const endIdx = data.indexOf(endMarker, contentStart);
  if (endIdx === -1) {
    return null;
  }

  return data.slice(contentStart, endIdx);
}

// ────────────────────────────────────────────────────────────────────────────
//  G1 — high-level clipboard primitive (OSC 52 + native fallback).
//  See docs/specs/2026-05-12-nexus-cross-platform-parity-prd.md §8.1.
// ────────────────────────────────────────────────────────────────────────────

export type ClipboardSource = 'osc52' | 'native' | 'both' | 'none';

export interface ClipboardResult {
  readonly ok: boolean;
  readonly source: ClipboardSource;
  readonly error?: string;
  readonly nativeTool?: 'pbcopy' | 'clip' | 'wl-copy' | 'xclip' | 'xsel';
  readonly durationMs?: number;
}

export interface ClipboardWriteOpts {
  readonly nativeTimeoutMs?: number;
  readonly preferOsc52?: boolean;
  readonly nativeOnly?: boolean;
  readonly writeEscape?: (seq: string) => void;
  readonly spawn?: SpawnFn;
  readonly env?: ProcessEnvProbe;
  /** @internal — test-only path recorder. */
  readonly _recorder?: ClipboardPathRecorder;
}

export interface ClipboardReadOpts {
  readonly osc52TimeoutMs?: number;
  readonly nativeTimeoutMs?: number;
  /** Maximum native clipboard output accepted in memory. @default 1 MiB */
  readonly maxNativeBytes?: number;
  readonly preferOsc52?: boolean;
  readonly readEscape?: () => Promise<string | null>;
  readonly writeEscape?: (seq: string) => void;
  readonly spawn?: SpawnFn;
  readonly env?: ProcessEnvProbe;
  /** @internal — test-only path recorder. */
  readonly _recorder?: ClipboardPathRecorder;
}

export interface ClipboardPathRecorder {
  record(event: { path: 'osc52' | 'native'; tool?: string; ok: boolean; durationMs: number }): void;
}

function defaultWriteEscape(seq: string): void {
  if (typeof process !== 'undefined' && process.stdout && typeof process.stdout.write === 'function') {
    process.stdout.write(seq);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Write text to the system clipboard.
 *
 * SSH sessions: OSC 52 only (native shell-out would target the remote host).
 * Local sessions: OSC 52 + native shell-out in parallel; first success wins.
 */
export async function writeClipboard(text: string, opts: ClipboardWriteOpts = {}): Promise<ClipboardResult> {
  const env = opts.env ?? getEnv();
  const ssh = isSshSession({ platform: env.platform, env: env.env });
  const preferOsc52 = opts.preferOsc52 ?? ssh;
  const writeEscape = opts.writeEscape ?? defaultWriteEscape;
  const recorder = opts._recorder;

  // Fire OSC 52 unless the caller asked for native-only.
  let osc52Promise: Promise<{ ok: boolean; durationMs: number }> | null = null;
  if (!opts.nativeOnly) {
    const started = Date.now();
    try {
      writeEscape(osc52Write(text));
      const elapsed = Date.now() - started;
      recorder?.record({ path: 'osc52', ok: true, durationMs: elapsed });
      // OSC 52 is fire-and-forget; treat sequence emission as success.
      osc52Promise = Promise.resolve({ ok: true, durationMs: elapsed });
    } catch (err) {
      const elapsed = Date.now() - started;
      recorder?.record({ path: 'osc52', ok: false, durationMs: elapsed });
      osc52Promise = Promise.resolve({ ok: false, durationMs: elapsed });
      const message = err instanceof Error ? err.message : String(err);
      if (preferOsc52) {
        return { ok: false, source: 'none', error: `osc52 write failed: ${message}`, durationMs: elapsed };
      }
    }
  }

  // Skip native shell-out when SSH or caller-requested.
  if (preferOsc52 && !opts.nativeOnly) {
    const r = await osc52Promise!;
    return { ok: r.ok, source: r.ok ? 'osc52' : 'none', durationMs: r.durationMs };
  }

  // Native path: dynamically loaded so the root barrel stays browser-safe.
  const { nativeClipboardCopy } = await import('./native/clipboard-native.js');
  const nativeResult = await nativeClipboardCopy(text, opts);
  recorder?.record({
    path: 'native',
    tool: nativeResult.nativeTool,
    ok: nativeResult.ok,
    durationMs: nativeResult.durationMs ?? 0,
  });

  if (opts.nativeOnly || !osc52Promise) {
    return nativeResult;
  }

  const oscResult = await osc52Promise;
  if (oscResult.ok && nativeResult.ok) {
    return {
      ok: true,
      source: 'both',
      nativeTool: nativeResult.nativeTool,
      durationMs: nativeResult.durationMs,
    };
  }
  if (nativeResult.ok) return nativeResult;
  if (oscResult.ok) {
    return { ok: true, source: 'osc52', durationMs: oscResult.durationMs };
  }
  return nativeResult;
}

/**
 * Read text from the system clipboard.
 *
 * Issues an OSC 52 read request and awaits the response via `opts.readEscape`
 * (default: no reader — falls through immediately). On SSH, OSC 52 is the only
 * path; locally, falls through to native shell-out on timeout.
 */
export async function readClipboard(opts: ClipboardReadOpts = {}): Promise<{ text: string | null; source: ClipboardSource; error?: string }> {
  const env = opts.env ?? getEnv();
  const ssh = isSshSession({ platform: env.platform, env: env.env });
  const preferOsc52 = opts.preferOsc52 ?? ssh;
  const writeEscape = opts.writeEscape ?? defaultWriteEscape;
  const recorder = opts._recorder;
  const osc52Timeout = opts.osc52TimeoutMs ?? 250;

  if (opts.readEscape) {
    const started = Date.now();
    try {
      writeEscape(osc52ReadRequest());
      const response = await withTimeout(opts.readEscape(), osc52Timeout);
      const elapsed = Date.now() - started;
      if (typeof response === 'string') {
        const parsed = parseOsc52Response(response);
        const isProtocolResponse = response.includes('\x1b]52;');
        const text = parsed ?? (isProtocolResponse ? null : response);
        if (text !== null && Buffer.byteLength(text, 'utf8') <= MAX_CLIPBOARD_BYTES) {
          recorder?.record({ path: 'osc52', ok: true, durationMs: elapsed });
          return { text, source: 'osc52' };
        }
      }
      recorder?.record({ path: 'osc52', ok: false, durationMs: elapsed });
    } catch {
      // fall through to native
    }
  }

  if (preferOsc52) {
    return { text: null, source: 'none', error: 'osc52 read returned no response' };
  }

  const { nativeClipboardRead } = await import('./native/clipboard-native.js');
  const native = await nativeClipboardRead(opts);
  recorder?.record({ path: 'native', ok: native.source === 'native', durationMs: native.durationMs ?? 0 });
  return { text: native.text, source: native.source, error: native.error };
}
