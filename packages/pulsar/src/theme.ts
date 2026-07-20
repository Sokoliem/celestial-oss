/**
 * Pulsar Theme System
 *
 * Default and customizable themes for terminal markdown rendering.
 * Includes a semantic theme bridge for corona SemanticTheme integration.
 */

import type { SemanticTheme } from '@celestial/corona';
import { applyVariant, color, defaultTheme as defaultSemanticTheme, diffTokens, lightVariant, resolveDomainTokens, style } from '@celestial/corona';
import { measureTextWidth, truncateText } from '@celestial/rosetta';
import { markdownGlyph } from './markdown-glyphs.js';
import type { AdmonitionKind, MarkdownTheme } from './types.js';

// ── Admonition Colors ───────────────────────────────────────────────────

const ADMONITION_COLORS: Record<AdmonitionKind, () => ReturnType<typeof color.hex>> = {
  note: () => color.blue,
  tip: () => color.green,
  important: () => color.magenta,
  warning: () => color.yellow,
  caution: () => color.red,
  'ai-thinking': () => color.cyan,
  'tool-call': () => color.gray,
  citation: () => color.white,
};

const ADMONITION_ICONS: Record<AdmonitionKind, string> = {
  note: markdownGlyph('note'),
  tip: markdownGlyph('tip'),
  important: markdownGlyph('important'),
  warning: markdownGlyph('warning'),
  caution: markdownGlyph('caution'),
  'ai-thinking': markdownGlyph('ai-thinking'),
  'tool-call': markdownGlyph('tool-call'),
  citation: markdownGlyph('citation'),
};

const MAX_THEME_WIDTH = 1_000_000;

function normalizeThemeWidth(value: number | undefined, fallback: number, minimum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_THEME_WIDTH, Math.max(minimum, Math.floor(value)));
}

// ── Default Theme ───────────────────────────────────────────────────────

/**
 * Create the default markdown theme using corona styling.
 */
