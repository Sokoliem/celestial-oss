/**
 * Nebula Clipboard Integration
 *
 * Provides clipboard operations as Commands using OSC 52 protocol
 * for terminal clipboard access, with bracketed paste mode support.
 */

import { Cmd, type Result } from './types.js';

// ─── OSC 52 Protocol ────────────────────────────────────────────────────────

/** Encode text as a base64 string for OSC 52 */
function toBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

/** Decode a base64 string from OSC 52 */
export function fromBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Build an OSC 52 escape sequence to copy text to the system clipboard.
 * OSC 52 format: \x1b]52;c;<base64-data>\x07
 *
 * The 'c' parameter targets the system clipboard.
 */
export function osc52Copy(text: string): string {
  return `\x1b]52;c;${toBase64(text)}\x07`;
}

/**
 * Build an OSC 52 escape sequence to request clipboard contents.
 * OSC 52 format: \x1b]52;c;?\x07
 *
 * The terminal will respond with the clipboard contents.
 */
export function osc52PasteRequest(): string {
  return `\x1b]52;c;?\x07`;
}

// ─── Bracketed Paste Mode ───────────────────────────────────────────────────

/** Enable bracketed paste mode */
export const BRACKETED_PASTE_ENABLE = '\x1b[?2004h';

/** Disable bracketed paste mode */
export const BRACKETED_PASTE_DISABLE = '\x1b[?2004l';

/** Bracketed paste start marker */
export const BRACKETED_PASTE_START = '\x1b[200~';

/** Bracketed paste end marker */
export const BRACKETED_PASTE_END = '\x1b[201~';

/**
 * Detect if input data is a bracketed paste.
 * Returns the pasted text if it is, or null otherwise.
 */
export function parseBracketedPaste(input: string): string | null {
  if (!input.startsWith(BRACKETED_PASTE_START)) return null;

  const endIdx = input.indexOf(BRACKETED_PASTE_END);
  if (endIdx === -1) return null;

  return input.slice(BRACKETED_PASTE_START.length, endIdx);
}

/**
 * Wrap pasted text for forwarding into a child PTY.
 *
 * Normalizes line endings to `\n` (the unicode kind a terminal expects), then
 * either brackets with `\x1b[200~ ... \x1b[201~` (so child apps that have
 * enabled bracketed paste — Claude Code, vim, modern shells — receive it as a
 * single chunk and don't submit each line as a separate command), or rewrites
 * `\n` → `\r` so a non-bracketing child treats it as a stream of Enter keys
 * instead of literal `\n` characters.
 *
 * Pass `bracketed: true` whenever the source is a real user paste (host
 * terminal bracketed paste, browser `paste` event with the host advertising
 * `?2004h`); pass `false` only when the destination is known not to support it.
 */
export function wrapBracketedPaste(text: string, bracketed: boolean): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (bracketed) return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}`;
  return normalized.replace(/\n/g, '\r');
}

/**
 * Detect if input data contains an OSC 52 paste response.
 * Returns the decoded text if it does, or null otherwise.
 *
 * Response format: \x1b]52;c;<base64-data>\x07  or  \x1b]52;c;<base64-data>\x1b\\
 */
export function parseOsc52Response(input: string): string | null {
  // Check for OSC 52 response prefix
  const prefix = '\x1b]52;c;';
  const startIdx = input.indexOf(prefix);
  if (startIdx === -1) return null;

  const dataStart = startIdx + prefix.length;

  // Find terminator: BEL (\x07) or ST (\x1b\\)
  let endIdx = input.indexOf('\x07', dataStart);
  if (endIdx === -1) {
    endIdx = input.indexOf('\x1b\\', dataStart);
    if (endIdx === -1) return null;
  }

  const base64Data = input.slice(dataStart, endIdx);
  if (base64Data === '?') return null; // This is a request, not a response

  return fromBase64(base64Data);
}

export interface Osc52ResponseMatch {
  text: string;
  start: number;
  end: number;
}

export function matchOsc52Response(input: string): Osc52ResponseMatch | null {
  const prefix = '\x1b]52;c;';
  const startIdx = input.indexOf(prefix);
  if (startIdx === -1) return null;

  const dataStart = startIdx + prefix.length;

  let endIdx = input.indexOf('\x07', dataStart);
  let terminatorLength = 1;
  if (endIdx === -1) {
    endIdx = input.indexOf('\x1b\\', dataStart);
    if (endIdx === -1) return null;
    terminatorLength = 2;
  }

  const base64Data = input.slice(dataStart, endIdx);
  if (base64Data === '?') return null;

  return {
    text: fromBase64(base64Data),
    start: startIdx,
    end: endIdx + terminatorLength,
  };
}

// ─── Clipboard Commands ─────────────────────────────────────────────────────

/**
 * Clipboard command factory methods that integrate with the Cmd system.
 */
export const ClipboardCmd = {
  /**
   * Copy text to the system clipboard via OSC 52.
   * The toMsg callback receives a Result indicating success or failure.
   */
  copyToClipboard<M>(text: string, toMsg: (result: Result<void, Error>) => M): Cmd<M> {
    return Cmd.custom('clipboard.copy', { text }, toMsg as (result: Result<unknown, unknown>) => M);
  },

  /**
   * Request a paste from the system clipboard via OSC 52.
   * The runtime resolves the command when the OSC 52 response arrives.
   * The toMsg callback receives the pasted clipboard text on success.
   */
  requestPaste<M>(toMsg: (result: Result<string, Error>) => M): Cmd<M> {
    return Cmd.custom('clipboard.paste.request', {}, toMsg as (result: Result<unknown, unknown>) => M);
  },

  /**
   * Enable bracketed paste mode.
   * When enabled, pasted text is wrapped in escape sequences
   * that can be detected by parseBracketedPaste().
   */
  enableBracketedPaste<M>(toMsg: (result: Result<void, Error>) => M): Cmd<M> {
    return Cmd.custom('clipboard.paste.enable', {}, toMsg as (result: Result<unknown, unknown>) => M);
  },

  /**
   * Disable bracketed paste mode.
   */
  disableBracketedPaste<M>(toMsg: (result: Result<void, Error>) => M): Cmd<M> {
    return Cmd.custom('clipboard.paste.disable', {}, toMsg as (result: Result<unknown, unknown>) => M);
  },
};
