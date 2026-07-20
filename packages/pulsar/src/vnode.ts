/**
 * Pulsar VNode Component
 *
 * Renders markdown content as a nebula VNode tree for use within
 * Elm-architecture TUI applications. Provides the `markdown()` function
 * that returns a VNode representing the rendered markdown.
 *
 * Interactive elements (links, footnote refs, task-list checkboxes) are
 * emitted as their own text VNodes carrying:
 *   - `href` — drives nebula's OSC 8 hyperlink wrapping
 *   - `data` — a discriminated tag the consumer can read to register
 *     hitmap regions and dispatch `onLink`/`onFootnote`/`onTaskToggle`.
 *
 * Pulsar itself does NOT register click handlers — the wrapping app does.
 * This keeps the package free of a hard runtime dependency on nebula's
 * mouse/focus subsystem while still exposing the structural information a
 * consumer needs to make markdown content interactive.
 */

import { highlight } from './highlight.js';
import { renderImage } from './image-render.js';
import { mathToUnicode } from './math-unicode.js';
import { parseMarkdown } from './parser/index.js';
import { defaultTheme } from './theme.js';
import type { CodeBlockMeta, InlineToken, RenderOptions, Token } from './types.js';

interface StyleAttrs {
  dim?: boolean;
}

/**
 * Discriminated payload for consumer-driven interactivity. Pulsar tags
 * link, footnote-ref and task-toggle VNodes with this so apps can match
 * mouse/keyboard events without re-parsing the markdown source.
 */
export type PulsarNodeData =
  | { kind: 'link'; url: string; text: string }
  | { kind: 'footnote-ref'; label: string }
  | { kind: 'task-toggle'; itemIndex: number; checked: boolean }
  | { kind: 'copy'; code: string; language: string }
  | { kind: 'hover-link'; url: string; text: string }
  | { kind: 'fold-toggle'; code: string; language: string };

interface TextNode {
  kind: 'text';
  content: string;
  style?: StyleAttrs;
  wrap?: boolean;
  href?: string;
  /** Pulsar-specific interactivity tag — nebula ignores extra fields. */
  data?: PulsarNodeData;
}

interface BoxNode {
  kind: 'box';
  children: VNode[];
  style?: StyleAttrs;
}

interface RowNode {
  kind: 'row';
  children: VNode[];
}

interface ColumnNode {
  kind: 'column';
  children: VNode[];
}

export type VNode = TextNode | BoxNode | RowNode | ColumnNode;

function text(content: string, options?: { style?: StyleAttrs; wrap?: boolean; href?: string; data?: PulsarNodeData }): TextNode {
  return {
    kind: 'text',
    content,
    ...(options?.style && { style: options.style }),
    ...(options?.wrap !== undefined && { wrap: options.wrap }),
    ...(options?.href && { href: options.href }),
    ...(options?.data && { data: options.data }),
  };
}

