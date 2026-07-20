/**
 * AI-Native Admonition Themes (C8)
 *
 * Provides theme overrides for AI-specific admonition kinds:
 *   - ai-thinking   — chain-of-thought / reasoning blocks
 *   - tool-call     — function / tool invocation blocks
 *   - citation      — source / reference blocks
 *
 * Usage:
 *   const theme = createTheme(aiAdmonitionTheme('ai-thinking'));
 *   renderMarkdown(source, { aiAdmonitionThemes: { 'ai-thinking': aiAdmonitionTheme('ai-thinking') } });
 */

import { color, style } from '@celestial/corona';
import { markdownGlyph } from './markdown-glyphs.js';
import type { AdmonitionKind, AdmonitionThemeOverride } from './types.js';

const AI_COLORS: Record<Extract<AdmonitionKind, 'ai-thinking' | 'tool-call' | 'citation'>, () => ReturnType<typeof color.hex>> = {
  'ai-thinking': () => color.cyan,
  'tool-call': () => color.gray,
  citation: () => color.white,
};

const AI_ICONS: Record<Extract<AdmonitionKind, 'ai-thinking' | 'tool-call' | 'citation'>, string> = {
  'ai-thinking': markdownGlyph('ai-thinking'),
  'tool-call': markdownGlyph('tool-call'),
  citation: markdownGlyph('citation'),
};

/**
 * Return a theme override for an AI admonition kind.
 *
 * @param kind    One of the AI-native admonition kinds
 * @param merge   Optional custom overrides merged on top
 */
export function aiAdmonitionTheme(
  kind: Extract<AdmonitionKind, 'ai-thinking' | 'tool-call' | 'citation'>,
  merge?: AdmonitionThemeOverride,
): AdmonitionThemeOverride {
  const c = AI_COLORS[kind]();
  const icon = AI_ICONS[kind];

  return {
    admonitionTitle: (_kind: AdmonitionKind, title: string) => {
      const mergedTitle = merge?.admonitionTitle?.(kind, title);
      if (mergedTitle !== undefined) return mergedTitle;
      return style({ color: c, bold: true }).render(`${icon} ${title}`);
    },
    admonitionBorder: (_kind: AdmonitionKind) => {
      const mergedBorder = merge?.admonitionBorder?.(kind);
      if (mergedBorder !== undefined) return mergedBorder;
      return style({ color: c }).render(markdownGlyph('admonition-rail'));
    },
  };
}
