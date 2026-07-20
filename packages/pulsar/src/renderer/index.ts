/**
 * Pulsar Markdown Renderer
 *
 * Renders parsed markdown tokens to styled terminal strings.
 * Supports ANSI-preserving word wrap, OSC 8 hyperlinks via nexus,
 * bidi/RTL text via rosetta, and all GFM extension tokens.
 */

import { hyperlink } from '@celestial/nexus';
import { detectDirection, reorderBidi, toBidiVisual, truncateText } from '@celestial/rosetta';
import { highlight } from '../highlight.js';
import { renderImage } from '../image-render.js';
import { createRenderContext, type RenderContext, withIndent } from '../internal/context.js';
import { markdownGlyph } from '../markdown-glyphs.js';
import { mathToUnicode } from '../math-unicode.js';
import { parseMarkdown } from '../parser/index.js';
import { defaultTheme } from '../theme.js';
import type { CodeBlockMeta, InlineToken, MarkdownTheme, RenderOptions, TableAlign, Token } from '../types.js';
import { extractAnsiCodes, stripAnsi } from './ansi.js';
import { visualWidth } from './width.js';
import { wrapText } from './wrap.js';

// ── Main Render Function ────────────────────────────────────────────────

/**
 * Render a markdown string to styled terminal output.
 */
export function renderMarkdown(input: string, options?: RenderOptions): string {
  const tokens = parseMarkdown(input);
  const theme = options?.theme ?? defaultTheme();
  const ctx = createRenderContext(theme, { ...options, theme, width: options?.width ?? 80, indent: options?.indent ?? 0 });

  const rendered = tokens.map((token, blockIndex) => renderTokenWithSearch(token, ctx, blockIndex));
  return rendered.join('\n\n');
}

function renderTokenWithSearch(token: Token, ctx: RenderContext, blockIndex: number): string {
  let rendered = renderToken(token, ctx);
  rendered = applySearchHighlights(rendered, token, ctx, blockIndex);
  rendered = applyScreenReaderHints(rendered, token, ctx);
  return rendered;
}

function applySearchHighlights(rendered: string, _token: Token, ctx: RenderContext, blockIndex: number): string {
  const highlights = ctx.options.searchHighlights;
  if (!highlights || highlights.length === 0) return rendered;

  const blockMatches = highlights.filter((m) => m.blockIndex === blockIndex);
  if (blockMatches.length === 0) return rendered;

  const currentMatch = highlights[ctx.options.currentMatchIndex ?? 0];
  const isCurrent = currentMatch?.blockIndex === blockIndex;

  const markStyle = ctx.theme.mark ?? ctx.theme.bold;
  const border = isCurrent ? `${ctx.theme.searchCurrentMarker ?? markdownGlyph('active-rail')} ` : '';

  return rendered
    .split('\n')
    .map((line) => border + markStyle(line))
    .join('\n');
}

/** Screen-reader structural hints (B11). */
function applyScreenReaderHints(rendered: string, token: Token, ctx: RenderContext): string {
  if (!ctx.options.screenReaderHints) return rendered;

  // Use DEC private mode sequences as structural markers. These are
  // non-displaying in most terminals but can be intercepted by screen
  // readers or accessibility tooling.
  const open = '\x1b[?2000h';
  const close = '\x1b[?2000l';

  switch (token.type) {
    case 'heading':
      return `${open}[heading level ${token.level}]${close}\n${rendered}`;
    case 'code-block':
      return `${open}[code block${token.language ? ` ${token.language}` : ''}]${close}\n${rendered}\n${open}[end code block]${close}`;
    case 'blockquote':
      return `${open}[blockquote]${close}\n${rendered}\n${open}[end blockquote]${close}`;
    case 'list':
      return `${open}[list]${close}\n${rendered}\n${open}[end list]${close}`;
    case 'table':
      return `${open}[table]${close}\n${rendered}\n${open}[end table]${close}`;
    default:
      return rendered;
  }
}

// ── Block Token Rendering ───────────────────────────────────────────────

/**
 * Render a single block token to a styled string.
 */
