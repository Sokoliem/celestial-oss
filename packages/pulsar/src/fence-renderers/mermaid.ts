/**
 * Mermaid compatibility renderer.
 *
 * Diagram parsing depends on the full repository's Canvas package, which is
 * intentionally outside this preview. Returning null delegates to Pulsar's
 * syntax-highlighted code-fence fallback without losing source content.
 */

import type { FenceRenderContext } from '../types.js';

export function mermaidFenceRenderer(_token: Extract<import('../types.js').Token, { type: 'code-block' }>, _ctx: FenceRenderContext): string | null {
  return null;
}

(mermaidFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';
