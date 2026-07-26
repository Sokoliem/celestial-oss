import type { AriaAttrs, AriaRole } from '../a11y.js';
import { type CellGrid, type LayoutEntry, type LayoutPlan, type LayoutRect, planLayout, type VNode } from '../vdom.js';
import { auditA11yTree } from './a11y-audit.js';
import type { AutomationActionSnapshot, AutomationElementSnapshot, AutomationSnapshot, AutomationTextRun, CollectedNode, FocusCandidate } from './contracts.js';
import { INTERACTIVE_ROLES } from './contracts.js';
import { getVNodeMeta } from './metadata.js';
import { extractAutomationTextRuns, extractNodeText, gridToText, normalizeText } from './text.js';

function collectAnnotatedNodes(node: VNode, inherited?: { focused?: boolean; hidden?: boolean }): CollectedNode[] {
  const meta = getVNodeMeta(node);
  const hidden = inherited?.hidden === true || meta?.a11y?.hidden === true;
  const results: CollectedNode[] = [];

  if (meta?.testId || meta?.a11y) {
    results.push({
      node,
      testId: meta.testId,
      a11y: meta.a11y,
      focused: inherited?.focused,
      hidden,
      textContent: extractNodeText(node),
    });
  }

  switch (node.kind) {
    case 'text':
    case 'empty':
    case 'image':
      return results;
    case 'row':
    case 'column':
    case 'box':
      for (const child of node.children) {
        results.push(...collectAnnotatedNodes(child, { ...inherited, hidden }));
      }
      return results;
    case 'focus':
      results.push(...collectAnnotatedNodes(node.child, { focused: node.focused, hidden }));
      return results;
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      results.push(...collectAnnotatedNodes(node.child, { ...inherited, hidden }));
      return results;
    case 'component':
    case 'memo':
      results.push(...collectAnnotatedNodes(node.render(), { ...inherited, hidden }));
      return results;
    case 'suspense':
      results.push(...collectAnnotatedNodes(node.resolved ? node.child : node.fallback, { ...inherited, hidden }));
      return results;
    case 'localState':
    case 'lazy':
      return results;
    case 'tabGroup':
      for (const child of node.children) {
        results.push(...collectAnnotatedNodes(child, { ...inherited, hidden }));
      }
      return results;
  }
}

interface PositionedCollectedNode extends CollectedNode {
  rect: LayoutRect;
}

/**
 * Collect semantic nodes from the actual layout plan so composite widgets use
 * their own painted rectangle instead of a best-effort whole-line text match.
 */
function collectPositionedNodes(
  entry: LayoutEntry,
  inherited: { focused?: boolean; hidden?: boolean; disabled?: boolean } = {},
  acc = new Map<VNode, PositionedCollectedNode>(),
): Map<VNode, PositionedCollectedNode> {
  const meta = getVNodeMeta(entry.node);
  const hidden = inherited.hidden === true || meta?.a11y?.hidden === true;
  const disabled = inherited.disabled === true || meta?.a11y?.disabled === true;
  const focused = entry.node.kind === 'focus' ? entry.node.focused : inherited.focused;

  if (meta?.testId || meta?.a11y) {
    const positioned: PositionedCollectedNode = {
      node: entry.node,
      testId: meta.testId,
      a11y: meta.a11y,
      focused: inherited.focused,
      hidden,
      disabled,
      textContent: extractNodeText(entry.node),
      rect: entry.rect,
    };
    const existing = acc.get(entry.node);
    const existingArea = existing ? existing.rect.width * existing.rect.height : -1;
    const positionedArea = positioned.rect.width * positioned.rect.height;
    if (!existing || positionedArea > existingArea) acc.set(entry.node, positioned);
  }

  for (const child of entry.children) {
    collectPositionedNodes(child, { focused, hidden, disabled }, acc);
  }
  return acc;
}

