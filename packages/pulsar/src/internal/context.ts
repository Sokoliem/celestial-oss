/**
 * Internal context objects for the parser and renderer.
 *
 * Both pipelines historically threaded multiple positional arguments through
 * deep call stacks (parser: `refs`; renderer: `theme`, `options`, `width`,
 * `indent`). These contexts carry that state in a single bag so future
 * enhancements — diagnostics, anchor maps, per-call emoji overrides,
 * code-block meta, table alignment — can extend the contract without
 * disturbing call sites.
 */

import type { LinkRef } from '../parser/refs.js';
import type { MarkdownTheme, RenderOptions } from '../types.js';

// ── Parser ──────────────────────────────────────────────────────────────

export interface ParseDiagnostic {
  /** Stable kind identifier; consumers can switch on this. */
  readonly kind: 'unclosed-fence' | 'unknown-admonition' | 'malformed-table' | 'unresolved-ref' | 'bad-image';
  readonly message: string;
  /** 1-based source line number where the issue was detected. */
  readonly line?: number;
}

export interface ParserContext {
  readonly refs: Map<string, LinkRef>;
  readonly diagnostics: ParseDiagnostic[];
  /**
   * Optional per-call emoji shortcode overrides. When set, the inline
   * parser checks this map before falling back to the global registry.
   * (Wired by future enhancement #9; currently unused.)
   */
  readonly emojiOverrides?: Record<string, string>;
}

export function createParserContext(refs?: Map<string, LinkRef>): ParserContext {
  return {
    refs: refs ?? new Map(),
    diagnostics: [],
  };
}

// ── Renderer ────────────────────────────────────────────────────────────

export interface RenderContext {
  readonly theme: MarkdownTheme;
  readonly options: RenderOptions;
  readonly width: number;
  readonly indent: number;
}

const MAX_RENDER_DIMENSION = 1_000_000;

function normalizeDimension(value: number | undefined, fallback: number, minimum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_RENDER_DIMENSION, Math.max(minimum, Math.floor(value)));
}

/**
 * Build a render context from the public RenderOptions shape. Defaults
 * width=80 and indent=0 to match the existing renderMarkdown contract.
 */
export function createRenderContext(theme: MarkdownTheme, options: RenderOptions): RenderContext {
  const width = normalizeDimension(options.width, 80, 1);
  const indent = Math.min(width - 1, normalizeDimension(options.indent, 0, 0));
  return {
    theme,
    options: { ...options, width, indent },
    width,
    indent,
  };
}

/**
 * Return a child context with a different indent. Used when a block
 * (blockquote, list, admonition, footnote) renders nested content at an
 * indentation distinct from its own.
 */
export function withIndent(ctx: RenderContext, indent: number): RenderContext {
  const normalized = Math.min(ctx.width - 1, normalizeDimension(indent, ctx.indent, 0));
  return { ...ctx, options: { ...ctx.options, indent: normalized }, indent: normalized };
}
