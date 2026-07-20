/**
 * Visual-width estimation for terminal text.
 *
 * Delegates to `@celestial/rosetta`'s grapheme-cluster-aware width API
 * so combining marks (e.g. `é`), ZWJ emoji families (`👨‍👩‍👧`) and
 * regional-indicator flag pairs are measured as a single cell each.
 *
 * The legacy code-point heuristic that previously lived here is kept as
 * `visualWidthLegacy` for snapshot comparison during regression triage —
 * it is not exported.
 */

import { measureTextWidth } from '@celestial/rosetta';
import { stripAnsi } from './ansi.js';

/**
 * Compute the visual (terminal-cell) width of a string, ignoring ANSI
 * control sequences and accounting for grapheme clusters.
 */
export function visualWidth(str: string): number {
  return measureTextWidth(stripAnsi(str));
}
