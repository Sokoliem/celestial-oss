import type { Color, SemanticTheme, TokenContract } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { text } from '@celestial/core/nebula';
import { type ConstellationSize, type ConstellationThemedOptions, clampWidth, resolveTheme, useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface DividerTokens {
  line: Color;
}

export const dividerContract: TokenContract<DividerTokens> = {
  line: (t: SemanticTheme) => t.colors.divider,
};

export type DividerAlign = 'left' | 'center' | 'right';

export interface DividerConfig extends ConstellationThemedOptions {
  label?: string;
  width?: number;
  char?: string;
  align?: DividerAlign;
  inset?: number;
  themeCtx?: ThemeContext;
}

export function divider(config: DividerConfig = {}): VNode {
  const tokens = useTokens(dividerContract, config, 'Divider');
  const theme = resolveTheme(config);
  const size = config.size ?? 'md';
  const width = clampWidth(config.width, 40);
  const inset = Math.max(0, config.inset ?? defaultInset(size, theme.spacing[size]));
  const char = (config.char ?? theme.glyphs.divider).slice(0, 1) || '-';
  const usableWidth = Math.max(1, width - inset * 2);
  const label = config.label?.trim();
  const tone = config.tone ?? 'neutral';
  const lineColor = tone === 'neutral' ? tokens.line : theme.colors.tones[tone];
  const dividerStyle = style({ color: lineColor });

  if (!label) {
    return text(' '.repeat(inset) + char.repeat(usableWidth) + ' '.repeat(inset), dividerStyle);
  }

  const labelChunk = ` ${label} `;
  if (labelChunk.length >= usableWidth) {
    return text(' '.repeat(inset) + labelChunk.slice(0, usableWidth), dividerStyle);
  }

  const remaining = usableWidth - labelChunk.length;
  let left = 0;
  let right = 0;

  switch (config.align ?? 'center') {
    case 'left':
      left = 1;
      right = remaining - left;
      break;
    case 'right':
      right = 1;
      left = remaining - right;
      break;
    case 'center':
    default:
      left = Math.floor(remaining / 2);
      right = remaining - left;
      break;
  }

  return text(' '.repeat(inset) + char.repeat(left) + labelChunk + char.repeat(right) + ' '.repeat(inset), dividerStyle);
}

function defaultInset(size: ConstellationSize, spacing: number): number {
  if (size === 'xs' || size === 'sm') {
    return 0;
  }
  return Math.max(0, spacing - 1);
}
