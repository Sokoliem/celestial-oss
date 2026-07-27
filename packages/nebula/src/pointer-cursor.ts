/**
 * Mouse-pointer shapes understood by the OSC 22 protocol. The vocabulary is
 * deliberately shared with CSS so GUI hosts can consume the same callback.
 */
export const POINTER_CURSORS = [
  'alias',
  'cell',
  'copy',
  'crosshair',
  'default',
  'e-resize',
  'ew-resize',
  'grab',
  'grabbing',
  'help',
  'move',
  'n-resize',
  'ne-resize',
  'nesw-resize',
  'no-drop',
  'not-allowed',
  'ns-resize',
  'nw-resize',
  'nwse-resize',
  'pointer',
  'progress',
  's-resize',
  'se-resize',
  'sw-resize',
  'text',
  'vertical-text',
  'w-resize',
  'wait',
  'zoom-in',
  'zoom-out',
] as const;

export type PointerCursor = (typeof POINTER_CURSORS)[number];

const POINTER_CURSOR_SET: ReadonlySet<string> = new Set(POINTER_CURSORS);
const OSC = '\x1b]';
const ST = '\x1b\\';

export function isPointerCursor(value: unknown): value is PointerCursor {
  return typeof value === 'string' && POINTER_CURSOR_SET.has(value);
}

export function normalizePointerCursor(value: unknown, fallback: PointerCursor = 'default'): PointerCursor {
  return isPointerCursor(value) ? value : fallback;
}

/** Encode one safe OSC 22 pointer-shape update. `default` releases the shape. */
export function encodePointerCursor(cursor: PointerCursor): string {
  const safeCursor = normalizePointerCursor(cursor);
  return safeCursor === 'default' ? `${OSC}22;${ST}` : `${OSC}22;${safeCursor}${ST}`;
}

/**
 * Conservative environment detection for OSC 22. Applications can explicitly
 * force the protocol through AppOptions when running in another compatible
 * terminal.
 */
export function supportsPointerCursorOsc22(
  env: Readonly<Record<string, string | undefined>> =
    typeof process !== 'undefined' && process.env ? process.env : {},
): boolean {
  const termProgram = env.TERM_PROGRAM?.toLowerCase() ?? '';
  const term = env.TERM?.toLowerCase() ?? '';
  return Boolean(env.KITTY_WINDOW_ID || termProgram.includes('kitty') || term.includes('kitty'));
}
