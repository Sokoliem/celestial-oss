/**
 * Pulsar parser public surface.
 *
 * Decomposed implementation:
 *   - `inline.ts` — `parseInline`, emoji shortcode registry
 *   - `blocks.ts` — `parseMarkdown` block dispatcher, list/table parsers
 *   - `refs.ts`   — reference-link extraction (used by blocks + inline)
 */

export { parseMarkdown } from './blocks.js';
export { getEmoji, parseInline, registerEmoji } from './inline.js';
