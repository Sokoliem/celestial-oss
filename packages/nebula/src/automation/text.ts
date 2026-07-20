import type { CellGrid, StyleAttrs, VNode } from '../vdom.js';
import type { AutomationTextRun } from './contracts.js';

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function gridToText(grid: CellGrid): string {
  const lines: string[] = [];

  for (let row = 0; row < grid.height; row++) {
    let line = '';
    const cells = grid.cells[row];
    if (cells) {
      for (let col = 0; col < grid.width; col++) {
        line += cells[col]?.char ?? ' ';
      }
    }
    lines.push(line.trimEnd());
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

export function extractAutomationTextRuns(grid: CellGrid): AutomationTextRun[] {
  const runs: AutomationTextRun[] = [];

  for (let row = 0; row < grid.height; row++) {
    const cells = grid.cells[row];
    if (!cells) continue;

    let currentText = '';
    let startCol = -1;
    let currentStyle: StyleAttrs | undefined;

    for (let col = 0; col < grid.width; col++) {
      const cell = cells[col];
      const char = cell?.char ?? ' ';

      if (char !== ' ' || (currentText.length > 0 && col < grid.width - 1)) {
        if (startCol === -1) {
          startCol = col;
          currentStyle = cell?.style;
        }
        currentText += char;
        continue;
      }

      if (currentText.length === 0) continue;

      const trimmed = currentText.trimEnd();
      if (trimmed.length > 0) {
        runs.push({
          text: trimmed,
          row,
          col: startCol,
          width: trimmed.length,
          height: 1,
          style: currentStyle,
        });
      }

      currentText = '';
      startCol = -1;
      currentStyle = undefined;
    }

    if (currentText.length > 0) {
      const trimmed = currentText.trimEnd();
      if (trimmed.length > 0) {
        runs.push({
          text: trimmed,
          row,
          col: startCol,
          width: trimmed.length,
          height: 1,
          style: currentStyle,
        });
      }
    }
  }

  return runs;
}

export function extractNodeText(node: VNode): string {
  switch (node.kind) {
    case 'text':
      return node.content;
    case 'row':
    case 'column':
      return node.children.map(extractNodeText).join(' ');
    case 'box':
      return node.children.map(extractNodeText).join(' ');
    case 'focus':
      return extractNodeText(node.child);
    case 'scroll':
      return extractNodeText(node.child);
    case 'component':
      return extractNodeText(node.render());
    case 'event':
      return extractNodeText(node.child);
    case 'hover':
      return extractNodeText(node.child);
    case 'overlay':
      return extractNodeText(node.child);
    case 'flex':
    case 'portal':
      return extractNodeText(node.child);
    case 'memo':
      return extractNodeText(node.render());
    case 'suspense':
      return extractNodeText(node.resolved ? node.child : node.fallback);
    case 'localState':
    case 'lazy':
      return '';
    case 'tabGroup':
      return node.children.map(extractNodeText).join(' ');
    case 'empty':
    case 'image':
      return '';
  }
}
