/**
 * Window / tab title and tab color (OSC 0 / OSC 2 / OSC 30 / OSC 6).
 *
 * Security (PRD §13): titles strip `\x1b`, `\x07`, `\x9c` (ST) before emit
 * so a hostile string like `"Hi\x1b]2;evil\x07"` cannot inject follow-on
 * escapes. The sequence terminates with BEL (`\x07`) for maximum
 * compatibility (xterm convention).
 */

const SANITIZE = /[\x1b\x07\x9c]/g;

function sanitize(text: string): string {
  return text.replace(SANITIZE, '');
}

/** OSC 2 — sets the window title only. */
export function setWindowTitle(text: string): string {
  return `\x1b]2;${sanitize(text)}\x07`;
}

/** OSC 0 — sets both icon and window title (xterm convention). */
export function setIconAndTitle(text: string): string {
  return `\x1b]0;${sanitize(text)}\x07`;
}

/**
 * Tab color via OSC 6 (iTerm2 form). Pass null to reset.
 * Emulators without OSC 6 support ignore the unknown OSC; this is harmless.
 *
 * Windows Terminal also supports OSC 30 in some builds; if `caps.terminalName`
 * is provided and identifies a Windows Terminal lineage we use OSC 30 instead.
 */
export function setTabColor(color: string | null, caps?: { readonly terminalName?: string }): string {
  if (color === null) {
    // Reset (iTerm2: OSC 6 with no payload).
    return '\x1b]6;;\x07';
  }
  const clean = sanitize(color);
  const useOsc30 = caps?.terminalName === 'windows-terminal' || caps?.terminalName === 'conhost';
  if (useOsc30) {
    return `\x1b]30;${clean}\x07`;
  }
  return `\x1b]6;1;preset;${clean}\x07`;
}
