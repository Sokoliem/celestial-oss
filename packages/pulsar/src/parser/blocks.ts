/**
 * Pulsar Block Parser
 *
 * Line-by-line dispatcher that consumes a markdown source and produces a
 * `Token[]` AST. Inline content within each block is parsed by
 * {@link parseInline}; reference-link definitions are extracted in a first
 * pass via {@link extractLinkRefs}.
 */

import { extractFrontmatter } from '../frontmatter.js';
import type { AdmonitionKind, InlineToken, ListItem, Token } from '../types.js';
import { assignHeadingAnchors, Slugger } from './anchors.js';
import { parseCodeBlockInfoString } from './codeblock-meta.js';
import { parseInline } from './inline.js';
import { extractLinkRefs, type LinkRef } from './refs.js';

// ── Admonition Kind Detection ───────────────────────────────────────────

const ADMONITION_KINDS = new Set<string>(['note', 'tip', 'important', 'warning', 'caution', 'ai-thinking', 'tool-call', 'citation']);

function isAdmonitionKind(s: string): s is AdmonitionKind {
  const lower = s.toLowerCase();
  if (ADMONITION_KINDS.has(lower)) return true;
  // Accept any colon-namespaced domain kind (B10)
  return /^[a-z][\w-]*:[\w-]+$/.test(lower);
}

// ── Public Entry Point ──────────────────────────────────────────────────

/**
 * Parse a markdown string into an array of block tokens.
 *
 * Heading tokens receive a GitHub-style `id` slug (collisions get `-2`,
 * `-3`, … suffixes). Pass {@link extractToc} the same source if you
 * need a flat table-of-contents listing.
 */
export function parseMarkdown(input: string): Token[] {
  if (!input.trim()) return [];

  // Normalize Windows and legacy-Mac line endings before block dispatch.
  // Several block recognizers intentionally anchor at end-of-line; a trailing
  // carriage return can otherwise make a recognizer reject a line while the
  // paragraph collector also treats it as a block start, leaving the cursor
  // on the same line forever.
  const normalizedInput = input.replace(/\r\n?/g, '\n');
  const { data: frontmatterData, body } = extractFrontmatter(normalizedInput);
  const { source, refs } = extractLinkRefs(body);
  const tokens = parseMarkdownWithRefs(source, refs);

  if (Object.keys(frontmatterData).length > 0) {
    // Heuristic: frontmatter format based on input prefix
    let format: 'yaml' | 'toml' | 'json' = 'yaml';
    const trimmed = normalizedInput.trimStart();
    if (trimmed.startsWith('+++')) format = 'toml';
    else if (trimmed.startsWith('{')) format = 'json';

    tokens.unshift({
      type: 'frontmatter',
      format,
      raw: normalizedInput.slice(0, normalizedInput.length - body.length).trimEnd(),
      data: frontmatterData,
    });
  }

  assignHeadingAnchors(tokens, new Slugger());
  return tokens;
}

// ── Block Dispatcher ────────────────────────────────────────────────────