export function defaultTheme(): MarkdownTheme {
  const diff = resolveDomainTokens(diffTokens, defaultSemanticTheme);
  const h1Style = style({ color: color.cyan, bold: true });
  const h2Style = style({ color: color.blue, bold: true });
  const h3Style = style({ color: color.green, bold: true });
  const h4Style = style({ color: color.white, bold: true });
  const h5Style = style({ color: color.gray, bold: true });
  const h6Style = style({ color: color.gray, bold: true, dim: true });
  const boldStyle = style({ bold: true });
  const italicStyle = style({ italic: true });
  const codeStyle = style({ color: color.green });
  const codeBlockStyle = style({ dim: true });
  const linkTextStyle = style({ color: color.blue, underline: true });
  const linkUrlStyle = style({ dim: true });
  const blockquoteStyle = style({ dim: true });
  const bulletStyle = style({ color: color.cyan });
  const hrStyle = style({ dim: true });
  const strikethroughStyle = style({ strikethrough: true });
  const tableHeaderStyle = style({ bold: true, color: color.cyan });
  const tableCellStyle = style({});
  const tableBorderStyle = style({ dim: true });
  const footnoteStyle = style({ color: color.yellow, dim: true });
  const emojiStyle = style({});
  const imagePlaceholderStyle = style({ color: color.magenta, dim: true });
  const diffAddedStyle = style({ color: diff.added });
  const diffRemovedStyle = style({ color: diff.removed });
  const diffContextStyle = style({ color: diff.context });
  const diffHeaderStyle = style({ color: diff.header, bold: true });

  return {
    heading1: (text: string) => h1Style.render(text),
    heading2: (text: string) => h2Style.render(text),
    heading3: (text: string) => h3Style.render(text),
    heading4: (text: string) => h4Style.render(text),
    heading5: (text: string) => h5Style.render(text),
    heading6: (text: string) => h6Style.render(text),
    bold: (text: string) => boldStyle.render(text),
    italic: (text: string) => italicStyle.render(text),
    code: (text: string) => codeStyle.render(text),
    codeBlock: (text: string) => codeBlockStyle.render(text),
    link: (text: string, url: string) => linkTextStyle.render(text) + ' ' + linkUrlStyle.render(`(${url})`),
    linkText: (text: string) => linkTextStyle.render(text),
    blockquote: (text: string) => {
      const lines = text.split('\n');
      return lines.map((line) => blockquoteStyle.render('│ ' + line)).join('\n');
    },
    listBullet: bulletStyle.render('•'),
    listNumber: (n: number) => tableBorderStyle.render(`${n}.`),
    hr: (width: number) => hrStyle.render(markdownGlyph('rule').repeat(normalizeThemeWidth(width, 0, 0))),
    strikethrough: (text: string) => strikethroughStyle.render(text),
    tableHeader: (text: string) => tableHeaderStyle.render(text),
    tableCell: (text: string) => tableCellStyle.render(text),
    tableBorder: tableBorderStyle.render('│'),
    diffAdded: (text: string) => diffAddedStyle.render(text),
    diffRemoved: (text: string) => diffRemovedStyle.render(text),
    diffContext: (text: string) => diffContextStyle.render(text),
    diffHeader: (text: string) => diffHeaderStyle.render(text),
    searchCurrentMarker: markdownGlyph('active-rail'),
    codeHighlightMarker: markdownGlyph('active-rail'),
    taskChecked: style({ color: color.green }).render('[x]'),
    taskUnchecked: style({ dim: true }).render('[ ]'),
    admonitionTitle: (kind: AdmonitionKind, title: string) => {
      const colorFn = ADMONITION_COLORS[kind] ?? (() => color.gray);
      const icon = ADMONITION_ICONS[kind] ?? markdownGlyph('ai-thinking');
      return style({ color: colorFn(), bold: true }).render(`${icon} ${title}`);
    },
    admonitionBorder: (kind: AdmonitionKind) => {
      const colorFn = ADMONITION_COLORS[kind] ?? (() => color.gray);
      return style({ color: colorFn() }).render(markdownGlyph('admonition-rail'));
    },
    footnoteRef: (label: string) => footnoteStyle.render(`[${label}]`),
    footnoteDef: (label: string) => footnoteStyle.render(`[${label}]:`),
    imagePlaceholder: (alt: string, url: string) => imagePlaceholderStyle.render(`${markdownGlyph('image')}  ${alt}`) + ' ' + linkUrlStyle.render(`(${url})`),
    emoji: (_name: string, unicode: string) => emojiStyle.render(unicode),
    codeBlockFrame: (content: string, language: string, width?: number) => {
      const safeWidth = normalizeThemeWidth(width, 80, 1);
      const rawLabel = language ? truncateText(` ${language} `, safeWidth - 1, '') : '';
      const labelWidth = measureTextWidth(rawLabel);
      const langLabel = rawLabel ? style({ dim: true }).render(rawLabel) : '';
      const rule = markdownGlyph('rule');
      const topBorder = style({ dim: true }).render(markdownGlyph('code-top-left') + rule.repeat(Math.max(0, safeWidth - 1 - labelWidth))) + langLabel;
      const bottomBorder = style({ dim: true }).render(markdownGlyph('code-bottom-left') + rule.repeat(Math.max(0, safeWidth - 1)));
      return topBorder + '\n' + content + '\n' + bottomBorder;
    },
  };
}

// ── Light Theme ─────────────────────────────────────────────────────────

/**
 * Create a light-background-optimized theme.
 */
export function lightTheme(): MarkdownTheme {
  return fromSemanticTheme(applyVariant(defaultSemanticTheme, lightVariant));
}

// ── Theme Creation ──────────────────────────────────────────────────────

/**
 * Create a custom theme by merging overrides with the default theme.
 */
export function createTheme(overrides: Partial<MarkdownTheme>): MarkdownTheme {
  return { ...defaultTheme(), ...overrides };
}

