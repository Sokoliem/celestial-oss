/**
 * Clickable Widget Support
 *
 * Provides hit-testing context, clickable regions, and styled buttons
 * by integrating with @celestial/core/nexus's HitMap.
 */

import type { Color, SemanticTheme, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { text } from '@celestial/core/nebula';
import { HitMap, type HitRegion } from '@celestial/core/nexus';
import type { ConstellationThemeInput, ConstellationTone } from './theme.js';
import { resolveTheme, useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ClickableTokens {
  text: Color;
  accent: Color;
  textSoft: Color;
  muted: Color;
  inverse: Color;
  hoverBackground: Color;
  hoverText: Color;
  labelStyle: TypographyToken;
}

export const clickableContract: TokenContract<ClickableTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  accent: (t: SemanticTheme) => t.colors.interactive,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  muted: (t: SemanticTheme) => t.colors.muted,
  inverse: (t: SemanticTheme) => t.colors.inverse,
  hoverBackground: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceAlt,
  hoverText: (t: SemanticTheme) => t.states.hover.fg,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

// ---------------------------------------------------------------------------
// ClickContext — shared hit-testing context for an app
// ---------------------------------------------------------------------------

export interface ClickContext<M> {
  readonly hitMap: HitMap<M>;
  register(region: { x: number; y: number; width: number; height: number; onClick: M; onHover?: { enter?: M; exit?: M } }): void;
  handleClick(x: number, y: number): M | null;
  handleHover(x: number, y: number): { enter?: M; exit?: M } | null;
  clear(): void;
}

/** Create a shared hit-testing context backed by a HitMap. */
export function createClickContext<M>(): ClickContext<M> {
  const hitMap = new HitMap<M>();

  return {
    hitMap,

    register(region) {
      hitMap.register({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        onClick: region.onClick,
        onHover: region.onHover,
        cursor: 'pointer',
      });
    },

    handleClick(x: number, y: number): M | null {
      const hit = hitMap.hitTest(x, y);
      if (!hit) return null;
      return hit.onClick ?? null;
    },

    handleHover(x: number, y: number): { enter?: M; exit?: M } | null {
      const hit = hitMap.hitTest(x, y);
      if (!hit) return null;
      return hit.onHover ?? null;
    },

    clear() {
      hitMap.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// clickable — wraps a VNode with a clickable region
// ---------------------------------------------------------------------------

/**
 * Registers a clickable region in the context and returns the content VNode
 * unchanged. Hit-testing is handled at the app level via the context.
 */
export function clickable<M>(
  content: VNode,
  region: { x: number; y: number; width: number; height: number },
  onClick: M,
  ctx: ClickContext<M>,
  onHover?: { enter?: M; exit?: M },
): VNode {
  ctx.register({ ...region, onClick, onHover });
  return content;
}

// ---------------------------------------------------------------------------
// button — styled clickable button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'filled' | 'outline' | 'ghost';

export interface ButtonConfig<M> {
  label: string;
  onClick: M;
  /** Elm messages emitted as the pointer enters or leaves the button region. */
  onHover?: { enter?: M; exit?: M };
  x: number;
  y: number;
  /**
   * @deprecated Use `buttonVariant` and `tone` instead. Kept for backward compatibility.
   * When set, `buttonVariant` and `tone` are ignored.
   */
  variant?: 'default' | 'primary' | 'danger';
  /** Visual style of the button. Default: 'outline'. Ignored when legacy `variant` is set. */
  buttonVariant?: ButtonVariant;
  /** Semantic tone color. Default: 'neutral'. Ignored when legacy `variant` is set. */
  tone?: ConstellationTone;
  /** Theme overrides for color resolution. */
  theme?: ConstellationThemeInput;
  themeCtx?: ThemeContext;
  /** Pointer hover state supplied by the host's model. */
  hovered?: boolean;
}

/** Create a styled clickable button. */
export function button<M>(config: ButtonConfig<M>): {
  view(): VNode;
  region: HitRegion<M>;
} {
  const { label, onClick, x, y } = config;

  // Determine rendered text width based on variant for hit region sizing
  const useLegacy = config.variant !== undefined;
  const buttonVariant: ButtonVariant = config.buttonVariant ?? 'outline';

  // Width calculation depends on visual variant
  const effectiveVariant = useLegacy ? 'outline' : buttonVariant;
  const width = effectiveVariant === 'ghost' ? label.length : label.length + 4; // "[ label ]" or "▐ label ▌"
  const height = 1;

  const region: HitRegion<M> = {
    x,
    y,
    width,
    height,
    onClick,
    onHover: config.onHover,
    cursor: 'pointer',
  };

  function view(): VNode {
    const tokens = useTokens(clickableContract, config, 'Button');
    const theme = resolveTheme(config);

    // Legacy variant path — backward compatible
    if (useLegacy) {
      const rendered = `[ ${label} ]`;
      if (config.hovered) {
        return text(rendered, style({ color: tokens.hoverText, background: tokens.hoverBackground, bold: true }));
      }
      switch (config.variant) {
        case 'primary': {
          const s = style({ color: theme.colors.tones.success, bold: true });
          return text(rendered, s);
        }
        case 'danger': {
          const s = style({ color: theme.colors.tones.danger, bold: true });
          return text(rendered, s);
        }
        case 'default':
        default: {
          const s = style({ color: tokens.text, dim: true });
          return text(rendered, s);
        }
      }
    }

    // New variant + tone path
    const tone = config.tone ?? 'neutral';
    const toneColor = tone === 'neutral' ? tokens.accent : theme.colors.tones[tone];
    if (config.hovered) {
      const rendered = buttonVariant === 'ghost' ? label : buttonVariant === 'filled' ? `\u2590 ${label} \u258C` : `[ ${label} ]`;
      return text(rendered, style({ background: tokens.hoverBackground, color: toneColor, bold: true, underline: buttonVariant === 'ghost' }));
    }

    switch (buttonVariant) {
      case 'filled': {
        const rendered = `\u2590 ${label} \u258C`;
        const s = style({ background: toneColor, color: tokens.inverse, bold: true });
        return text(rendered, s);
      }
      case 'ghost': {
        const s = style({ color: toneColor });
        return text(label, s);
      }
      case 'outline':
      default: {
        const rendered = `[ ${label} ]`;
        const s = style({ color: toneColor, bold: true });
        return text(rendered, s);
      }
    }
  }

  return { view, region };
}
