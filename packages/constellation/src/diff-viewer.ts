import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, column, row, text } from '@celestial/core/nebula';
import { graphemeSlice, measureTextWidth } from '@celestial/rosetta';
import { nonNegativeInteger, positiveInteger } from './internal.js';
import { useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface DiffViewerTokens {
  title: Color;
  header: Color;
  lineNumber: Color;
  add: Color;
  del: Color;
  changeBg: Color;
  context: Color;
  divider: Color;
}

export const diffViewerContract: TokenContract<DiffViewerTokens> = {
  title: (t: SemanticTheme) => t.colors.tones.info,
  header: (t: SemanticTheme) => t.colors.muted,
  lineNumber: (t: SemanticTheme) => t.colors.muted,
  add: (t: SemanticTheme) => t.colors.tones.success,
  del: (t: SemanticTheme) => t.colors.tones.danger,
  changeBg: (t: SemanticTheme) => t.colors.surfaceAlt,
  context: (t: SemanticTheme) => t.colors.text,
  divider: (t: SemanticTheme) => t.colors.divider,
};

// ─── Parser ──────────────────────────────────────────────────────────────────

export interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
  /** Set on the final line of a hunk when the file has no trailing newline. */
  eofNoNewline?: boolean;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
/** Metadata lines that may appear before the first hunk of a file section. */
const METADATA_RE = /^(index |new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to|Binary files |GIT binary patch)/;

/**
 * Parse unified diff text into structured lines.
 *
 * The parser tracks hunk state precisely: `---`/`+++` are only file headers
 * outside a hunk (a deleted line whose content starts with `--` is content,
 * not a header), `\ No newline at end of file` annotates the previous line
 * instead of corrupting line numbers, metadata stays unnumbered, and empty or
 * trailing-newline input never produces phantom context lines. Combined
 * (merge) diff hunks are preserved as unnumbered context rather than
 * misparsed.
 */
export function parseUnifiedDiff(diffText: string): DiffLine[] {
  if (diffText.length === 0) return [];
  const rawLines = diffText.split(/\r?\n/);
  // A trailing newline terminates the last line — it does not start a new one.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let oldRemaining = 0;
  let newRemaining = 0;
  let combinedHunk = false;

  const inHunk = () => oldRemaining > 0 || newRemaining > 0;

  for (const line of rawLines) {
    if (line.startsWith('diff --git')) {
      result.push({ type: 'header', content: line });
      oldRemaining = 0;
      newRemaining = 0;
      combinedHunk = false;
      continue;
    }

    if (line.startsWith('@@@')) {
      // Combined (merge) diff hunk — preserve content without fake numbering.
      result.push({ type: 'header', content: line });
      combinedHunk = true;
      oldRemaining = 0;
      newRemaining = 0;
      continue;
    }

    const hunk = HUNK_RE.exec(line);
    if (line.startsWith('@@') && hunk) {
      result.push({ type: 'header', content: line });
      oldLine = Number.parseInt(hunk[1]!, 10);
      oldRemaining = hunk[2] !== undefined ? Number.parseInt(hunk[2], 10) : 1;
      newLine = Number.parseInt(hunk[3]!, 10);
      newRemaining = hunk[4] !== undefined ? Number.parseInt(hunk[4], 10) : 1;
      combinedHunk = false;
      continue;
    }

    if (line.startsWith('\\')) {
      // `\ No newline at end of file` annotates the previous content line.
      const previous = result[result.length - 1];
      if (previous && previous.type !== 'header') {
        previous.eofNoNewline = true;
      } else {
        result.push({ type: 'header', content: line });
      }
      continue;
    }

    if (!inHunk() && (line.startsWith('---') || line.startsWith('+++') || METADATA_RE.test(line))) {
      result.push({ type: 'header', content: line });
      continue;
    }

    if (combinedHunk) {
      result.push({ type: 'context', content: line });
      continue;
    }

    if (inHunk() && line.startsWith('+')) {
      result.push({ type: 'add', newLineNumber: newLine++, content: line.slice(1) });
      newRemaining--;
      continue;
    }
    if (inHunk() && line.startsWith('-')) {
      result.push({ type: 'delete', oldLineNumber: oldLine++, content: line.slice(1) });
      oldRemaining--;
      continue;
    }
    if (inHunk()) {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ type: 'context', oldLineNumber: oldLine++, newLineNumber: newLine++, content });
      oldRemaining--;
      newRemaining--;
      continue;
    }

    // Outside any hunk and not recognized metadata: keep the line readable
    // rather than dropping it, but never invent line numbers.
    result.push({ type: 'header', content: line });
  }

  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface DiffViewerConfig {
  diffText?: string;
  lines?: DiffLine[];
  title?: string;
  width?: number;
  showLineNumbers?: boolean;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/**
 * Git diff viewer: line numbering, theme-token additions/deletions, and
 * header sections. Presentational (pure view builder) — hosts own any
 * interaction state around it.
 */
export function diffViewer(config: DiffViewerConfig): VNode {
  const tokens = useTokens(diffViewerContract, config, 'DiffViewer');
  const lines = config.lines ?? (config.diffText ? parseUnifiedDiff(config.diffText) : []);
  const showLineNumbers = config.showLineNumbers ?? true;
  const width = config.width === undefined ? undefined : positiveInteger(config.width, 1);
  const innerWidth = width !== undefined ? Math.max(8, width - 2) : undefined;

  const clip = (content: string, reserve: number): string => {
    if (innerWidth === undefined) return content;
    const budget = nonNegativeInteger(innerWidth - reserve, 0);
    if (measureTextWidth(content) <= budget) return content;
    return budget <= 1 ? '…' : `${graphemeSlice(content, 0, budget - 1)}…`;
  };

  const renderedLines: VNode[] = [];

  if (config.title) {
    renderedLines.push(row(text('diff ', style({ dim: true, color: tokens.header })), text(config.title, style({ bold: true, color: tokens.title }))));
    const dividerWidth = innerWidth ?? 40;
    renderedLines.push(text('─'.repeat(dividerWidth), style({ dim: true, color: tokens.divider })));
  }

  for (const line of lines) {
    if (line.type === 'header') {
      renderedLines.push(text(clip(line.content, 0), style({ color: tokens.header, dim: true })));
      continue;
    }

    const isAdd = line.type === 'add';
    const isDel = line.type === 'delete';

    const lineStyle = isAdd
      ? style({ color: tokens.add, background: tokens.changeBg })
      : isDel
        ? style({ color: tokens.del, background: tokens.changeBg })
        : style({ color: tokens.context });

    const prefix = isAdd ? '+' : isDel ? '-' : ' ';
    const oldNum = showLineNumbers ? (line.oldLineNumber !== undefined ? String(line.oldLineNumber).padStart(4, ' ') : '    ') : '';
    const newNum = showLineNumbers ? (line.newLineNumber !== undefined ? String(line.newLineNumber).padStart(4, ' ') : '    ') : '';
    const numCol = showLineNumbers ? `${oldNum} ${newNum} ` : '';
    const marker = line.eofNoNewline ? ' ␤' : '';

    renderedLines.push(
      row(
        showLineNumbers ? text(numCol, style({ dim: true, color: tokens.lineNumber })) : text(''),
        text(`${prefix} `, style({ bold: true, color: isAdd ? tokens.add : isDel ? tokens.del : tokens.lineNumber })),
        text(clip(line.content, numCol.length + 2) + marker, lineStyle),
      ),
    );
  }

  return box(
    column(...renderedLines),
    style({ border: border.rounded, padding: 1 }),
    { width, fit: width !== undefined ? 'fill' : 'content', overflow: 'hidden' },
  );
}
