import type { Color, SemanticTheme, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { column, row, text } from '@celestial/core/nebula';
import { divider } from './divider.js';
import { keycap } from './keycap.js';
import { applyTypography, type ConstellationThemedOptions, resolveTheme, useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface EmptyStateTokens {
  text: Color;
  description: Color;
  muted: Color;
  accent: Color;
  titleStyle: TypographyToken;
  captionStyle: TypographyToken;
}

export const emptyStateContract: TokenContract<EmptyStateTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  description: (t: SemanticTheme) => t.colors.textSoft,
  muted: (t: SemanticTheme) => t.colors.muted,
  accent: (t: SemanticTheme) => t.colors.tones.accent,
  titleStyle: (t: SemanticTheme) => t.typography.title,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
};

export interface EmptyStateAction {
  label: string;
  shortcut?: string | string[];
}

export interface EmptyStateConfig extends ConstellationThemedOptions {
  title: string;
  description: string;
  icon?: string;
  actions?: EmptyStateAction[];
  width?: number;
  themeCtx?: ThemeContext;
}

export function emptyState(config: EmptyStateConfig): VNode {
  const tokens = useTokens(emptyStateContract, config, 'EmptyState');
  const theme = resolveTheme(config);
  const tone = config.tone ?? 'info';
  const toneColor = tone === 'neutral' ? tokens.text : theme.colors.tones[tone];
  const header = config.icon ? `${config.icon} ${config.title}` : config.title;
  const nodes: VNode[] = [
    divider({ width: config.width, tone, theme: config.theme, themeCtx: config.themeCtx }),
    text(header, applyTypography(tokens.titleStyle, { color: toneColor, bold: true })),
    text(config.description, style({ color: tokens.description })),
  ];

  if (config.actions && config.actions.length > 0) {
    const actionNodes = config.actions.map((action) => {
      const parts: VNode[] = [text(action.label, style({ color: tokens.text }))];
      if (action.shortcut) {
        parts.push(text('  ', style({ color: tokens.muted })));
        parts.push(keycap({ keys: action.shortcut, theme: config.theme, themeCtx: config.themeCtx, tone: 'accent', compact: true }));
      }
      return row(...parts);
    });
    nodes.push(...actionNodes);
  }

  nodes.push(divider({ width: config.width, tone: 'neutral', theme: config.theme, themeCtx: config.themeCtx }));

  return column(...nodes);
}
