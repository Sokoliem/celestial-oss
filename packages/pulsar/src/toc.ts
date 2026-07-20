/**
 * Table-of-contents extraction and rendering for pulsar markdown.
 *
 * `extractToc(input)` walks every heading in the document (including
 * nested ones inside blockquotes, lists, admonitions, footnotes) and
 * returns a flat list with the heading's level, plain-text label and the
 * `id` slug `parseMarkdown` already assigned.
 *
 * `toc(input, options?)` builds a small VNode column ready to drop into
 * a nebula component. Each entry is a link-tagged text node — consumers
 * register a `Sub.mouse` matcher against `data.kind === 'link'` and call
 * their own scroll-to-anchor logic when the URL starts with `#`.
 */

import { inlineToPlainText, slugify } from './parser/anchors.js';
import { parseMarkdown } from './parser/index.js';
import { defaultTheme } from './theme.js';
import type { Token } from './types.js';
import type { PulsarNodeData } from './vnode.js';

export interface TocEntry {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly slug: string;
}

/**
 * Extract a flat table of contents from a markdown source. Slugs match
 * the `id` values `parseMarkdown` writes onto heading tokens.
 */
export function extractToc(input: string): TocEntry[] {
  const tokens = parseMarkdown(input);
  const out: TocEntry[] = [];
  collectHeadings(tokens, out);
  return out;
}

function collectHeadings(tokens: Token[], out: TocEntry[]): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const text = inlineToPlainText(token.content);
        out.push({
          level: token.level,
          text,
          slug: token.id ?? slugify(text),
        });
        break;
      }
      case 'blockquote':
      case 'admonition':
      case 'footnote-def':
      case 'details':
        collectHeadings(token.content, out);
        break;
      case 'list':
        for (const item of token.items) {
          if (item.children) collectHeadings(item.children, out);
        }
        break;
      default:
        break;
    }
  }
}

// ── VNode rendering ─────────────────────────────────────────────────────

interface TextVNode {
  kind: 'text';
  content: string;
  href?: string;
  data?: PulsarNodeData;
}

interface ColumnVNode {
  kind: 'column';
  children: TextVNode[];
}

export interface TocOptions {
  /** Heading level cap. Entries deeper than this are dropped. Default 6. */
  readonly maxLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Heading level floor. Entries shallower than this are dropped. Default 1. */
  readonly minLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Anchor-link prefix, e.g. `'#'` for in-page anchors (default) or a base URL. */
  readonly anchorPrefix?: string;
  /** Override the heading-style fns used for indented prefix glyphs. */
  readonly indentGlyph?: (level: number) => string;
}

/**
 * Build a TOC VNode column from a markdown source. Each entry is a
 * link-tagged text node carrying `data.kind === 'link'` so consumers
 * dispatch the same way they handle inline document links.
 */
export function toc(input: string, options?: TocOptions): ColumnVNode {
  const entries = extractToc(input);
  const min = Number.isSafeInteger(options?.minLevel) ? Math.max(1, Math.min(6, options!.minLevel!)) : 1;
  const max = Number.isSafeInteger(options?.maxLevel) ? Math.max(min, Math.min(6, options!.maxLevel!)) : 6;
  const prefix = options?.anchorPrefix ?? '#';
  const theme = defaultTheme();
  const glyph = options?.indentGlyph ?? ((level: number) => '  '.repeat(Math.max(0, level - 1)) + theme.listBullet + ' ');

  const filtered = entries.filter((e) => e.level >= min && e.level <= max);
  const linkStyle = theme.linkText ?? ((t: string) => t);

  const children: TextVNode[] = filtered.map((entry) => {
    const url = `${prefix}${entry.slug}`;
    return {
      kind: 'text',
      content: safeGlyph(glyph, entry.level - min + 1) + linkStyle(entry.text),
      href: url,
      data: { kind: 'link', url, text: entry.text },
    };
  });

  return { kind: 'column', children };
}

function safeGlyph(glyph: (level: number) => string, level: number): string {
  try {
    const value = glyph(level);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

// Re-export the slug helper so consumers can derive matching slugs for
// anchor-jump implementations without parsing twice.
export { slugify };
