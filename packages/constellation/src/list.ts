import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { column, text } from '@celestial/core/nebula';
import type { ConstellationTone } from './theme.js';
import { resolveTheme, useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ListTokens {
  text: Color;
  description: Color;
  selected: Color;
  muted: Color;
  altBg: Color;
  labelStyle: TypographyToken;
}

export const listContract: TokenContract<ListTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  description: (t: SemanticTheme) => t.colors.textSoft,
  selected: (t: SemanticTheme) => t.colors.highlight,
  muted: (t: SemanticTheme) => t.colors.muted,
  altBg: (t: SemanticTheme) => t.colors.surfaceAlt,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export interface ListItem {
  label: string;
  description?: string;
  prefix?: string;
  suffix?: string;
  tone?: ConstellationTone;
}

export interface ListConfig {
  items: Array<string | ListItem>;
  ordered?: boolean;
  bullet?: string;
  emptyLabel?: string;
  tone?: ConstellationTone;
  /**
   * Safety-valve cap on rendered items. `list()` is a stateless pure
   * renderer with no viewport awareness — for genuinely large datasets,
   * use `virtualList` instead, which windows through `virtual-scroll.ts`
   * and supports scrolling/selection. When set and exceeded, this renders
   * the first N items followed by a truncation hint pointing at virtualList.
   */
  maxRenderedItems?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/**
 * Render a static bulleted/ordered list as a single VNode.
 *
 * `list()` is intentionally stateless — it has no model, no subscriptions,
 * and no viewport. For windowed scrolling, selection, hover halos, or
 * datasets larger than a screenful, reach for `virtualList` instead.
 * `maxRenderedItems` is available as a defensive cap when a caller can't
 * easily migrate.
 */
export function list(config: ListConfig): VNode {
  const tokens = useTokens(listContract, config, 'List');
  const theme = resolveTheme(config);
  if (config.items.length === 0) {
    return text(config.emptyLabel ?? 'No items', style({ color: tokens.muted, dim: true }));
  }

  const cap = config.maxRenderedItems;
  const truncated = typeof cap === 'number' && config.items.length > cap;
  const renderedItems = truncated ? config.items.slice(0, cap) : config.items;

  const nodes: VNode[] = [];
  const defaultTone = config.tone ?? 'neutral';
  const bullet = config.bullet ?? theme.glyphs.bullet;

  renderedItems.forEach((item, index) => {
    const normalized = typeof item === 'string' ? { label: item } : item;
    const marker = config.ordered ? `${index + 1}.` : (normalized.prefix ?? bullet);
    const suffix = normalized.suffix ? ` ${normalized.suffix}` : '';
    const label = `${marker} ${normalized.label}${suffix}`;
    const itemTone = normalized.tone ?? defaultTone;
    const itemColor = itemTone === 'neutral' ? tokens.text : theme.colors.tones[itemTone];
    nodes.push(
      text(
        label,
        style({
          color: itemColor,
          bold: normalized.tone !== undefined && normalized.tone !== 'neutral',
        }),
      ),
    );

    if (normalized.description) {
      nodes.push(text(`${' '.repeat(marker.length + 1)}${normalized.description}`, style({ color: tokens.description })));
    }
  });

  if (truncated) {
    const remaining = config.items.length - (cap as number);
    nodes.push(text(`… and ${remaining} more (use virtualList for windowing)`, style({ color: tokens.muted, italic: true })));
  }

  return column(...nodes);
}
