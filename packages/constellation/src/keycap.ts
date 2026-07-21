import type { Color, SemanticTheme, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { row, text } from '@celestial/core/nebula';
import { type ConstellationThemedOptions, normalizeTone, resolveTheme, useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface KeycapTokens {
  text: Color;
  border: Color;
  bg: Color;
  muted: Color;
  labelStyle: TypographyToken;
}

export const keycapContract: TokenContract<KeycapTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  border: (t: SemanticTheme) => t.colors.focusRing,
  bg: (t: SemanticTheme) => t.colors.surfaceRaised,
  muted: (t: SemanticTheme) => t.colors.muted,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export interface KeycapConfig extends ConstellationThemedOptions {
  keys: string | string[];
  label?: string;
  separator?: string;
  compact?: boolean;
  themeCtx?: ThemeContext;
}

export function keycap(config: KeycapConfig): VNode {
  const tokens = useTokens(keycapContract, config, 'Keycap');
  const theme = resolveTheme(config);
  const keys = Array.isArray(config.keys) ? config.keys : [config.keys];
  const nodes: VNode[] = [];
  const separator = config.separator ?? ' + ';
  const pad = config.compact ? '' : ' ';
  const tone = normalizeTone(config.tone, 'accent');
  const borderColor = tone === 'neutral' ? tokens.border : theme.colors.tones[tone];
  const capStyle = style({ color: borderColor, bold: true, background: tokens.bg });
  const mutedStyle = style({ color: tokens.muted });

  if (config.label) {
    nodes.push(text(config.label, mutedStyle));
    nodes.push(text(' '));
  }

  keys.forEach((key, index) => {
    nodes.push(text(`${theme.glyphs.keycapLeft}${pad}${key.toUpperCase()}${pad}${theme.glyphs.keycapRight}`, capStyle));
    if (index < keys.length - 1) {
      nodes.push(text(separator, mutedStyle));
    }
  });

  return row(...nodes);
}
