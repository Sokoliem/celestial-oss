/**
 * Canvas-mode auto-resolver.
 *
 * Given a preferred mode (which may be `'auto'`) and an optional
 * capability snapshot, returns a concrete `CanvasMode`. The fallback
 * order — when `'auto'` is requested — is:
 *
 *   octant  → sextant  → braille  → quarter
 *
 * Sextants are the *primary fallback* per design: they're widely
 * supported in modern terminals (Unicode 13+, fonts since ~2020)
 * and look closer to octants than the alternatives. Braille drops
 * the gap-free property; quarter drops resolution.
 *
 * Capability shape is duck-typed so callers can either pass a
 * hand-rolled object or adapt `@celestial/atlas` capabilities at the
 * call site. Stellar deliberately does not depend on atlas — that
 * dep direction is fine on paper but adding it for one boolean is
 * unnecessary churn.
 */

import type { CanvasMode } from './codec.js';

export type CanvasModeOrAuto = CanvasMode | 'auto';

export interface ModeCapabilities {
  /**
   * True when the terminal renders the Unicode 16 octant block
   * (U+1CD00–U+1CDEF). Conservative default `false` when omitted —
   * tofu in misconfigured environments is a worse outcome than
   * one resolution step down.
   */
  readonly unicodeOctant?: boolean;
  /**
   * True when the terminal renders Unicode 13 sextants
   * (U+1FB00–U+1FB3B). Default `true` when omitted — sextants have
   * been widely supported since ~2020 and are the chosen primary
   * fallback for `'auto'`.
   */
  readonly unicodeSextant?: boolean;
  /**
   * True when the terminal renders braille (U+2800–U+28FF).
   * Default `true` — braille is essentially universal.
   */
  readonly unicodeBraille?: boolean;
}

/**
 * Resolve a (possibly auto) preference into a concrete codec mode.
 * Explicit modes are passed through unchanged — the resolver does
 * NOT downgrade a caller's explicit `'octant'` request to `'sextant'`
 * even on terminals that lack octant support, because the caller
 * may know something the capability snapshot doesn't.
 */
export function resolveCanvasMode(preferred: CanvasModeOrAuto, caps?: ModeCapabilities): CanvasMode {
  if (preferred !== 'auto') return preferred;

  const octant = caps?.unicodeOctant ?? false;
  const sextant = caps?.unicodeSextant ?? true;
  const braille = caps?.unicodeBraille ?? true;

  if (octant) return 'octant';
  if (sextant) return 'sextant';
  if (braille) return 'braille';
  return 'quarter';
}