function renderToken(token: Token, ctx: RenderContext): string {
  const { theme, width, indent } = ctx;
  const prefix = ' '.repeat(indent);

  switch (token.type) {
    case 'heading': {
      const text = renderInline(token.content, ctx);
      const headingFn = getHeadingFn(theme, token.level);
      return prefix + headingFn(text);
    }

    case 'paragraph': {
      const text = renderInline(token.content, ctx);
      const processed = ctx.options.bidi ? applyBidi(text) : text;
      return wrapText(processed, width - indent, prefix);
    }

    case 'code-block': {
      return renderCodeBlock(token, ctx, prefix);
    }

    case 'blockquote': {
      const innerRendered = token.content.map((t) => renderToken(t, withIndent(ctx, 0))).join('\n\n');
      return theme
        .blockquote(innerRendered)
        .split('\n')
        .map((line) => prefix + line)
        .join('\n');
    }

    case 'list': {
      return renderList(token, ctx, prefix);
    }

    case 'hr':
      return prefix + theme.hr(width - indent);

    case 'table':
      return renderTable(token, ctx, prefix);

    case 'admonition':
      return renderAdmonition(token, ctx, prefix);

    case 'footnote-def':
      return renderFootnoteDef(token, ctx, prefix);

    case 'image':
      return prefix + renderImage(token, { theme, options: ctx.options, width: ctx.width });

    case 'definition-list':
      return renderDefinitionList(token, ctx, prefix);

    case 'math-block': {
      if (ctx.options.mathRendering === 'unicode') {
        const unicode = mathToUnicode(token.content);
        if (unicode !== null) {
          return prefix + (theme.mathBlock ? theme.mathBlock(unicode, width - indent) : unicode);
        }
      }
      return prefix + (theme.mathBlock ? theme.mathBlock(token.content, width - indent) : `[math] ${token.content}`);
    }

    case 'details':
      return renderDetails(token, ctx, prefix);

    case 'frontmatter':
      return '';

    case 'wiki-link-block': {
      const display = token.alias ?? token.target;
      return prefix + theme.link(display, token.target);
    }

    case 'live-exec':
      return renderCodeBlock({ type: 'code-block', language: token.language, content: token.source }, ctx, prefix);
  }
}

// ── Definition List Rendering ───────────────────────────────────────────

function renderDefinitionList(token: Extract<Token, { type: 'definition-list' }>, ctx: RenderContext, prefix: string): string {
  const { theme } = ctx;
  const lines: string[] = [];
  for (const item of token.items) {
    const term = renderInline(item.term, ctx);
    lines.push(prefix + (theme.definitionTerm ? theme.definitionTerm(term) : theme.bold(term)));
    for (const desc of item.descriptions) {
      const descText = renderInline(desc, ctx);
      lines.push(prefix + '    ' + (theme.definitionDescription ? theme.definitionDescription(descText) : descText));
    }
  }
  return lines.join('\n');
}

// ── Details Rendering ───────────────────────────────────────────────────

function renderDetails(token: Extract<Token, { type: 'details' }>, ctx: RenderContext, prefix: string): string {
  const { theme, indent } = ctx;
  const summary = renderInline(token.summary, ctx);
  // Pulsar (string mode) cannot toggle interactivity, so we render the
  // expanded form. The Genesis VNode renderer can consult expansion state
  // separately and emit a collapsed card. Keep `open: true` here so docs and
  // batch-rendered output show the body.
  const summaryLine = theme.detailsSummary ? theme.detailsSummary(summary, true) : `▾ ${theme.bold(summary)}`;
  const innerCtx = withIndent(ctx, indent + 2);
  const body = token.content.map((t) => renderToken(t, innerCtx)).join('\n\n');
  return prefix + summaryLine + (body.length > 0 ? '\n' + body : '');
}

// ── List Rendering ──────────────────────────────────────────────────────

function renderList(token: Extract<Token, { type: 'list' }>, ctx: RenderContext, prefix: string): string {
  const { theme, indent } = ctx;
  const lines: string[] = [];

  for (let i = 0; i < token.items.length; i++) {
    const item = token.items[i]!;

    // Determine bullet
    let bullet: string;
    if (item.checked !== undefined) {
      // GFM task list
      bullet = item.checked ? theme.taskChecked : theme.taskUnchecked;
    } else if (token.ordered) {
      bullet = theme.listNumber(i + 1);
    } else {
      bullet = theme.listBullet;
    }

    const text = renderInline(item.content, ctx);
    lines.push(prefix + bullet + ' ' + text);

    // Render nested children with increased indentation
    if (item.children && item.children.length > 0) {
      const childCtx = withIndent(ctx, indent + 4);
      const childRendered = item.children.map((child) => renderToken(child, childCtx)).join('\n');
      lines.push(childRendered);
    }
  }

  return lines.join('\n');
}