function parseMarkdownWithRefs(input: string, refs: Map<string, LinkRef>): Token[] {
  if (!input.trim()) return [];

  const lines = input.split('\n');
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Heading: # through ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length as 1 | 2 | 3 | 4 | 5 | 6;
      tokens.push({
        type: 'heading',
        level,
        content: parseInline(headingMatch[2]!, refs),
      });
      i++;
      continue;
    }

    // Code block: ```
    if (line.trimStart().startsWith('```')) {
      const infoString = line.trimStart().slice(3);
      const { language, meta } = parseCodeBlockInfoString(infoString);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      tokens.push({
        type: 'code-block',
        language,
        content: codeLines.join('\n'),
        ...(meta ? { meta } : {}),
      });
      i++; // skip closing ```
      continue;
    }

    // Setext heading: plain content followed by === (H1) or --- (H2).
    // Must be checked before HR so that `title\n---` becomes a level-2
    // heading instead of a paragraph followed by a horizontal rule.
    if (i + 1 < lines.length) {
      const underline = lines[i + 1]!;
      const isH1Underline = /^=+\s*$/.test(underline);
      const isH2Underline = /^-+\s*$/.test(underline);
      if (isH1Underline || isH2Underline) {
        const trimmed = line.trimStart();
        const contentIsBlockStart =
          trimmed.startsWith('```') ||
          /^(\s*[-*_]\s*){3,}$/.test(line) ||
          trimmed.startsWith('|') ||
          trimmed.startsWith('> ') ||
          trimmed === '>' ||
          /^(\s*)([-*]|\d+\.)\s+/.test(line) ||
          /^\[\^[^\]]+\]:\s+/.test(line) ||
          /^!\[/.test(line);
        if (!contentIsBlockStart && line.trim() !== '') {
          const level: 1 | 2 = isH1Underline ? 1 : 2;
          tokens.push({
            type: 'heading',
            level,
            content: parseInline(line.trim(), refs),
          });
          i += 2;
          continue;
        }
      }
    }

    // Horizontal rule: ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      tokens.push({ type: 'hr' });
      i++;
      continue;
    }

    // Footnote definition: [^label]: content
    const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s+(.+)$/);
    if (footnoteDefMatch) {
      const label = footnoteDefMatch[1]!;
      const firstLine = footnoteDefMatch[2]!;
      // Collect continuation lines (indented by 2+ spaces)
      const contentLines = [firstLine];
      i++;
      while (i < lines.length && /^ {2}/.test(lines[i]!)) {
        contentLines.push(lines[i]!.slice(2));
        i++;
      }
      tokens.push({
        type: 'footnote-def',
        label,
        content: parseMarkdownWithRefs(contentLines.join('\n'), refs),
      });
      continue;
    }

    // Image: ![alt](url "title")
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)$/);
    if (imageMatch) {
      tokens.push({
        type: 'image',
        alt: imageMatch[1]!,
        url: imageMatch[2]!,
        title: imageMatch[3],
      });
      i++;
      continue;
    }

    // Wiki-link block: [[Target]] or [[Target|alias]]
    const wikiLinkBlockMatch = line.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    if (wikiLinkBlockMatch) {
      tokens.push({
        type: 'wiki-link-block',
        target: wikiLinkBlockMatch[1]!.trim(),
        alias: wikiLinkBlockMatch[2]?.trim(),
      });
      i++;
      continue;
    }

    // Table: either a pipe-prefixed line, or a line containing at least one
    // `|` whose immediate next line is a pipe-table separator row. The latter
    // form covers GFM tables written without leading/trailing pipes.
    const isPipePrefixed = line.trimStart().startsWith('|');
    const nextLine = i + 1 < lines.length ? lines[i + 1]! : '';
    const nextIsSeparator = /^[\s|:-]+$/.test(nextLine) && nextLine.includes('-') && nextLine.includes('|');
    if (isPipePrefixed || (line.includes('|') && nextIsSeparator)) {
      const tableLines: string[] = [];
      const isTableRow = (l: string): boolean => l.trimStart().startsWith('|') || (l.includes('|') && l.trim() !== '' && !/^#{1,6}\s/.test(l));
      // Accept the header + separator + any subsequent row lines that
      // look like table rows (contain a `|` and aren't obvious block starts).
      tableLines.push(line);
      i++;
      if (i < lines.length) {
        tableLines.push(lines[i]!);
        i++;
      }
      while (i < lines.length && isTableRow(lines[i]!)) {
        tableLines.push(lines[i]!);
        i++;
      }
      const table = parseTable(tableLines, refs);
      if (table) {
        tokens.push(table);
      } else {
        tokens.push({
          type: 'paragraph',
          content: parseInline(tableLines.join(' '), refs),
        });
      }
      continue;
    }

    // Blockquote (and admonitions): >
    if (line.trimStart().startsWith('> ') || line.trimStart() === '>') {
      const blockLines: string[] = [];
      while (i < lines.length && (lines[i]!.trimStart().startsWith('> ') || lines[i]!.trimStart() === '>')) {
        const stripped = lines[i]!.trimStart();
        blockLines.push(stripped === '>' ? '' : stripped.slice(2));
        i++;
      }

      // Check for admonition: first line is [!TYPE], [!TYPE]+, [!TYPE]- or [!TYPE] Title
      const admonitionMatch = blockLines[0]?.match(/^\[!([\w-]+(?::[\w-]+)?)\]([+-]?)\s*(.*)?$/);
      if (admonitionMatch && isAdmonitionKind(admonitionMatch[1]!)) {
        const kind = admonitionMatch[1]!.toLowerCase() as AdmonitionKind;
        const collapsible = admonitionMatch[2] !== '';
        const collapsed = admonitionMatch[2] === '-';
        const title = admonitionMatch[3]?.trim() || kind.charAt(0).toUpperCase() + kind.slice(1);
        const contentLines = blockLines.slice(1);
        // Skip leading empty line after title
        const startIdx = contentLines[0]?.trim() === '' ? 1 : 0;
        tokens.push({
          type: 'admonition',
          kind,
          title,
          content: parseMarkdownWithRefs(contentLines.slice(startIdx).join('\n'), refs),
          ...(collapsible ? { collapsed, collapsible } : {}),
        });
      } else {
        tokens.push({
          type: 'blockquote',
          content: parseMarkdownWithRefs(blockLines.join('\n'), refs),
        });
      }
      continue;
    }

    // List (ordered or unordered) with nested sub-list support
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const result = parseList(lines, i, refs);
      tokens.push(result.token);
      i = result.nextIndex;
      continue;
    }

    // <details><summary>…</summary>…</details>
    // Tags must each occupy their own line (or be on the same line as the
    // opening tag for `<summary>`); we don't try to parse mid-line HTML.
    if (/^\s*<details\b/i.test(line)) {
      const result = parseDetails(lines, i, refs);
      if (result) {
        tokens.push(result.token);
        i = result.nextIndex;
        continue;
      }
      // parseDetails returned null (no </details>) — fall through and let
      // the paragraph collector treat the rest of the document as plain
      // text. Without consuming SOMETHING here we'd loop forever on the
      // same opener.
    }

    // Block math: $$ on its own line opens a block, then content until the
    // next `$$`. Render as a framed surface; pulsar does not interpret LaTeX.
    if (line.trim() === '$$') {
      const mathLines: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== '$$') {
        mathLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // consume closing $$
      tokens.push({ type: 'math-block', content: mathLines.join('\n') });
      continue;
    }
    // Inline-on-one-line block math: `$$ ... $$` on a single line.
    const oneLineBlockMath = line.match(/^\s*\$\$\s*(.+?)\s*\$\$\s*$/);
    if (oneLineBlockMath) {
      tokens.push({ type: 'math-block', content: oneLineBlockMath[1]! });
      i++;
      continue;
    }

    // Definition list: `Term` followed by one or more `: definition` lines.
    // We require the definition line to be a leading `:` separated by a
    // single space so it doesn't collide with prose colons.
    if (i + 1 < lines.length && /^\s*:\s+\S/.test(lines[i + 1]!) && line.trim() !== '' && !/^\s*:\s/.test(line)) {
      const result = parseDefinitionList(lines, i, refs);
      if (result) {
        tokens.push(result.token);
        i = result.nextIndex;
        continue;
      }
    }

    // Paragraph: everything else
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.match(/^#{1,6}\s/) &&
      !lines[i]!.trimStart().startsWith('```') &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i]!) &&
      !lines[i]!.trimStart().startsWith('|') &&
      !lines[i]!.trimStart().startsWith('> ') &&
      lines[i]!.trimStart() !== '>' &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i]!) &&
      !/^\[\^[^\]]+\]:\s+/.test(lines[i]!) &&
      !/^!\[/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({
        type: 'paragraph',
        content: joinInlineLines(paraLines, refs),
      });
    }
  }

  return tokens;
}

