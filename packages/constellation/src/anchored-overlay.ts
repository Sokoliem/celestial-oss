/**
 * `anchoredOverlay` — pure view helper that places content next to an anchor
 * rect with optional flip-on-overflow and a caret glyph indicating the
 * relationship to the anchor.
 *
 * Replaces the inline `POSITION_ARROWS` records in `popover.ts` and
 * `tooltip.ts` and the bespoke arrow positioning in `floating-action.ts` and
 * `context-menu-view.ts`.
 *
 * Phase 2 of the constellation primitive-hardening PRD (N3). Pure render-only
 * — no internal state, no subscriptions. For dynamic anchor resolution
 * (rect-by-region-id), consumers compose with `gravity.anchor()` themselves.
 */

import { type GlyphLevel, type GlyphToken, resolveGlyph, style, type ThemeInput } from '@celestial/core/corona';
import type { AnchorAlign, AnchorRect, AnchorSide } from '@celestial/core/gravity';
import { anchor as gravityAnchor } from '@celestial/core/gravity';
import { column, row, type ThemeContext, text, type VNode } from '@celestial/core/nebula';

/**
 * Caret glyph tokens, one per side. The caret POINTS AT the anchor — so a
 * popover above the anchor (side='top') has a downward-pointing caret on
 * its bottom edge.
 */
export const caretGlyphTokens: Record<AnchorSide, GlyphToken> = {
  top: { full: '', wide: '▼', basic: 'v', none: 'v' },
  bottom: { full: '', wide: '▲', basic: '^', none: '^' },
  left: { full: '', wide: '►', basic: '>', none: '>' },
  right: { full: '', wide: '◄', basic: '<', none: '<' },
};

export function caretFor(side: AnchorSide, level: GlyphLevel = 'wide'): string {
  return resolveGlyph(caretGlyphTokens[side], level);
}

export interface AnchoredOverlayConfig {
  /** Anchor rect (trigger position). */
  readonly anchor: AnchorRect;
  /** Desired side. May flip when `flipOnOverflow` is true and overflow detected. */
  readonly side: AnchorSide;
  /** Alignment along the perpendicular axis. Default 'center'. */
  readonly align?: AnchorAlign;
  /** Cells of gap between anchor and content. Default 1. */
  readonly offset?: number;
  /** Allow gravity.anchor to flip to the opposite side on overflow. Default true. */
  readonly flipOnOverflow?: boolean;
  /** Show a caret pointing at the anchor. Default true. */
  readonly caret?: boolean;
  /** Glyph level for the caret glyph. Default 'wide'. */
  readonly caretLevel?: GlyphLevel;
  /** Content node to overlay. */
  readonly content: VNode;
  /** Optional z-index forwarded to gravity.anchor. */
  readonly zIndex?: number;
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

/**
 * Wrap `content` with a caret glyph on the side facing the anchor, then
 * defer placement math to gravity.anchor.
 *
 * Returns a ComponentNode (renders against the runtime layout context).
 */
export function anchoredOverlay(config: AnchoredOverlayConfig): VNode {
  const side = config.side;
  const showCaret = config.caret ?? true;
  const caretLevel = config.caretLevel ?? 'wide';
  const offset = config.offset ?? 1;
  const flip = config.flipOnOverflow ?? true;

  const caretNode = showCaret ? text(caretFor(side, caretLevel), style({})) : undefined;

  // Compose: caret renders adjacent to content on the anchor-facing edge.
  // For side='top' (popover above anchor), caret goes BELOW the content.
  let composed: VNode;
  if (!caretNode) {
    composed = config.content;
  } else {
    switch (side) {
      case 'top':
        composed = column(config.content, caretNode);
        break;
      case 'bottom':
        composed = column(caretNode, config.content);
        break;
      case 'left':
        composed = row(config.content, caretNode);
        break;
      case 'right':
        composed = row(caretNode, config.content);
        break;
    }
  }

  return gravityAnchor({
    trigger: config.anchor,
    placement: `${side}-${config.align ?? 'center'}`,
    offset,
    flip,
    shift: true,
    zIndex: config.zIndex,
    child: composed,
  });
}
