/**
 * Synchronized output (DEC mode 2026 / BSU+ESU).
 *
 * Wrap a multi-cell frame so the terminal commits it atomically — no
 * mid-frame paint when scrolling or resizing. Atlas declares `syncOutput`
 * per `packages/atlas/src/types.ts:27`; gate via `withSyncOutput(caps, ...)`.
 */

export const syncOutputBegin = '\x1b[?2026h' as const;
export const syncOutputEnd = '\x1b[?2026l' as const;

/** Wrap a frame in BSU/ESU only when caps.synchronizedOutput is true. */
export function withSyncOutput(caps: { readonly synchronizedOutput: boolean }, frame: string): string {
  return caps.synchronizedOutput ? `${syncOutputBegin}${frame}${syncOutputEnd}` : frame;
}