// ── Nested List Parser ──────────────────────────────────────────────────

interface ListParseResult {
  token: Extract<Token, { type: 'list' }>;
  nextIndex: number;
}

/**
 * Parse a list starting at `startIdx`, handling nested sub-lists via indentation.
 * Returns the list token and the next line index to continue parsing.
 */
function parseList(lines: string[], startIdx: number, refs?: Map<string, LinkRef>): ListParseResult {
  const firstLine = lines[startIdx]!;
  const baseIndent = firstLine.match(/^(\s*)/)?.[1]?.length ?? 0;

  // Determine if ordered or unordered based on the first line (after base indent)
  const trimmedFirst = firstLine.slice(baseIndent);
  const ordered = /^\d+\.\s+/.test(trimmedFirst);

  const items: ListItem[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      // Empty line may still continue the list if next line is indented
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]!;
        const nextIndent = nextLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (nextIndent >= baseIndent && /^\s*([-*]|\d+\.)\s+/.test(nextLine)) {
          i++;
          continue;
        }
      }
      break;
    }

    const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

    // If this line is at a lower indent than our base, it's not part of this list
    if (lineIndent < baseIndent) break;

    // Check if this line is a list item at our level
    const atBaseLevel = lineIndent === baseIndent;
    const trimmed = line.slice(baseIndent);

    const bulletMatch = ordered ? trimmed.match(/^(\d+\.)\s+(.*)$/) : trimmed.match(/^([-*])\s+(.*)$/);

    if (atBaseLevel && bulletMatch) {
      const content = bulletMatch[2]!;

      // Check for GFM task list checkbox
      const taskMatch = content.match(/^\[([ xX])\]\s*(.*)/);
      const checked = taskMatch ? taskMatch[1]!.toLowerCase() === 'x' : undefined;
      const itemText = taskMatch ? taskMatch[2]! : content;

      // Collect child lines (lines with deeper indentation after this item)
      const childLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const childLine = lines[j]!;
        if (childLine.trim() === '') {
          // Empty line — keep going if next non-empty line is deeper indent
          if (j + 1 < lines.length) {
            const peek = lines[j + 1]!;
            const peekIndent = peek.match(/^(\s*)/)?.[1]?.length ?? 0;
            if (peekIndent > baseIndent) {
              childLines.push('');
              j++;
              continue;
            }
          }
          break;
        }
        const childIndent = childLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (childIndent > baseIndent) {
          childLines.push(childLine.slice(baseIndent + 2)); // Remove parent indent
          j++;
        } else {
          break;
        }
      }

      const children = childLines.length > 0 ? parseMarkdownWithRefs(childLines.join('\n'), refs ?? new Map()) : undefined;

      const item: ListItem = {
        content: parseInline(itemText, refs),
        ...(checked !== undefined && { checked }),
        ...(children && { children }),
      };

      items.push(item);
      i = j;
    } else if (lineIndent > baseIndent) {
      // Sub-content that's indented but doesn't start with a bullet
      // This belongs to the previous item — skip forward
      i++;
    } else {
      // Not a list item at our level
      break;
    }
  }

  return {
    token: { type: 'list', ordered, items },
    nextIndex: i,
  };
}

