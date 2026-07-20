/**
 * VNode tree traversal utilities for Telescope.
 *
 * Collects metadata-annotated nodes and extracts text content
 * from VNode trees. Used by both the query engine and a11y auditor.
 */

import { type AriaAttrs, type CellGrid, type LayoutEntry, type LayoutPlan, planLayout, type StyleAttrs, type VNode } from '@celestial/core/nebula';
import { visualWidth } from '@celestial/core/corona';
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

interface TraversalState {
  focused?: boolean;
  hidden?: boolean;
  ancestors?: readonly FoundNodeSelectorInfo[];
}

/** Collect metadata from the exact resolved nodes used by a layout pass. */
export function collectNodesFromPlan(plan: LayoutPlan, inherited?: TraversalState): FoundNode[] {
  const results: FoundNode[] = [];
  const textCache = new WeakMap<LayoutEntry, string>();

  function entryText(entry: LayoutEntry): string {
    const cached = textCache.get(entry);
    if (cached !== undefined) return cached;
    const value = entry.node.kind === 'text' ? entry.node.content : entry.children.map(entryText).join(' ');
    textCache.set(entry, value);
    return value;
  }

  function visit(entry: LayoutEntry, state: TraversalState): void {
    // Flow planning leaves a zero-size placeholder for overlays and then
    // produces the positioned entry in plan.overlays. Inspect only the latter.
    if (entry.node.kind === 'overlay' && entry.children.length === 0) return;

    const meta = getMeta(entry.node);
    const hidden = state.hidden === true || meta?.a11y?.hidden === true;
    const focused = entry.node.kind === 'focus' ? entry.node.focused : state.focused;
    const selectorInfo = toSelectorInfo(meta);
    const ancestors = state.ancestors ?? [];
    const nextAncestors = selectorInfo ? [...ancestors, selectorInfo] : ancestors;

    if (selectorInfo) {
      results.push({
        node: entry.node,
        id: meta?.id,
        classes: meta?.classes,
        states: meta?.states,
        label: meta?.label,
        testId: meta?.testId,
        a11y: meta?.a11y,
        ancestors,
        focused,
        hidden,
        textContent: entryText(entry),
      });
    }

    for (const child of entry.children) visit(child, { focused, hidden, ancestors: nextAncestors });
  }

  visit(plan.root, inherited ?? {});
  for (const overlay of plan.overlays) visit(overlay.entry, inherited ?? {});
  return results;
}

export function collectNodes(node: VNode, inherited?: TraversalState): FoundNode[] {
  return collectNodesFromPlan(planLayout(node, 80, 24), inherited);
}

// ── Extract plain text from a VNode ─────────────────────────────────────

export function extractNodeText(node: VNode): string {
  const plan = planLayout(node, 80, 24);
  const text: string[] = [];
  const visit = (entry: LayoutEntry): void => {
    if (entry.node.kind === 'text') text.push(entry.node.content);
    for (const child of entry.children) visit(child);
  };
  visit(plan.root);
  for (const overlay of plan.overlays) visit(overlay.entry);
  return text.join(' ');
}

// ── Find focus state for text ───────────────────────────────────────────

export function findFocusNode(text: string, node: VNode): boolean | undefined {
  return findFocusNodeFromPlan(text, planLayout(node, 80, 24));
}

export function findFocusNodeFromPlan(text: string, plan: LayoutPlan): boolean | undefined {
  function entryText(entry: LayoutEntry): string {
    return entry.node.kind === 'text' ? entry.node.content : entry.children.map(entryText).join(' ');
  }

  function visit(entry: LayoutEntry): boolean | undefined {
    if (entry.node.kind === 'focus') {
      const content = entry.children.map(entryText).join(' ');
      if (content.includes(text) || text.includes(content)) return entry.node.focused;
    }
    for (const child of entry.children) {
      const result = visit(child);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  const rootResult = visit(plan.root);
  if (rootResult !== undefined) return rootResult;
  for (const overlay of plan.overlays) {
    const result = visit(overlay.entry);
    if (result !== undefined) return result;
  }
  return undefined;
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
        if (ch !== ' ') c += Math.max(0, visualWidth(ch) - 1);
      } else if (currentText.length > 0) {
        const trimmed = currentText.trimEnd();
        if (trimmed.length > 0) {
          runs.push({ text: trimmed, row: r, col: startCol, width: visualWidth(trimmed), style: currentStyle });
        }
        currentText = '';
        startCol = -1;
        currentStyle = undefined;
      }
    }

    if (currentText.length > 0) {
      const trimmed = currentText.trimEnd();
      if (trimmed.length > 0) {
        runs.push({ text: trimmed, row: r, col: startCol, width: visualWidth(trimmed), style: currentStyle });
      }
    }
  }

  return runs;
}
