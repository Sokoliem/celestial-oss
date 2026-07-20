/**
 * Cursor shape (DECSCUSR) + show/hide.
 *
 * Atlas declares `cursorShapes` per `packages/atlas/src/types.ts:32`.
 * Terminals lacking DECSCUSR ignore the sequence; no gate needed.
 */

export type CursorShape = 'block' | 'underline' | 'bar';

/**
 * Emit DECSCUSR `\x1b[<n> q`. Odd n = blinking, even n = steady.
 * 1/2 = block, 3/4 = underline, 5/6 = bar.
 */
export function setCursorShape(shape: CursorShape, blinking = true): string {
  const base = shape === 'block' ? 1 : shape === 'underline' ? 3 : 5;
  const n = blinking ? base : base + 1;
  return `\x1b[${n} q`;
}

export const cursorShow = '\x1b[?25h' as const;
export const cursorHide = '\x1b[?25l' as const;