// ── Admonition Rendering ────────────────────────────────────────────────

function renderAdmonition(token: Extract<Token, { type: 'admonition' }>, ctx: RenderContext, prefix: string): string {
  const { theme } = ctx;
  const border = theme.admonitionBorder(token.kind);
  const title = theme.admonitionTitle(token.kind, token.title);

  const innerCtx = withIndent(ctx, 0);
  const contentLines =
    token.content.length > 0
      ? token.content
          .map((t) => renderToken(t, innerCtx))
          .join('\n\n')
          .split('\n')
      : [];

  const titleLine = prefix + border + ' ' + title;
  const bodyLines = contentLines.map((line) => prefix + border + '  ' + line);

  return [titleLine, ...bodyLines].join('\n');
}

// ── Footnote Rendering ──────────────────────────────────────────────────

function renderFootnoteDef(token: Extract<Token, { type: 'footnote-def' }>, ctx: RenderContext, prefix: string): string {
  const { theme } = ctx;
  const innerCtx = withIndent(ctx, 0);
  const label = theme.footnoteDef(token.label);
  const content = token.content.map((t) => renderToken(t, innerCtx)).join('\n\n');

  return prefix + label + ' ' + content;
}

// ── Table Rendering ─────────────────────────────────────────────────────

/**
 * Render a table token with alignment and borders. Honours per-column
 * GFM alignment from the separator row and shrinks columns proportionally
 * with `…` truncation when natural widths exceed the available width.
 */
function renderTable(token: Extract<Token, { type: 'table' }>, ctx: RenderContext, prefix: string): string {
  const { theme, width: ctxWidth, indent } = ctx;
  const budget = Math.max(1, ctxWidth - indent);

  interface RenderedCell {
    styled: string;
    plain: string;
    width: number;
  }
  const renderCell = (tokens: InlineToken[]): RenderedCell => {
    const styled = renderInline(tokens, ctx);
    const plain = stripAnsi(styled);
    return { styled, plain, width: visualWidth(plain) };
  };

  const headers = token.headers.map(renderCell);
  const rows = token.rows.map((row) => row.map(renderCell));

  const colCount = headers.length;
  if (colCount === 0) return prefix;

  // When separators alone would overflow, switch to a label/value layout.
  // This keeps every cell readable on narrow terminals instead of forcing a
  // mathematically impossible side-by-side table.
  const minimumTableWidth = colCount + Math.max(0, colCount - 1) * 3;
  if (minimumTableWidth > budget) {
    const bodyRows = rows.length > 0 ? rows : [headers];
    return bodyRows
      .flatMap((row) =>
        headers.map((header, column) => {
          const value = rows.length > 0 ? (row[column]?.plain ?? '') : header.plain;
          const label = rows.length > 0 ? header.plain : `Column ${column + 1}`;
          return prefix + theme.tableCell(truncateToWidth(`${label}: ${value}`, budget));
        }),
      )
      .join('\n');
  }

  const align: TableAlign[] = (token.align ?? []).slice(0, colCount);
  while (align.length < colCount) align.push('default');

  // 1. Compute natural widths (max of header + body).
  const naturalWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let maxWidth = headers[c]?.width ?? 0;
    for (const row of rows) {
      const cellWidth = row[c]?.width ?? 0;
      if (cellWidth > maxWidth) maxWidth = cellWidth;
    }
    naturalWidths.push(maxWidth);
  }

  // 2. Compute the width "overhead" — separators and outer spacing —
  // and shrink per-column widths if the natural total overflows budget.
  // Layout is: cells joined by ` │ ` so the inter-column overhead is 3
  // characters per gap (` `, theme.tableBorder, ` `).
  const interColumn = 3;
  const overhead = (colCount - 1) * interColumn;
  const naturalTotal = naturalWidths.reduce((a, b) => a + b, 0);
  const colWidths = naturalTotal + overhead <= budget ? naturalWidths : shrinkWidths(naturalWidths, Math.max(colCount, budget - overhead));

  const padCell = (cell: RenderedCell, colIndex: number): string => {
    const target = colWidths[colIndex] ?? 0;
    const a = align[colIndex] ?? 'default';
    if (cell.width === target) return cell.styled;
    if (cell.width > target) {
      // Truncate with ellipsis. Operate on the plain text (visual width) and
      // discard styling on the truncated suffix to keep the math correct.
      const truncated = truncateToWidth(cell.plain, target);
      return truncated;
    }
    const pad = target - cell.width;
    if (a === 'right') return ' '.repeat(pad) + cell.styled;
    if (a === 'center') {
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return ' '.repeat(left) + cell.styled + ' '.repeat(right);
    }
    return cell.styled + ' '.repeat(pad);
  };

  const headerCells = headers.map((cell, i) => theme.tableHeader(padCell(cell, i)));
  const separator = colWidths.map((w) => '─'.repeat(Math.max(1, w))).join('─┼─');

  const emptyCell: RenderedCell = { styled: '', plain: '', width: 0 };
  const renderedRows = rows.map((row) => {
    const cells = Array.from({ length: colCount }, (_, index) => theme.tableCell(padCell(row[index] ?? emptyCell, index)));
    return prefix + cells.join(' ' + theme.tableBorder + ' ');
  });

  return [prefix + headerCells.join(' ' + theme.tableBorder + ' '), prefix + separator, ...renderedRows].join('\n');
}