/**
 * Create a markdown theme bridged from a corona SemanticTheme.
 *
 * Maps semantic tone colors to markdown elements for consistent
 * visual identity across the entire Celestial TUI ecosystem.
 */
export function fromSemanticTheme(semanticTheme: SemanticTheme): MarkdownTheme {
  const { colors, glyphs } = semanticTheme;
  const diff = resolveDomainTokens(diffTokens, semanticTheme);

  const h1Style = style({ color: colors.tones.accent, bold: true });
  const h2Style = style({ color: colors.tones.info, bold: true });
  const h3Style = style({ color: colors.tones.success, bold: true });
  const h4Style = style({ color: colors.text, bold: true });
  const h5Style = style({ color: colors.muted, bold: true });
  const h6Style = style({ color: colors.muted, dim: true });
  const boldStyle = style({ bold: true });
  const italicStyle = style({ italic: true });
  const codeStyle = style({ color: colors.tones.warning });
  const codeBlockStyle = style({ dim: true });
  const linkTextStyle = style({ color: colors.tones.info, underline: true });
  const linkUrlStyle = style({ color: colors.muted });
  const blockquoteStyle = style({ color: colors.muted });
  const hrStyle = style({ color: colors.border });
  const strikethroughStyle = style({ strikethrough: true, color: colors.muted });
  const tableHeaderStyle = style({ bold: true, color: colors.tones.accent });
  const tableCellStyle = style({ color: colors.text });
  const tableBorderStyle = style({ color: colors.border });
  const footnoteStyle = style({ color: colors.tones.warning, dim: true });
  const imagePlaceholderStyle = style({ color: colors.tones.accent, dim: true });

  const semanticAdmonitionColors: Record<AdmonitionKind, ReturnType<typeof color.hex>> = {
    note: colors.tones.info,
    tip: colors.tones.success,
    important: colors.tones.accent,
    warning: colors.tones.warning,
    caution: colors.tones.danger,
    'ai-thinking': colors.tones.accent,
    'tool-call': colors.muted,
    citation: colors.text,
  };

  return {
    heading1: (text: string) => h1Style.render(text),
    heading2: (text: string) => h2Style.render(text),
    heading3: (text: string) => h3Style.render(text),
    heading4: (text: string) => h4Style.render(text),
    heading5: (text: string) => h5Style.render(text),
    heading6: (text: string) => h6Style.render(text),
    bold: (text: string) => boldStyle.render(text),
    italic: (text: string) => italicStyle.render(text),
    code: (text: string) => codeStyle.render(text),
    codeBlock: (text: string) => codeBlockStyle.render(text),
    link: (text: string, url: string) => linkTextStyle.render(text) + ' ' + linkUrlStyle.render(`(${url})`),
    linkText: (text: string) => linkTextStyle.render(text),
    blockquote: (text: string) => {
      const lines = text.split('\n');
      return lines.map((line) => blockquoteStyle.render((glyphs.pipe ?? '│') + ' ' + line)).join('\n');
    },
    listBullet: style({ color: colors.tones.accent }).render(glyphs.bullet ?? '•'),
    listNumber: (n: number) => tableBorderStyle.render(`${n}.`),
    hr: (width: number) => hrStyle.render(markdownGlyph('rule').repeat(normalizeThemeWidth(width, 0, 0))),
    strikethrough: (text: string) => strikethroughStyle.render(text),
    tableHeader: (text: string) => tableHeaderStyle.render(text),
    tableCell: (text: string) => tableCellStyle.render(text),
    tableBorder: tableBorderStyle.render(glyphs.pipe ?? '│'),
    diffAdded: (text: string) => style({ color: diff.added }).render(text),
    diffRemoved: (text: string) => style({ color: diff.removed }).render(text),
    diffContext: (text: string) => style({ color: diff.context }).render(text),
    diffHeader: (text: string) => style({ color: diff.header, bold: true }).render(text),
    searchCurrentMarker: markdownGlyph('active-rail'),
    codeHighlightMarker: markdownGlyph('active-rail'),
    taskChecked: style({ color: colors.tones.success }).render(glyphs.checked ?? '[x]'),
    taskUnchecked: style({ color: colors.muted }).render(glyphs.unchecked ?? '[ ]'),
    admonitionTitle: (kind: AdmonitionKind, title: string) => {
      const c = semanticAdmonitionColors[kind];
      const icon = ADMONITION_ICONS[kind];
      return style({ color: c, bold: true }).render(`${icon} ${title}`);
    },
    admonitionBorder: (kind: AdmonitionKind) => {
      const c = semanticAdmonitionColors[kind];
      return style({ color: c }).render(markdownGlyph('admonition-rail'));
    },
    footnoteRef: (label: string) => footnoteStyle.render(`[${label}]`),
    footnoteDef: (label: string) => footnoteStyle.render(`[${label}]:`),
    imagePlaceholder: (alt: string, url: string) => imagePlaceholderStyle.render(`${markdownGlyph('image')}  ${alt}`) + ' ' + linkUrlStyle.render(`(${url})`),
    emoji: (_name: string, unicode: string) => unicode,
    codeBlockFrame: (content: string, language: string, width?: number) => {
      const safeWidth = normalizeThemeWidth(width, 80, 1);
      const rawLabel = language ? truncateText(` ${language} `, safeWidth - 1, '') : '';
      const labelWidth = measureTextWidth(rawLabel);
      const langLabel = rawLabel ? style({ color: colors.muted }).render(rawLabel) : '';
      const borderStyle = style({ color: colors.border });
      const rule = markdownGlyph('rule');
      const topBorder = borderStyle.render(markdownGlyph('code-top-left') + rule.repeat(Math.max(0, safeWidth - 1 - labelWidth))) + langLabel;
      const bottomBorder = borderStyle.render(markdownGlyph('code-bottom-left') + rule.repeat(Math.max(0, safeWidth - 1)));
      return topBorder + '\n' + content + '\n' + bottomBorder;
    },
  };
}