function collectFocusCandidates(
  node: VNode,
  acc: FocusCandidate[] = [],
  inheritedHidden = false,
  inheritedDisabled = false,
): FocusCandidate[] {
  const nodeMeta = getVNodeMeta(node);
  const hidden = inheritedHidden || nodeMeta?.a11y?.hidden === true;
  const disabled = inheritedDisabled || nodeMeta?.a11y?.disabled === true;
  switch (node.kind) {
    case 'focus': {
      const ownMeta = nodeMeta;
      const annotated = collectAnnotatedNodes(node.child, { focused: node.focused, hidden }).find((found) => found.a11y || found.testId);
      const text = normalizeText(annotated?.textContent ?? extractNodeText(node.child));
      const a11y = ownMeta?.a11y ? { ...annotated?.a11y, ...ownMeta.a11y } : annotated?.a11y;

      const visibleAndEnabled = !hidden && !disabled && a11y?.hidden !== true && a11y?.disabled !== true;
      if (visibleAndEnabled && (text.length > 0 || ownMeta?.testId || annotated?.testId)) {
        acc.push({
          focusId: node.id,
          text,
          focused: node.focused,
          role: a11y?.role,
          a11y,
          testId: ownMeta?.testId ?? annotated?.testId,
        });
      }

      collectFocusCandidates(node.child, acc, hidden, disabled);
      return acc;
    }
    case 'row':
    case 'column':
    case 'box':
      for (const child of node.children) {
        collectFocusCandidates(child, acc, hidden, disabled);
      }
      return acc;
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      collectFocusCandidates(node.child, acc, hidden, disabled);
      return acc;
    case 'component':
    case 'memo':
      collectFocusCandidates(node.render(), acc, hidden, disabled);
      return acc;
    case 'suspense':
      collectFocusCandidates(node.resolved ? node.child : node.fallback, acc, hidden, disabled);
      return acc;
    case 'localState':
    case 'lazy':
      return acc;
    case 'tabGroup':
      for (const child of node.children) {
        collectFocusCandidates(child, acc, hidden, disabled);
      }
      return acc;
    case 'text':
    case 'empty':
    case 'image':
      return acc;
  }
}

function findBestTextRun(text: string, runs: readonly AutomationTextRun[]): AutomationTextRun | null {
  const normalized = normalizeText(text);
  if (normalized.length === 0) return null;

  const exact = runs.find((run) => normalizeText(run.text) === normalized);
  if (exact) return exact;

  const inclusive = runs.find((run) => {
    const runText = normalizeText(run.text);
    return runText.includes(normalized) || normalized.includes(runText);
  });

  return inclusive ?? null;
}

function buildElementId(role: AriaRole | undefined, label: string, testId: string | undefined, run: AutomationTextRun | null): string {
  if (testId) return `testId:${testId}`;
  if (role && label.length > 0) return `role:${role}:${label}`;
  if (label.length > 0) return `text:${label}:${run?.row ?? 0}:${run?.col ?? 0}`;
  return `pos:${run?.row ?? 0}:${run?.col ?? 0}`;
}

function buildActionId(label: string, focusId?: string, testId?: string, role?: AriaRole, run?: AutomationTextRun | null): string {
  if (focusId) return `focus:${focusId}`;
  if (testId) return `testId:${testId}`;
  if (role && label.length > 0) return `role:${role}:${label}`;
  if (label.length > 0) return `text:${label}:${run?.row ?? 0}:${run?.col ?? 0}`;
  return `pos:${run?.row ?? 0}:${run?.col ?? 0}`;
}

function buildElementSnapshot(node: CollectedNode, run: AutomationTextRun | null): AutomationElementSnapshot {
  const text = normalizeText(node.textContent);
  return {
    id: buildElementId(node.a11y?.role, node.a11y?.label ?? text, node.testId, run),
    text,
    row: run?.row ?? 0,
    col: run?.col ?? 0,
    width: run?.width ?? Math.max(text.length, 1),
    height: run?.height ?? 1,
    role: node.a11y?.role,
    a11y: node.a11y,
    testId: node.testId,
    focused: node.focused === true,
    hidden: node.hidden === true,
    disabled: node.disabled === true,
    selected: node.a11y?.selected,
    expanded: node.a11y?.expanded,
  };
}

function buildActionSnapshot(
  label: string,
  run: AutomationTextRun | null,
  source: 'focus' | 'role',
  options?: {
    role?: AriaRole;
    a11y?: AriaAttrs;
    testId?: string;
    focusId?: string;
    focused?: boolean;
  },
): AutomationActionSnapshot {
  const text = normalizeText(label);
  return {
    id: buildActionId(text, options?.focusId, options?.testId, options?.role, run),
    label: text,
    text,
    row: run?.row ?? 0,
    col: run?.col ?? 0,
    width: run?.width ?? Math.max(text.length, 1),
    height: run?.height ?? 1,
    role: options?.role,
    a11y: options?.a11y,
    testId: options?.testId,
    focusId: options?.focusId,
    focused: options?.focused === true,
    disabled: options?.a11y?.disabled,
    selected: options?.a11y?.selected,
    expanded: options?.a11y?.expanded,
    source,
  };
}

