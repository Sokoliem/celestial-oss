/**
 * External terminal file-drop parser.
 *
 * Per-emulator encodings vary; this parser implements the three forms
 * observed in the field today:
 *
 *   1. **iTerm2** — `\x1b]1337;DragDrop=Files=<base64-newline-joined-paths>\x07`
 *   2. **kitty / WezTerm** — `\x1b]50;files=<base64-newline-joined-paths>\x07`
 *      (kitty's drag-drop protocol).
 *   3. **Generic newline-paths** — bracketed-paste-wrapped content where
 *      every line is an absolute path. Some terminals fall through to
 *      this when they have no native drop protocol.
 *
 * Returns null on no-match. Returns `{ paths: [], origin }` when a
 * sequence is recognised but the payload cannot be decoded — signal for
 * telemetry that "a drop happened, we couldn't read it".
 *
 * Scope (PRD §15 phase 8): pre-requisite is per-emulator encoding
 * research. This implementation captures the most commonly seen forms;
 * additional encodings (Ghostty, etc.) can land in follow-up phases.
 */

export interface TerminalFileDrop {
  readonly paths: readonly string[];
  readonly origin?: 'kitty' | 'wezterm' | 'iterm2' | 'generic';
}

function decodeBase64Lines(b64: string): string[] {
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    return decoded
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function tryIterm2(data: string): TerminalFileDrop | null {
  const match = /\x1b\]1337;DragDrop=Files=([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)/.exec(data);
  if (!match) return null;
  return { paths: decodeBase64Lines(match[1]!), origin: 'iterm2' };
}

function tryKittyWezterm(data: string): TerminalFileDrop | null {
  const match = /\x1b\]50;files=([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)/.exec(data);
  if (!match) return null;
  return { paths: decodeBase64Lines(match[1]!), origin: 'kitty' };
}

function tryGenericNewline(data: string): TerminalFileDrop | null {
  const start = data.indexOf('\x1b[200~');
  const end = data.indexOf('\x1b[201~');
  if (start === -1 || end === -1 || end <= start) return null;
  const body = data.slice(start + '\x1b[200~'.length, end);
  const candidates = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // Only treat as file-drop when every line is an absolute path.
  if (candidates.length === 0) return null;
  const allAbsolute = candidates.every((p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('file://'));
  if (!allAbsolute) return null;
  return { paths: candidates, origin: 'generic' };
}

/** Parse a terminal file-drop sequence. Returns null on no-match. */
export function parseTerminalFileDrop(data: string): TerminalFileDrop | null {
  return tryIterm2(data) ?? tryKittyWezterm(data) ?? tryGenericNewline(data);
}