function row(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function column(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function box(child: VNode, options?: { style?: StyleAttrs }): BoxNode {
  return { kind: 'box', children: [child], ...(options?.style && { style: options.style }) };
}

// ── Main VNode Component ────────────────────────────────────────────────

/**
 * Render markdown content as a nebula VNode tree.
 */
export function markdown(input: string, options?: RenderOptions): VNode {
  if (!input.trim()) return text('');

  const tokens = parseMarkdown(input);
  const children = tokens.map((token, blockIndex) => tokenToVNodeWithSearch(token, options, blockIndex));

  return column(...children);
}

function tokenToVNodeWithSearch(token: Token, options: RenderOptions | undefined, blockIndex: number): VNode {
  const vnode = tokenToVNode(token, options);
  const highlights = options?.searchHighlights;
  if (!highlights || highlights.length === 0) return vnode;

  const blockMatches = highlights.filter((m) => m.blockIndex === blockIndex);
  if (blockMatches.length === 0) return vnode;

  const currentMatch = highlights[options?.currentMatchIndex ?? 0];
  const isCurrent = currentMatch?.blockIndex === blockIndex;

  if (isCurrent) {
    return row(text('▎ '), vnode);
  }
  return vnode;
}

// ── Token to VNode Conversion ───────────────────────────────────────────

function tokenToVNode(token: Token, options?: RenderOptions): VNode {
  const theme = options?.theme ?? defaultTheme();

  switch (token.type) {
    case 'heading':
      return renderHeadingVNode(token, theme, options);

    case 'paragraph':
      return renderParagraphVNode(token, theme, options);

    case 'code-block':
      return renderCodeBlockVNode(token, theme, options);

    case 'blockquote':
      return renderBlockquoteVNode(token, theme, options);

    case 'list':
      return renderListVNode(token, theme, options);

    case 'hr':
      return text(theme.hr(options?.width ?? 80), { style: { dim: true } });

    case 'table':
      return renderTableVNode(token, theme, options);

    case 'admonition':
      return renderAdmonitionVNode(token, theme, options);

    case 'footnote-def':
      return renderFootnoteDefVNode(token, theme, options);

    case 'image':
      return text(renderImage(token, { theme, options: options ?? {}, width: options?.width ?? 80 }));

    case 'definition-list': {
      const lines: string[] = [];
      for (const item of token.items) {
        const term = inlineToString(item.term, theme, options);
        lines.push(theme.definitionTerm ? theme.definitionTerm(term) : theme.bold(term));
        for (const desc of item.descriptions) {
          const descText = inlineToString(desc, theme, options);
          lines.push('    ' + (theme.definitionDescription ? theme.definitionDescription(descText) : descText));
        }
      }
      return column(...lines.map((l) => text(l)));
    }

    case 'math-block': {
      let content = token.content;
      if (options?.mathRendering === 'unicode') {
        const unicode = mathToUnicode(content);
        if (unicode !== null) content = unicode;
      }
      return text(theme.mathBlock ? theme.mathBlock(content, options?.width) : `[math] ${content}`);
    }

    case 'details': {
      const summary = inlineToString(token.summary, theme, options);
      const summaryLine = theme.detailsSummary ? theme.detailsSummary(summary, true) : `▾ ${theme.bold(summary)}`;
      const body = token.content.map((child) => tokenToVNode(child, options));
      return column(text(summaryLine), ...body);
    }

    case 'frontmatter':
      return text('');

    case 'wiki-link-block': {
      const display = token.alias ?? token.target;
      return text(theme.link(display, token.target), {
        data: { kind: 'link', url: token.target, text: display },
      });
    }

    case 'live-exec':
      return renderCodeBlockVNode({ type: 'code-block', language: token.language, content: token.source }, theme, options);
  }
}

// ── Heading VNode ───────────────────────────────────────────────────────

function renderHeadingVNode(token: Extract<Token, { type: 'heading' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  // Headings rarely contain interactive elements; if they do (an embedded
  // link), emit a row of segments. Otherwise stay as a single text node so
  // the heading style applies to the whole line.
  const headingFn = getHeadingFn(theme, token.level);
  if (containsInteractive(token.content)) {
    const segments = inlineToVNodes(token.content, theme, options, { headingStyle: headingFn });
    return row(...segments);
  }
  const inlineText = inlineToString(token.content, theme);
  return text(headingFn(inlineText));
}

// ── Paragraph VNode ─────────────────────────────────────────────────────

function renderParagraphVNode(token: Extract<Token, { type: 'paragraph' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  if (containsInteractive(token.content)) {
    const segments = inlineToVNodes(token.content, theme, options);
    return row(...segments);
  }
  const content = inlineToString(token.content, theme, options);
  return text(content, { wrap: true });
}

// ── Code Block VNode ────────────────────────────────────────────────────

function renderCodeBlockVNode(token: Extract<Token, { type: 'code-block' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  const meta: CodeBlockMeta | undefined = token.meta;
  const highlighted = token.language ? highlight(token.content, token.language, options?.highlightTheme as Parameters<typeof highlight>[2]) : token.content;

  const showNumbers = meta?.showLineNumbers === true;
  const startLine = meta?.startLine ?? 1;
  const highlightSet = new Set(meta?.highlightLines ?? []);
  const diffMode = meta?.diff === true || token.language === 'diff';
  const wantsCopy = meta?.copy === true;

  const rawLines = token.content.split('\n');
  const styledLines = highlighted.split('\n');
  const lineCount = Math.max(rawLines.length, styledLines.length);
  const lastLineNumber = startLine + lineCount - 1;
  const gutterWidth = showNumbers ? String(lastLineNumber).length : 0;

  // Plain code blocks (no meta) keep the existing single-text-node shape so
  // back-compat with overlay-based renderers and existing snapshots holds.
  const isPlain = !meta || (!showNumbers && highlightSet.size === 0 && !diffMode && !wantsCopy && meta.fold === undefined);
  if (isPlain) {
    const body = styledLines.map((line) => '  ' + line).join('\n');
    const styled = theme.codeBlock(body);
    const framed = theme.codeBlockFrame(styled, token.language, options?.width);
    return text(framed);
  }

  // Determine fold threshold
  let foldThreshold = 25;
  if (meta?.fold === false) foldThreshold = Infinity;
  else if (typeof meta?.fold === 'number') foldThreshold = meta.fold;

  let folded = false;
  let visibleCount = lineCount;
  if (lineCount > foldThreshold) {
    folded = true;
    visibleCount = foldThreshold - 1;
  }

  const lineNodes: VNode[] = [];
  for (let i = 0; i < visibleCount; i++) {
    const styled = styledLines[i] ?? '';
    const raw = rawLines[i] ?? '';
    const lineNo = startLine + i;
    const isHighlighted = highlightSet.has(lineNo);

    let body = styled;
    if (diffMode) {
      const trimmed = raw.trimStart();
      if (trimmed.startsWith('+')) body = '\x1b[32m' + body + '\x1b[0m';
      else if (trimmed.startsWith('-')) body = '\x1b[31m' + body + '\x1b[0m';
    }

    const marker = isHighlighted ? '▎ ' : showNumbers ? '' : '  ';
    const gutter = showNumbers ? String(lineNo).padStart(gutterWidth, ' ') + ' │ ' : '';
    lineNodes.push(text(marker + gutter + body));
  }

  if (folded) {
    const hidden = lineCount - visibleCount;
    const marker = showNumbers ? '' : '  ';
    lineNodes.push(
      text(marker + `+${hidden} lines (click to expand)`, {
        data: { kind: 'fold-toggle', code: token.content, language: token.language },
      }),
    );
  }

  if (wantsCopy) {
    lineNodes.push(
      text(theme.code('  [copy]'), {
        data: { kind: 'copy', code: token.content, language: token.language },
      }),
    );
  }

  // Wrap content in a column so the frame is preserved as a header/footer
  // pair around the line nodes.
  const frameTop = text(theme.codeBlockFrame('', token.language, options?.width).split('\n')[0] ?? '');
  const frameBottom = text(theme.codeBlockFrame('', token.language, options?.width).split('\n').pop() ?? '');
  return column(frameTop, ...lineNodes, frameBottom);
}

// ── Blockquote VNode ────────────────────────────────────────────────────

function renderBlockquoteVNode(token: Extract<Token, { type: 'blockquote' }>, _theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  const children = token.content.map((t) => tokenToVNode(t, options));
  const inner = column(...children);
  return box(inner, { style: { dim: true } });
}

// ── List VNode ──────────────────────────────────────────────────────────

function renderListVNode(token: Extract<Token, { type: 'list' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  const items = token.items.map((item, i) => {
    if (item.checked !== undefined) {
      // Task-list item: split checkbox into a separately-tagged text node
      // so consumers can hitmap-toggle it independently of the label.
      const checkboxGlyph = item.checked ? theme.taskChecked : theme.taskUnchecked;
      const checkboxNode = text(checkboxGlyph, {
        data: { kind: 'task-toggle', itemIndex: i, checked: item.checked },
      });

      const labelText = inlineToString(item.content, theme, options);
      const interactiveLabel = containsInteractive(item.content);
      const labelNode = interactiveLabel ? row(...inlineToVNodes(item.content, theme, options)) : text(' ' + labelText);

      // Plain task with no inline interactivity → a single row(checkbox, ' label').
      // Task with embedded link/footnote → row(checkbox, text(' '), …segments).
      const lineNode = interactiveLabel ? row(checkboxNode, text(' '), labelNode) : row(checkboxNode, labelNode);

      if (item.children && item.children.length > 0) {
        const childVNodes = item.children.map((child) => tokenToVNode(child, options));
        return column(lineNode, ...childVNodes);
      }
      return lineNode;
    }

    const bullet = token.ordered ? theme.listNumber(i + 1) : theme.listBullet;

    if (containsInteractive(item.content)) {
      const segments = inlineToVNodes(item.content, theme, options);
      const lineNode = row(text(bullet + ' '), ...segments);
      if (item.children && item.children.length > 0) {
        const childVNodes = item.children.map((child) => tokenToVNode(child, options));
        return column(lineNode, ...childVNodes);
      }
      return lineNode;
    }

    const itemText = inlineToString(item.content, theme, options);
    const itemLine = text(bullet + ' ' + itemText);

    if (item.children && item.children.length > 0) {
      const childVNodes = item.children.map((child) => tokenToVNode(child, options));
      return column(itemLine, ...childVNodes);
    }

    return itemLine;
  });

  return column(...items);
}

// ── Table VNode ─────────────────────────────────────────────────────────

function renderTableVNode(token: Extract<Token, { type: 'table' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  // Render header row
  const headerCells = token.headers.map((h) => {
    const cellText = inlineToString(h, theme, options);
    return text(theme.tableHeader(cellText));
  });
  const headerRow = row(...headerCells);

  // Render body rows
  const bodyRows = token.rows.map((r) => {
    const cells = r.map((cell) => {
      const cellText = inlineToString(cell, theme, options);
      return text(theme.tableCell(cellText));
    });
    return row(...cells);
  });

  return column(headerRow, ...bodyRows);
}

// ── Admonition VNode ────────────────────────────────────────────────────

function renderAdmonitionVNode(token: Extract<Token, { type: 'admonition' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  const title = text(theme.admonitionTitle(token.kind, token.title));
  const children = token.content.map((t) => tokenToVNode(t, options));

  return column(title, ...children);
}

// ── Footnote Def VNode ──────────────────────────────────────────────────

function renderFootnoteDefVNode(token: Extract<Token, { type: 'footnote-def' }>, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): VNode {
  const label = text(theme.footnoteDef(token.label));
  const children = token.content.map((t) => tokenToVNode(t, options));

  return row(label, column(...children));
}

// ── Inline Helpers ──────────────────────────────────────────────────────

function getHeadingFn(theme: ReturnType<typeof defaultTheme>, level: 1 | 2 | 3 | 4 | 5 | 6): (text: string) => string {
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

/**
 * Walk the inline token list. Returns true if any link / footnote-ref
 * appears at any depth — those are the elements that benefit from being
 * isolated into their own VNode for hit-testing.
 */
function containsInteractive(tokens: InlineToken[]): boolean {
  for (const token of tokens) {
    switch (token.type) {
      case 'link':
      case 'footnote-ref':
        return true;
      case 'bold':
      case 'italic':
      case 'strikethrough':
      case 'mark':
      case 'sup':
      case 'sub':
        if (containsInteractive(token.content)) return true;
        break;
    }
  }
  return false;
}

/**
 * Convert an inline-token list to a sequence of VNodes, splitting at
 * interactive boundaries. Adjacent non-interactive tokens are coalesced
 * into a single styled text node.
 *
 * The optional `headingStyle` wraps each emitted segment with the
 * heading's style fn so a heading containing a link still renders the
 * link with both heading typography and link styling.
 */
function inlineToVNodes(
  tokens: InlineToken[],
  theme: ReturnType<typeof defaultTheme>,
  options?: RenderOptions,
  ctx?: { headingStyle?: (text: string) => string },
): VNode[] {
  const out: VNode[] = [];
  let buffer = '';

  const flushBuffer = (): void => {
    if (buffer.length === 0) return;
    const styled = ctx?.headingStyle ? ctx.headingStyle(buffer) : buffer;
    out.push(text(styled));
    buffer = '';
  };

  for (const token of tokens) {
    if (token.type === 'link') {
      flushBuffer();
      const linkText = inlineTokenToString({ type: 'text', content: token.text }, theme, options);
      const styled = options?.hyperlinks ? (theme.linkText?.(linkText) ?? linkText) : theme.link(token.text, token.url);
      const wrapped = ctx?.headingStyle ? ctx.headingStyle(styled) : styled;
      out.push(
        text(wrapped, {
          ...(options?.hyperlinks ? { href: token.url } : {}),
          data: { kind: 'link', url: token.url, text: token.text },
        }),
      );
      continue;
    }
    if (token.type === 'footnote-ref') {
      flushBuffer();
      const styled = theme.footnoteRef(token.label);
      const wrapped = ctx?.headingStyle ? ctx.headingStyle(styled) : styled;
      out.push(
        text(wrapped, {
          data: { kind: 'footnote-ref', label: token.label },
        }),
      );
      continue;
    }
    // Non-interactive token: append its rendered string to the buffer.
    buffer += inlineTokenToString(token, theme, options);
  }
  flushBuffer();
  return out;
}

/**
 * Convert inline tokens to a plain styled string (for use within VNodes).
 */
function inlineToString(tokens: InlineToken[], theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): string {
  return tokens.map((token) => inlineTokenToString(token, theme, options)).join('');
}

function inlineTokenToString(token: InlineToken, theme: ReturnType<typeof defaultTheme>, options?: RenderOptions): string {
  switch (token.type) {
    case 'text':
      return token.content;
    case 'bold':
      return theme.bold(inlineToString(token.content, theme, options));
    case 'italic':
      return theme.italic(inlineToString(token.content, theme, options));
    case 'code':
      return theme.code(token.content);
    case 'link':
      return theme.link(token.text, token.url);
    case 'strikethrough':
      return theme.strikethrough(inlineToString(token.content, theme, options));
    case 'footnote-ref':
      return theme.footnoteRef(token.label);
    case 'emoji':
      return theme.emoji(token.name, token.unicode);
    case 'mark': {
      const inner = inlineToString(token.content, theme, options);
      return theme.mark ? theme.mark(inner) : theme.bold(inner);
    }
    case 'sup': {
      const inner = inlineToString(token.content, theme, options);
      return theme.sup ? theme.sup(inner) : `^{${inner}}`;
    }
    case 'sub': {
      const inner = inlineToString(token.content, theme, options);
      return theme.sub ? theme.sub(inner) : `_{${inner}}`;
    }
    case 'math-inline': {
      if (options?.mathRendering === 'unicode') {
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
      return theme.imagePlaceholder(token.alt, token.url);
    case 'hard-break':
      return '\n';
  }
}