function shouldKeepRoleElement(element: AutomationElementSnapshot): boolean {
  if (element.role !== 'listitem') return true;
  return element.selected !== undefined || element.a11y?.checked !== undefined;
}

function dedupeActions(actions: AutomationActionSnapshot[]): AutomationActionSnapshot[] {
  const deduped = new Map<string, AutomationActionSnapshot>();

  for (const action of actions) {
    const key = action.focusId
      ? `focus:${action.focusId}`
      : action.testId
        ? `testId:${action.testId}`
        : `${action.role ?? 'text'}:${action.label.toLowerCase()}:${action.row}:${action.col}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, action);
      continue;
    }

    const preferred = action.focused && !existing.focused ? action : action.focusId && !existing.focusId ? action : existing;

    deduped.set(key, preferred);
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.col !== b.col) return a.col - b.col;
    if (a.source !== b.source) return a.source === 'focus' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function positionedRun(node: PositionedCollectedNode, fallbackRuns: readonly AutomationTextRun[]): AutomationTextRun | null {
  if (node.rect.width > 0 && node.rect.height > 0) {
    return {
      text: node.textContent,
      row: node.rect.y,
      col: node.rect.x,
      width: node.rect.width,
      height: node.rect.height,
    };
  }
  return findBestTextRun(node.a11y?.label ?? node.textContent, fallbackRuns);
}

function buildSnapshotElements(root: VNode, grid: CellGrid, cols: number, rows: number, layoutPlan?: LayoutPlan): AutomationElementSnapshot[] {
  const runs = extractAutomationTextRuns(grid);
  const plan = layoutPlan ?? planLayout(root, cols, rows);
  const positioned = collectPositionedNodes(plan.root);
  for (const overlay of plan.overlays) collectPositionedNodes(overlay.entry, {}, positioned);
  const nodes = [...positioned.values()];
  const elements = nodes.map((node) => buildElementSnapshot(node, positionedRun(node, runs)));

  return elements.filter((element) => !element.hidden);
}

function buildSnapshotActions(root: VNode, elements: readonly AutomationElementSnapshot[]): AutomationActionSnapshot[] {
  const actions: AutomationActionSnapshot[] = [];
  const interactiveElements = elements
    .filter((element) => element.disabled !== true && element.role && INTERACTIVE_ROLES.includes(element.role))
    .filter(shouldKeepRoleElement);
  const usedElementIds = new Set<string>();

  for (const candidate of collectFocusCandidates(root)) {
    if (candidate.a11y?.disabled === true || candidate.a11y?.hidden === true) continue;
    const label = normalizeText(candidate.a11y?.label ?? candidate.text);
    const match = interactiveElements.find((element) => {
      if (usedElementIds.has(element.id)) return false;
      if (candidate.testId && element.testId === candidate.testId) return true;
      if (candidate.role && element.role === candidate.role && label.length > 0) {
        return normalizeText(element.a11y?.label ?? element.text) === label;
      }
      if (label.length > 0) {
        const elementLabel = normalizeText(element.a11y?.label ?? element.text);
        return elementLabel === label || normalizeText(element.text) === normalizeText(candidate.text);
      }
      return false;
    });

    if (match) {
      usedElementIds.add(match.id);
    }

    actions.push(
      buildActionSnapshot(label, match ?? null, 'focus', {
        role: candidate.role ?? match?.role,
        a11y: candidate.a11y ?? match?.a11y,
        testId: candidate.testId ?? match?.testId,
        focusId: candidate.focusId,
        focused: candidate.focused,
      }),
    );
  }

  for (const element of interactiveElements) {
    if (usedElementIds.has(element.id)) continue;
    const label = normalizeText(element.a11y?.label ?? element.text);
    actions.push(
      buildActionSnapshot(label, element, 'role', {
        role: element.role,
        a11y: element.a11y,
        testId: element.testId,
        focused: element.focused,
      }),
    );
  }

  return dedupeActions(actions);
}

export function buildAutomationSnapshot(root: VNode, grid: CellGrid, cols: number, rows: number, layoutPlan?: LayoutPlan): AutomationSnapshot {
  const elements = buildSnapshotElements(root, grid, cols, rows, layoutPlan);
  const actions = buildSnapshotActions(root, elements);
  const focusedActionId = actions.find((action) => action.focused)?.id ?? null;

  return {
    text: gridToText(grid),
    size: { cols, rows },
    elements,
    actions,
    focusedActionId,
    audit: auditA11yTree(root),
  };
}
