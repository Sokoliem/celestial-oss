/**
 * Terminal focus reporting (DEC mode 1004 / CSI 1004).
 *
 * Distinct from `./focus-events.ts`, which models UI focus-stack lifecycle
 * inside the running TUI. `terminal-focus.ts` deals strictly with the
 * terminal emulator's own focus state, surfaced as `\x1b[I` (focus-in) and
 * `\x1b[O` (focus-out) when DEC mode 1004 is enabled.
 *
 * Atlas declares `focusEvents` per `packages/atlas/src/types.ts:16`. Gate
 * `terminalFocusEnable` on that flag; the parser is safe to call regardless.
 */

export const terminalFocusEnable = '\x1b[?1004h' as const;
export const terminalFocusDisable = '\x1b[?1004l' as const;

export type TerminalFocusEvent = { readonly type: 'focus-in' } | { readonly type: 'focus-out' };

/** Parse `\x1b[I` (focus-in) or `\x1b[O` (focus-out). Returns null on no-match. */
export function parseTerminalFocusEvent(data: string): TerminalFocusEvent | null {
  if (data === '\x1b[I') return { type: 'focus-in' };
  if (data === '\x1b[O') return { type: 'focus-out' };
  return null;
}
