import { border, color, style } from '@celestial/corona';
import { box, column, row, text, type VNode } from '@celestial/nebula';

export interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffViewerConfig {
  diffText?: string;
  lines?: DiffLine[];
  title?: string;
  width?: number;
  showLineNumbers?: boolean;
}

/** Simple unified diff text parser into structured DiffLines */
export function parseUnifiedDiff(diffText: string): DiffLine[] {
  const rawLines = diffText.split(/\r?\n/);
  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const line of rawLines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      result.push({ type: 'header', content: line });
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match?.[1] && match[2]) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', newLineNumber: newLine++, content: line.slice(1) });
    } else if (line.startsWith('-')) {
      result.push({ type: 'delete', oldLineNumber: oldLine++, content: line.slice(1) });
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ type: 'context', oldLineNumber: oldLine++, newLineNumber: newLine++, content });
    }
  }

  return result;
}

/**
 * Git diff viewer component for CLI and agentic coding tools.
 * Renders unified diffs with line numbering, color-coded additions/deletions,
 * and header sections.
 */
export function diffViewer(config: DiffViewerConfig): VNode {
  const lines = config.lines ?? (config.diffText ? parseUnifiedDiff(config.diffText) : []);
  const showLineNumbers = config.showLineNumbers ?? true;

  const renderedLines: VNode[] = [];

  if (config.title) {
    renderedLines.push(
      row(
        text('diff ', style({ dim: true })),
        text(config.title, style({ bold: true, color: color.brightCyan })),
      ),
    );
    renderedLines.push(text('────────────────────────────────────────', style({ dim: true, color: color.gray })));
  }

  for (const line of lines) {
    if (line.type === 'header') {
      renderedLines.push(text(line.content, style({ color: color.brightCyan, dim: true })));
      continue;
    }

    const isAdd = line.type === 'add';
    const isDel = line.type === 'delete';

    const lineStyle = isAdd
      ? style({ color: color.brightGreen, background: color.rgb(15, 35, 20) })
      : isDel
        ? style({ color: color.brightRed, background: color.rgb(35, 15, 15) })
        : style({ color: color.white });

    const prefix = isAdd ? '+' : isDel ? '-' : ' ';
    const oldNum = showLineNumbers ? (line.oldLineNumber !== undefined ? String(line.oldLineNumber).padStart(4, ' ') : '    ') : '';
    const newNum = showLineNumbers ? (line.newLineNumber !== undefined ? String(line.newLineNumber).padStart(4, ' ') : '    ') : '';
    const numCol = showLineNumbers ? `${oldNum} ${newNum} ` : '';

    renderedLines.push(
      row(
        showLineNumbers ? text(numCol, style({ dim: true, color: color.gray })) : text(''),
        text(`${prefix} `, style({ bold: true, color: isAdd ? color.brightGreen : isDel ? color.brightRed : color.gray })),
        text(line.content, lineStyle),
      ),
    );
  }

  const containerStyle = style({
    border: border.rounded,
    padding: 1,
    width: config.width,
  });

  return box(column(...renderedLines), containerStyle);
}