/**
 * Create a custom markdown theme from a simple color map.
 * Convenience function matching the README's `createMarkdownTheme()` API.
 */
export function createMarkdownTheme(colors: {
  heading?: string;
  bold?: string;
  italic?: string;
  code?: string;
  link?: string;
  quote?: string;
  list?: string;
}): MarkdownTheme {
  const base = defaultTheme();
  const overrides: Partial<MarkdownTheme> = {};

  if (colors.heading) {
    const s = style({ color: color.hex(colors.heading), bold: true });
    overrides.heading1 = (text: string) => s.render(text);
    overrides.heading2 = (text: string) => s.render(text);
    overrides.heading3 = (text: string) => s.render(text);
    overrides.heading4 = (text: string) => s.render(text);
    overrides.heading5 = (text: string) => s.render(text);
    overrides.heading6 = (text: string) => s.render(text);
  }
  if (colors.bold) {
    const s = style({ color: color.hex(colors.bold), bold: true });
    overrides.bold = (text: string) => s.render(text);
  }
  if (colors.italic) {
    const s = style({ color: color.hex(colors.italic), italic: true });
    overrides.italic = (text: string) => s.render(text);
  }
  if (colors.code) {
    const s = style({ color: color.hex(colors.code) });
    overrides.code = (text: string) => s.render(text);
  }
  if (colors.link) {
    const s = style({ color: color.hex(colors.link), underline: true });
    overrides.link = (text: string, url: string) => s.render(text) + ' ' + style({ dim: true }).render(`(${url})`);
    overrides.linkText = (text: string) => s.render(text);
  }
  if (colors.quote) {
    const s = style({ color: color.hex(colors.quote) });
    overrides.blockquote = (text: string) =>
      text
        .split('\n')
        .map((line) => s.render('│ ' + line))
        .join('\n');
  }
  if (colors.list) {
    const s = style({ color: color.hex(colors.list) });
    overrides.listBullet = s.render('•');
  }

  return { ...base, ...overrides };
}
