/**
 * Markdown anchor index + spring-driven scroll-to-anchor.
 *
 * Pulsar already assigns GitHub-style slugs to every heading via
 * `parseMarkdown`; `extractToc` enumerates them. This module adds:
 *
 *   - `buildAnchorIndex(tokens)` — `Map<slug, blockIndex>` for O(1)
 *     lookup. Block index is the position in the top-level `Token[]`,
 *     stable as long as the document isn't re-parsed.
 *   - `startAnchorScroll(from, to)` / `tickAnchorScroll(anim, elapsed)`
 *     — spring-physics scroll from an arbitrary current offset to the
 *     anchor's offset. Uses the same spring parameters as parallax's
 *     `SCROLL_SPRING` so the feel is consistent across packages, but
 *     wires aurora directly (no parallax dependency).
 *
 * Consumers (overlay, custom viewport components) maintain a mapping
 * from `blockIndex` → rendered Y-offset (which depends on width and
 * theme), then call `startAnchorScroll(currentOffset, targetOffset)`
 * to animate.
 */

import { spring as createSpring } from '@celestial/aurora';
import { inlineToPlainText, slugify } from './parser/anchors.js';
import type { Token } from './types.js';

// ── Anchor index ────────────────────────────────────────────────────────

export interface AnchorEntry {
  /** The heading's slug (matches the `id` set by `parseMarkdown`). */
  readonly slug: string;
  /** 0-based index into the top-level `Token[]`. */
  readonly blockIndex: number;
  /** Heading level (1–6). */
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  /** Plain-text label. */
  readonly text: string;
}

export type AnchorIndex = ReadonlyMap<string, AnchorEntry>;

/**
 * Build an O(1) anchor index from a parsed document. Walks only the
 * top-level token array — headings nested inside blockquotes /
 * admonitions / list children are still discoverable via
 * `extractToc`, but anchor scrolling targets top-level structure
 * because that's what consumers actually scroll to.
 */
export function buildAnchorIndex(tokens: readonly Token[]): AnchorIndex {
  const map = new Map<string, AnchorEntry>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== 'heading') continue;
    const text = inlineToPlainText(token.content);
    const slug = token.id ?? slugify(text);
    if (!map.has(slug)) {
      map.set(slug, { slug, blockIndex: i, level: token.level, text });
    }
  }
  return map;
}

// ── Spring-physics scroll ───────────────────────────────────────────────

/**
 * Spring parameters tuned for anchor-jump scrolling. Matches parallax's
 * `SCROLL_SPRING` — snappy enough for "I jumped sections" but not
 * jarring. Exported so consumers can mix with their own physics.
 */
export const ANCHOR_SCROLL_SPRING = {
  stiffness: 300,
  damping: 30,
  mass: 1,
} as const;

const FIXED_DT_MS = 16;

export interface AnchorScrollAnimation {
  readonly from: number;
  readonly to: number;
  readonly active: boolean;
  readonly startTime: number;
}

/** Start a new anchor-scroll animation from `from` to `to`. */
export function startAnchorScroll(from: number, to: number): AnchorScrollAnimation {
  return {
    from,
    to,
    active: from !== to,
    startTime: Date.now(),
  };
}

/**
 * Sample the spring at `elapsed` ms past the animation's start.
 * Returns `{ value, done }`. Pure function — same inputs always
 * produce the same output, suitable for time-travel and snapshot
 * tests.
 */
export function tickAnchorScroll(anim: AnchorScrollAnimation, elapsed: number): { value: number; done: boolean } {
  if (anim.from === anim.to) return { value: anim.to, done: true };
  if (elapsed <= 0) return { value: anim.from, done: false };

  const s = createSpring(anim.to, {
    from: anim.from,
    stiffness: ANCHOR_SCROLL_SPRING.stiffness,
    damping: ANCHOR_SCROLL_SPRING.damping,
    mass: ANCHOR_SCROLL_SPRING.mass,
  });

  s.tick(0);
  for (let t = FIXED_DT_MS; t <= elapsed; t += FIXED_DT_MS) {
    s.tick(t);
    if (s.done()) break;
  }
  return { value: s.value(), done: s.done() };
}

/**
 * Convenience: resolve the anchor's slug to a block index using the
 * provided index, returning `null` when the slug is unknown.
 */
export function resolveAnchor(index: AnchorIndex, slug: string): AnchorEntry | null {
  return index.get(slug) ?? null;
}
