/**
 * VNode tree traversal utilities for Telescope.
 *
 * Collects metadata-annotated nodes and extracts text content
 * from VNode trees. Used by both the query engine and a11y auditor.
 */

import type { AriaAttrs, CellGrid, StyleAttrs, VNode } from '@celestial/core/nebula';
import { getMeta } from './metadata.js';

// ── Found Node ──────────────────────────────────────────────────────────

export interface FoundNodeSelectorInfo {
  id?: string;
  classes?: readonly string[];
  states?: readonly string[];
  label?: string;
  testId?: string;
  a11y?: AriaAttrs;
}

export interface FoundNode {
  node: VNode;
  id?: string;
  classes?: readonly string[];
  states?: readonly string[];
  label?: string;
  testId?: string;
  a11y?: AriaAttrs;
  ancestors: readonly FoundNodeSelectorInfo[];
  focused?: boolean;
  hidden?: boolean;
  textContent: string;
}

// ── Text Run ────────────────────────────────────────────────────────────

export interface TextRun {
  text: string;
  row: number;
  col: number;
  width: number;
  style?: StyleAttrs;
}

// ── Collect annotated nodes from VNode tree ─────────────────────────────

function toSelectorInfo(meta: ReturnType<typeof getMeta>): FoundNodeSelectorInfo | null {
  if (!meta) {
    return null;
  }

  if (!meta.id && !meta.classes?.length && !meta.states?.length && !meta.label && !meta.testId && !meta.a11y) {
    return null;
  }

  return {
    id: meta.id,
    classes: meta.classes,
    states: meta.states,
    label: meta.label,
    testId: meta.testId,
    a11y: meta.a11y,
  };
}

export function collectNodes(node: VNode, inherited?: { focused?: boolean; hidden?: boolean; ancestors?: readonly FoundNodeSelectorInfo[] }): FoundNode[] {
  const meta = getMeta(node);
  const results: FoundNode[] = [];
  const hidden = inherited?.hidden === true || meta?.a11y?.hidden === true;
  const selectorInfo = toSelectorInfo(meta);
  const ancestors = inherited?.ancestors ?? [];
  const nextAncestors = selectorInfo ? [...ancestors, selectorInfo] : [...ancestors];

  const entry: FoundNode = {
    node,
    id: meta?.id,
    classes: meta?.classes,
    states: meta?.states,
    label: meta?.label,
    testId: meta?.testId,
    a11y: meta?.a11y,
    ancestors,
    focused: inherited?.focused,
    hidden,
    textContent: extractNodeText(node),
  };

  if (selectorInfo) {
    results.push(entry);
  }

  switch (node.kind) {
    case 'text':
      break;
    case 'row':
    case 'column':
      for (const child of node.children) {
        results.push(...collectNodes(child, { ...inherited, hidden, ancestors: nextAncestors }));
      }
      break;
    case 'box':
      for (const child of node.children) {
        results.push(...collectNodes(child, { ...inherited, hidden, ancestors: nextAncestors }));
      }
      break;
    case 'focus':
      results.push(...collectNodes(node.child, { focused: node.focused, hidden, ancestors: nextAncestors }));
      if (selectorInfo) {
        entry.focused = node.focused;
      }
      break;
    case 'scroll':
      results.push(...collectNodes(node.child, { ...inherited, hidden, ancestors: nextAncestors }));
      break;
    case 'component':
      results.push(...collectNodes(node.render(), { ...inherited, hidden, ancestors: nextAncestors }));
      break;
    case 'event':
      results.push(...collectNodes(node.child, { ...inherited, hidden, ancestors: nextAncestors }));
      break;
    case 'hover':
      results.push(...collectNodes(node.child, { ...inherited, hidden, ancestors: nextAncestors }));
      break;
    case 'overlay':
      results.push(...collectNodes(node.child, { ...inherited, hidden, ancestors: nextAncestors }));
      break;
    case 'flex':
      results.push(...collectNodes(node.child, { ...inherited, hidden, ancestors: nextAncestors }));
      break;
    case 'empty':
    case 'image':
      break;
  }

  return results;
}

// ── Extract plain text from a VNode ─────────────────────────────────────

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
      return extractNodeText(node.child);
    case 'empty':
    case 'image':
      return '';
    default:
      return '';
  }
}

// ── Find focus state for text ───────────────────────────────────────────

export function findFocusNode(text: string, node: VNode): boolean | undefined {
  switch (node.kind) {
    case 'focus': {
      const childText = extractNodeText(node.child);
      if (childText.includes(text) || text.includes(childText)) {
        return node.focused;
      }
      return findFocusNode(text, node.child);
    }
    case 'text':
      return undefined;
    case 'row':
    case 'column':
      for (const child of node.children) {
        const result = findFocusNode(text, child);
        if (result !== undefined) return result;
      }
      return undefined;
    case 'box':
      for (const child of node.children) {
        const result = findFocusNode(text, child);
        if (result !== undefined) return result;
      }
      return undefined;
    case 'scroll':
      return findFocusNode(text, node.child);
    case 'component':
      return findFocusNode(text, node.render());
    case 'event':
      return findFocusNode(text, node.child);
    case 'hover':
      return findFocusNode(text, node.child);
    case 'overlay':
      return findFocusNode(text, node.child);
    case 'flex':
      return findFocusNode(text, node.child);
    case 'empty':
    case 'image':
      return undefined;
    default:
      return undefined;
  }
}

// ── Extract text runs from CellGrid ─────────────────────────────────────

export function extractTextRuns(grid: CellGrid): TextRun[] {
  const runs: TextRun[] = [];

  for (let r = 0; r < grid.height; r++) {
    const gridRow = grid.cells[r];
    if (!gridRow) continue;

    let currentText = '';
    let startCol = -1;
    let currentStyle: StyleAttrs | undefined;

    for (let c = 0; c < grid.width; c++) {
      const cell = gridRow[c];
      const ch = cell ? cell.char : ' ';

      if (ch !== ' ' || (currentText.length > 0 && c < grid.width - 1)) {
        if (startCol === -1) {
          startCol = c;
          currentStyle = cell?.style;
        }
        currentText += ch;
      } else if (currentText.length > 0) {
        const trimmed = currentText.trimEnd();
        if (trimmed.length > 0) {
          runs.push({ text: trimmed, row: r, col: startCol, width: trimmed.length, style: currentStyle });
        }
        currentText = '';
        startCol = -1;
        currentStyle = undefined;
      }
    }

    if (currentText.length > 0) {
      const trimmed = currentText.trimEnd();
      if (trimmed.length > 0) {
        runs.push({ text: trimmed, row: r, col: startCol, width: trimmed.length, style: currentStyle });
      }
    }
  }

  return runs;
}