/**
 * Shrink a list of column widths so their sum fits in `budget`,
 * proportionally to natural size, with a minimum of one cell per column.
 */
function shrinkWidths(natural: number[], budget: number): number[] {
  const minPerCol = 1;
  const totalNatural = natural.reduce((a, b) => a + b, 0);
  if (totalNatural === 0) return natural.map(() => minPerCol);

  const widths = natural.map((w) => Math.max(minPerCol, Math.floor((w / totalNatural) * budget)));
  // Distribute leftover capacity to the widest natural columns.
  let used = widths.reduce((a, b) => a + b, 0);
  const order = natural.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
  let cursor = 0;
  while (used < budget && cursor < order.length * 2) {
    const idx = order[cursor % order.length]!.i;
    widths[idx] = (widths[idx] ?? 0) + 1;
    used += 1;
    cursor++;
  }
  return widths;
}

/**
 * Truncate a plain-text string to a visual width, replacing the tail
 * with `…`. Discards ANSI styling — by the time we truncate we no
 * longer have the styled positions, and the alternative (styled
 * truncation) needs grapheme-aware string slicing planned for #5.
 */
function truncateToWidth(plain: string, target: number): string {
  if (target <= 0) return '';
  const clipped = truncateText(plain, target);
  return clipped + ' '.repeat(Math.max(0, target - visualWidth(clipped)));
}

// ── Code Block Rendering ────────────────────────────────────────────────

const DIFF_ADD_PREFIX = '+';
const DIFF_DEL_PREFIX = '-';

/**
 * Render a fenced code block, honouring optional `CodeBlockMeta`:
 *   - `showLineNumbers` adds a left-side numeric gutter
 *   - `highlightLines` marks the listed lines with a vertical bar
 *   - `diff` colours `+`/`-` prefixed lines green/red
 *   - `copy` appends a `[copy]` affordance line at the bottom
 *
 * Soft-wrap is implemented by the surrounding `codeBlockFrame` only — long
 * lines without `wrap` will still overflow the frame width by design.
 */