// ── Table Parser ────────────────────────────────────────────────────────

/**
 * Parse a table from lines starting with |. Reads per-column alignment
 * from the separator row's `:---`, `---:`, `:---:`, `---` patterns.
 */
function parseTable(tableLines: string[], refs?: Map<string, LinkRef>): Token | null {
  if (tableLines.length < 2) return null;

  const parseCells = (line: string): string[] => {
    const parts = line.split('|').map((cell) => cell.trim());
    // Strip optional empty leading/trailing splits so both pipe-delimited
    // (`| a | b |`) and pipe-less (`a | b`) rows parse the same way.
    if (parts.length > 0 && parts[0] === '') parts.shift();
    if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  };

  const headerCells = parseCells(tableLines[0]!);

  // Second line should be separator (|---|---|)
  const separatorLine = tableLines[1]!;
  if (!/^[\s|:-]+$/.test(separatorLine)) return null;

  const align = parseCells(separatorLine).map(detectAlignment);
  // Pad alignment to match header count; trim if separator over-specified.
  while (align.length < headerCells.length) align.push('default');
  align.length = headerCells.length;

  const rows: InlineToken[][][] = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = parseCells(tableLines[i]!);
    rows.push(cells.map((cell) => parseInline(cell, refs)));
  }

  return {
    type: 'table',
    headers: headerCells.map((cell) => parseInline(cell, refs)),
    rows,
    align,
  };
}

function detectAlignment(spec: string): 'left' | 'center' | 'right' | 'default' {
  const trimmed = spec.trim();
  if (!trimmed) return 'default';
  const startsColon = trimmed.startsWith(':');
  const endsColon = trimmed.endsWith(':');
  if (startsColon && endsColon) return 'center';
  if (endsColon) return 'right';
  if (startsColon) return 'left';
  return 'default';
}

// ── Paragraph Line Joiner ───────────────────────────────────────────────

/**
 * Join the lines of a paragraph into a single inline-token stream,
 * promoting trailing two-space line endings (GFM hard breaks) into
 * `hard-break` tokens and collapsing other line wraps into a single space.
 * This preserves the block-level layout signal without threading it through
 * the inline parser.
 */
function joinInlineLines(paraLines: string[], refs?: Map<string, LinkRef>): InlineToken[] {
  const out: InlineToken[] = [];
  for (let k = 0; k < paraLines.length; k++) {
    const line = paraLines[k]!;
    // CommonMark hard breaks: trailing two-or-more spaces *or* a single
    // trailing `\` at end of line (the backslash form is what Markdown editors
    // emit when shift-enter is pressed).
    const trailingSpaces = / {2,}$/.test(line);
    const trailingBackslash = /\\$/.test(line) && !/\\\\$/.test(line);
    const hardBreak = trailingSpaces || trailingBackslash;
    const cleaned = trailingBackslash ? line.replace(/\\$/, '') : line.replace(/ +$/, '');
    out.push(...parseInline(cleaned, refs));
    if (k < paraLines.length - 1) {
      if (hardBreak) {
        out.push({ type: 'hard-break' });
      } else {
        out.push({ type: 'text', content: ' ' });
      }
    }
  }
  return out;
}