function renderCodeBlock(token: Extract<Token, { type: 'code-block' }>, ctx: RenderContext, prefix: string): string {
  const { theme, width, indent, options } = ctx;
  const availableWidth = Math.max(1, width - indent);

  const fenceRenderer = token.language ? options.fenceRenderers?.[token.language] : undefined;
  if (typeof fenceRenderer === 'function') {
    try {
      const custom = fenceRenderer(token, { theme: ctx.theme, options: ctx.options, width: Math.max(1, ctx.width - ctx.indent), indent: ctx.indent });
      if (typeof custom === 'string') {
        return custom
          .split('\n')
          .map((line) => prefix + line)
          .join('\n');
      }
    } catch {
      // A host renderer is an optional enhancement. Fall through to the
      // built-in code path so one plugin cannot blank the whole document.
    }
  }

  const meta: CodeBlockMeta | undefined = token.meta;
  const highlightTheme = options.highlightTheme;
  const highlighted = token.language ? highlight(token.content, token.language, highlightTheme as Parameters<typeof highlight>[2]) : token.content;

  const rawLines = token.content.split('\n');
  const styledLines = highlighted.split('\n');
  const lineCount = Math.max(rawLines.length, styledLines.length);

  const showNumbers = meta?.showLineNumbers === true;
  const requestedStartLine = meta?.startLine;
  const startLine = Number.isSafeInteger(requestedStartLine) ? Math.max(1, Math.min(1_000_000_000, requestedStartLine!)) : 1;
  const highlightSet = new Set((meta?.highlightLines ?? []).filter((line) => Number.isSafeInteger(line) && line > 0).slice(0, 100_000));
  const diffMode = meta?.diff === true || token.language === 'diff';
  const shouldWrap = meta?.wrap === true || meta?.wrap === 'soft' || meta?.wraps === 'soft' || meta?.wraps === 'wrap';

  // Compute gutter width for line numbers if needed.
  const lastLineNumber = startLine + lineCount - 1;
  const gutterWidth = showNumbers ? String(lastLineNumber).length : 0;

  // Determine fold threshold
  let foldThreshold = 25;
  if (meta?.fold === false) foldThreshold = Infinity;
  else if (typeof meta?.fold === 'number' && Number.isFinite(meta.fold)) foldThreshold = Math.max(2, Math.min(1_000_000, Math.floor(meta.fold)));

  let folded = false;
  let visibleCount = lineCount;
  if (lineCount > foldThreshold) {
    folded = true;
    visibleCount = foldThreshold - 1;
  }

  const out: string[] = [];
  for (let i = 0; i < visibleCount; i++) {
    const styled = styledLines[i] ?? '';
    const raw = rawLines[i] ?? '';
    const lineNo = startLine + i;
    const isHighlighted = highlightSet.has(lineNo);

    let body = styled;
    if (diffMode) {
      const trimmed = raw.trimStart();
      if (trimmed.startsWith(DIFF_ADD_PREFIX)) {
        body = colorise(body, 'add', theme);
      } else if (trimmed.startsWith(DIFF_DEL_PREFIX)) {
        body = colorise(body, 'del', theme);
      }
    }

    let gutter = '';
    if (showNumbers) {
      gutter = String(lineNo).padStart(gutterWidth, ' ') + ' │ ';
    }

    const marker = isHighlighted ? `${theme.codeHighlightMarker ?? markdownGlyph('active-rail')} ` : showNumbers ? '' : '  ';
    const leading = marker + gutter;
    if (shouldWrap && visualWidth(leading + body) > availableWidth) {
      const bodyWidth = Math.max(1, availableWidth - visualWidth(leading));
      const wrappedBody = wrapText(body, bodyWidth, '').split('\n');
      out.push(leading + (wrappedBody[0] ?? ''));
      const continuation = ' '.repeat(visualWidth(leading));
      for (const wrappedLine of wrappedBody.slice(1)) out.push(continuation + wrappedLine);
    } else {
      out.push(leading + body);
    }
  }

  if (folded) {
    const hidden = lineCount - visibleCount;
    const marker = showNumbers ? '' : '  ';
    out.push(marker + `+${hidden} lines (click to expand)`);
  }

  if (meta?.copy === true) {
    const label = '[copy]';
    out.push('  ' + theme.code(label));
  }

  const styled = theme.codeBlock(out.join('\n'));
  return theme
    .codeBlockFrame(styled, token.language, availableWidth)
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function colorise(text: string, kind: 'add' | 'del', theme: MarkdownTheme): string {
  return kind === 'add' ? (theme.diffAdded?.(text) ?? theme.code(text)) : (theme.diffRemoved?.(text) ?? theme.code(text));
}

// ── Heading Helper ──────────────────────────────────────────────────────

function getHeadingFn(theme: MarkdownTheme, level: 1 | 2 | 3 | 4 | 5 | 6): (text: string) => string {
  switch (level) {
    case 1:
      return theme.heading1;
    case 2:
      return theme.heading2;
    case 3:
      return theme.heading3;
    case 4:
      return theme.heading4;
    case 5:
      return theme.heading5;
    case 6:
      return theme.heading6;
  }
}

// ── Inline Rendering ────────────────────────────────────────────────────

function renderInline(tokens: InlineToken[], ctx: RenderContext): string {
  return tokens.map((token) => renderInlineToken(token, ctx)).join('');
}

function renderInlineToken(token: InlineToken, ctx: RenderContext): string {
  const { theme, options } = ctx;
  switch (token.type) {
    case 'text':
      return token.content;
    case 'bold':
      return theme.bold(renderInline(token.content, ctx));
    case 'italic':
      return theme.italic(renderInline(token.content, ctx));
    case 'code':
      return theme.code(token.content);
    case 'link': {
      if (options.hyperlinks) {
        const inner = theme.linkText?.(token.text) ?? token.text;
        return hyperlink(inner, token.url, { fallback: true });
      }
      return theme.link(token.text, token.url);
    }
    case 'strikethrough':
      return theme.strikethrough(renderInline(token.content, ctx));
    case 'footnote-ref':
      return theme.footnoteRef(token.label);
    case 'emoji':
      return theme.emoji(token.name, token.unicode);
    case 'mark': {
      const inner = renderInline(token.content, ctx);
      // `mark` is optional on the theme so older custom themes keep working;
      // fall back to bold so the highlight is at least visually distinct.
      return theme.mark ? theme.mark(inner) : theme.bold(inner);
    }
    case 'sup': {
      const inner = renderInline(token.content, ctx);
      return theme.sup ? theme.sup(inner) : `^{${inner}}`;
    }
    case 'sub': {
      const inner = renderInline(token.content, ctx);
      return theme.sub ? theme.sub(inner) : `_{${inner}}`;
    }
    case 'math-inline': {
      if (options.mathRendering === 'unicode') {
        const unicode = mathToUnicode(token.content);
        if (unicode !== null) {
          return theme.mathInline ? theme.mathInline(unicode) : unicode;
        }
      }
      return theme.mathInline ? theme.mathInline(token.content) : `$${token.content}$`;
    }
    case 'wiki-link':
      return theme.link(token.alias ?? token.target, token.target);
    case 'image-inline':
      return renderImage(token, { theme, options, width: ctx.width - ctx.indent });
    case 'hard-break':
      return '\n';
  }
}

// ── Bidi Support ────────────────────────────────────────────────────────

/**
 * Apply visual bidi reordering while preserving SGR / OSC 8 ANSI control
 * codes. Strategy:
 *   1. Strip ANSI codes, recording their logical positions.
 *   2. Run `reorderBidi` to get visual-order runs over the plain text.
 *   3. For each visual run, re-insert any control codes whose logical
 *      position falls within the run, mapping LTR runs preserved-order
 *      and RTL runs to mirrored offsets so paired open/close codes still
 *      bracket the same visual chunk.
 *
 * If the text has no ANSI codes the algorithm reduces to `toBidiVisual`.
 * If detected direction is LTR, no reordering is applied.
 */
function applyBidi(text: string): string {
  const { plain, spans } = extractAnsiCodes(text);
  const direction = detectDirection(plain);
  if (direction === 'ltr') return text;
  if (spans.length === 0) return toBidiVisual(plain);

  const runs = reorderBidi(plain);
  let out = '';
  for (const run of runs) {
    const isRtl = run.level % 2 === 1;
    // BidiRun.start/end are inclusive logical positions; for RTL runs
    // they come back reversed (end < start) so we normalise both ends.
    const runLo = Math.min(run.start, run.end);
    const runHi = Math.max(run.start, run.end);
    const runSpans = spans
      .filter((s) => s.index >= runLo && s.index <= runHi + 1)
      .map((s) => ({
        ...s,
        // For LTR runs: keep the in-stream offset.
        // For RTL runs: SGR semantics flip — codes that opened a span at
        // logical L should now close (and vice versa), so we mirror the
        // offset around the run's visual length. This isn't perfect for
        // standalone (non-paired) codes but is a strict improvement
        // over the legacy "drop everything" behaviour.
        offset: isRtl ? runHi - s.index + 1 : s.index - runLo,
      }))
      .sort((a, b) => a.offset - b.offset);

    let runOut = '';
    let cursor = 0;
    for (const span of runSpans) {
      const clamped = Math.max(0, Math.min(run.text.length, span.offset));
      runOut += run.text.slice(cursor, clamped) + span.code;
      cursor = clamped;
    }
    runOut += run.text.slice(cursor);
    out += runOut;
  }
  return out;
}

// ── Re-exports for backwards compat ─────────────────────────────────────

export { injectAnsiCodes } from './ansi.js';