// ── <details> Parser ────────────────────────────────────────────────────

interface DetailsParseResult {
  token: Extract<Token, { type: 'details' }>;
  nextIndex: number;
}

/**
 * Parse a `<details>...</details>` block. The opening tag may sit on its own
 * line or immediately precede a `<summary>` element on the same line; the
 * body runs from after the summary close to the matching `</details>`. We
 * recurse into the body so nested markdown (lists, code, etc.) renders.
 */
function parseDetails(lines: string[], startIdx: number, refs: Map<string, LinkRef>): DetailsParseResult | null {
  const startLine = lines[startIdx];
  if (!startLine) return null;
  // Collect the source lines until </details>. Bail out (return null) if the
  // closing tag is missing — caller falls through to treat the source as
  // paragraph text rather than swallow the rest of the document.
  const bodyLines: string[] = [];
  let i = startIdx;
  let foundClose = false;
  // Capture the content of the opening line *after* `<details ...>`.
  const openMatch = startLine.match(/^(\s*)<details\b[^>]*>(.*)$/i);
  if (openMatch) {
    if (openMatch[2]) bodyLines.push(openMatch[2]);
    i++;
  } else {
    return null;
  }
  while (i < lines.length) {
    const line = lines[i]!;
    const closeIdx = line.toLowerCase().indexOf('</details>');
    if (closeIdx >= 0) {
      const before = line.slice(0, closeIdx);
      if (before.trim().length > 0) bodyLines.push(before);
      foundClose = true;
      i++;
      break;
    }
    bodyLines.push(line);
    i++;
  }
  if (!foundClose) return null;

  // Pull `<summary>...</summary>` out of the body. If it spans multiple lines,
  // join them. The summary may have inline markdown.
  const joined = bodyLines.join('\n');
  let summaryText = '';
  let bodyText = joined;
  const summaryMatch = joined.match(/^\s*<summary>([\s\S]*?)<\/summary>\s*\n?/i);
  if (summaryMatch) {
    summaryText = summaryMatch[1]!.trim();
    bodyText = joined.slice(summaryMatch[0].length);
  } else {
    // No <summary> — use a generic label so the user can still tell the
    // surface exists and is collapsible.
    summaryText = 'Details';
  }

  return {
    token: {
      type: 'details',
      summary: parseInline(summaryText, refs),
      content: bodyText.trim().length > 0 ? parseMarkdownWithRefs(bodyText, refs) : [],
    },
    nextIndex: i,
  };
}

// ── Definition List Parser ──────────────────────────────────────────────

interface DefinitionListParseResult {
  token: Extract<Token, { type: 'definition-list' }>;
  nextIndex: number;
}

/**
 * Parse a definition list. The pattern is one or more entries, each of the
 * form `Term\n: Definition\n[: Continuation]\n[blank]`. Multiple terms
 * separated by blank lines accumulate into a single list token so the
 * renderer keeps them visually grouped.
 */
function parseDefinitionList(lines: string[], startIdx: number, refs: Map<string, LinkRef>): DefinitionListParseResult | null {
  const items: { term: InlineToken[]; descriptions: InlineToken[][] }[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const term = lines[i]!;
    if (term.trim() === '') break;
    if (i + 1 >= lines.length) break;
    const firstDef = lines[i + 1]!;
    if (!/^\s*:\s+\S/.test(firstDef)) break;
    i += 1;
    const descriptions: InlineToken[][] = [];
    let currentDef: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      const ddMatch = line.match(/^\s*:\s+(.+)$/);
      if (ddMatch) {
        if (currentDef.length > 0) {
          descriptions.push(parseInline(currentDef.join(' '), refs));
          currentDef = [];
        }
        currentDef.push(ddMatch[1]!);
        i++;
        continue;
      }
      // Continuation lines are indented by at least 2 spaces.
      if (currentDef.length > 0 && /^ {2,}\S/.test(line)) {
        currentDef.push(line.trim());
        i++;
        continue;
      }
      break;
    }
    if (currentDef.length > 0) descriptions.push(parseInline(currentDef.join(' '), refs));
    items.push({ term: parseInline(term.trim(), refs), descriptions });
    // Allow a blank line between entries; otherwise the next iteration sees
    // the next term.
    if (i < lines.length && lines[i]!.trim() === '') i++;
  }
  if (items.length === 0) return null;
  return {
    token: { type: 'definition-list', items },
    nextIndex: i,
  };
}
