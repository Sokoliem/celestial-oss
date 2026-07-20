/**
 * Testing Library-style queries for Telescope.
 *
 * Find elements by visible text, ARIA role, test ID, or label.
 */

import { type AriaAttrs, type AriaRole, type LayoutPlan, planLayout, rasterize, type VNode } from '@celestial/core/nebula';
import { visualWidth } from '@celestial/core/corona';
import { setMeta } from './metadata.js';
import { collectNodesFromPlan, extractTextRuns, type FoundNode, type FoundNodeSelectorInfo, findFocusNodeFromPlan, type TextRun } from './tree.js';
import type { QueryResult, TerminalPreset, TextMatch } from './types.js';

// ── VNode Annotation Helpers ────────────────────────────────────────────

/**
 * Annotate a VNode with a test ID for query lookup.
 * Returns the same VNode (metadata is stored in a WeakMap side-channel).
 */
export function testId(id: string, node: VNode): VNode {
  setMeta(node, { testId: id });
  return node;
}

/**
 * Annotate a VNode with ARIA attributes for a11y queries.
 * Returns the same VNode (metadata is stored in a WeakMap side-channel).
 */
export function a11y(attrs: AriaAttrs, node: VNode): VNode {
  setMeta(node, { a11y: attrs });
  return node;
}

// ── Query Engine ────────────────────────────────────────────────────────

export interface RoleQueryOptions {
  /** Filter by accessible name (label) */
  name?: TextMatch;
  /** Include nodes with aria-hidden=true */
  hidden?: boolean;
}

export interface LabelQueryOptions {
  /** Include nodes with aria-hidden=true */
  hidden?: boolean;
}

export type Selector = string;

export interface QueryEngine {
  getByText(matcher: TextMatch): QueryResult;
  getAllByText(matcher: TextMatch): QueryResult[];
  queryByText(matcher: TextMatch): QueryResult | null;
  queryAllByText(matcher: TextMatch): QueryResult[];
  getByTestId(id: string): QueryResult;
  getAllByTestId(id: string): QueryResult[];
  queryByTestId(id: string): QueryResult | null;
  queryAllByTestId(id: string): QueryResult[];
  getByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult;
  getAllByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult[];
  queryByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult | null;
  queryAllByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult[];
  getByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult;
  getAllByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult[];
  queryByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult | null;
  queryAllByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult[];
  getBySelector(selector: Selector): QueryResult;
  getAllBySelector(selector: Selector): QueryResult[];
  queryBySelector(selector: Selector): QueryResult | null;
  queryAllBySelector(selector: Selector): QueryResult[];
}

type SelectorSegment = { kind: 'id'; value: string } | { kind: 'class'; value: string } | { kind: 'test-id'; value: string } | { kind: 'role'; value: string };

class QueryNotFoundError extends Error {
  override readonly name = 'QueryNotFoundError';
}

/** Create a query engine from a VNode tree and fixed terminal dimensions. */
export function createQueryEngine(getView: () => VNode, cols: number, rows: number): QueryEngine;
/** Create a query engine whose terminal dimensions are resolved for every query. */
export function createQueryEngine(getView: () => VNode, getViewport: () => TerminalPreset): QueryEngine;
export function createQueryEngine(getView: () => VNode, colsOrViewport: number | (() => TerminalPreset), rows?: number): QueryEngine {
  function currentViewport(): TerminalPreset {
    const viewport = typeof colsOrViewport === 'function' ? colsOrViewport() : { cols: colsOrViewport, rows: rows ?? 0 };
    if (!Number.isFinite(viewport.cols) || !Number.isFinite(viewport.rows) || viewport.cols <= 0 || viewport.rows <= 0) {
      throw new RangeError('Query viewport dimensions must be positive finite numbers.');
    }
    const normalizedCols = Math.floor(viewport.cols);
    const normalizedRows = Math.floor(viewport.rows);
    if (normalizedCols < 1 || normalizedRows < 1) throw new RangeError('Query viewport dimensions must be at least 1 cell.');
    return { cols: normalizedCols, rows: normalizedRows };
  }

  function currentSnapshot(): { plan: LayoutPlan; nodes: FoundNode[]; runs: TextRun[] } {
    const tree = getView();
    const { cols, rows } = currentViewport();
    const plan = planLayout(tree, cols, rows);
    return {
      plan,
      nodes: collectNodesFromPlan(plan),
      runs: extractTextRuns(rasterize(plan)),
    };
  }

  function matchText(matcher: TextMatch, text: string): boolean {
    if (typeof matcher === 'string') return text === matcher;
    matcher.lastIndex = 0;
    const matches = matcher.test(text);
    matcher.lastIndex = 0;
    return matches;
  }

  function buildResult(run: TextRun, nodeInfo?: FoundNode): QueryResult {
    return {
      text: run.text,
      row: run.row,
      col: run.col,
      width: run.width,
      height: 1,
      id: nodeInfo?.id,
      classes: nodeInfo?.classes,
      states: nodeInfo?.states,
      label: nodeInfo?.label,
      role: nodeInfo?.a11y?.role,
      a11y: nodeInfo?.a11y,
      testId: nodeInfo?.testId,
      style: run.style,
      focused: nodeInfo?.focused,
      node: nodeInfo?.node,
    };
  }

  function findNodeForText(text: string, nodes: readonly FoundNode[]): FoundNode | undefined {
    return nodes.find((n) => {
      const nt = n.textContent.trim();
      return nt === text || nt.includes(text);
    });
  }

  function enrichFocus(result: QueryResult, text: string, plan: LayoutPlan): void {
    const state = findFocusNodeFromPlan(text, plan);
    if (state !== undefined) result.focused = state;
  }

  function buildNodeResult(found: FoundNode, runs: TextRun[]): QueryResult {
    const textContent = found.textContent.trim();
    const run = runs.find((r) => r.text === textContent || textContent.includes(r.text));
    return {
      text: textContent,
      row: run?.row ?? 0,
      col: run?.col ?? 0,
      width: run?.width ?? visualWidth(textContent),
      height: 1,
      id: found.id,
      classes: found.classes,
      states: found.states,
      label: found.label,
      role: found.a11y?.role,
      a11y: found.a11y,
      testId: found.testId,
      style: run?.style,
      focused: found.focused,
      node: found.node,
    };
  }

  function isAccessible(node: FoundNode, includeHidden = false): boolean {
    return includeHidden || node.hidden !== true;
  }

  function parseSelector(selector: Selector): SelectorSegment[] {
    const segments = selector
      .trim()
      .split(/\s+/)
      .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      throw new Error('Selector cannot be empty.');
    }

    return segments.map((segment) => {
      if (segment.startsWith('#') && segment.length > 1) {
        return { kind: 'id', value: segment.slice(1) };
      }

      if (segment.startsWith('.') && segment.length > 1) {
        return { kind: 'class', value: segment.slice(1) };
      }

      const attributeMatch = segment.match(/^\[(test-id|role)="([^"]+)"\]$/);
      if (attributeMatch) {
        return {
          kind: attributeMatch[1] as 'test-id' | 'role',
          value: attributeMatch[2]!,
        };
      }

      throw new Error(`Unsupported selector segment '${segment}'. Supported selectors: #id, .class, [test-id="..."], [role="..."].`);
    });
  }

  function matchesSelectorInfo(info: FoundNodeSelectorInfo | FoundNode, segment: SelectorSegment): boolean {
    switch (segment.kind) {
      case 'id':
        return info.id === segment.value;
      case 'class':
        return info.classes?.includes(segment.value) === true;
      case 'test-id':
        return info.testId === segment.value;
      case 'role':
        return info.a11y?.role === segment.value;
    }
  }

  function matchesSelector(node: FoundNode, segments: readonly SelectorSegment[]): boolean {
    if (!matchesSelectorInfo(node, segments[segments.length - 1]!)) {
      return false;
    }

    let ancestorIndex = node.ancestors.length - 1;
    for (let index = segments.length - 2; index >= 0; index--) {
      let matched = false;

      while (ancestorIndex >= 0) {
        if (matchesSelectorInfo(node.ancestors[ancestorIndex]!, segments[index]!)) {
          matched = true;
          ancestorIndex--;
          break;
        }

        ancestorIndex--;
      }

      if (!matched) {
        return false;
      }
    }

    return true;
  }

  // ── Query implementations ────────────────────────────────────────

  function getByText(matcher: TextMatch): QueryResult {
    const { runs, nodes, plan } = currentSnapshot();

    for (const run of runs) {
      if (matchText(matcher, run.text)) {
        const r = buildResult(run, findNodeForText(run.text, nodes));
        enrichFocus(r, run.text, plan);
        return r;
      }
    }

    const fullText = runs.map((r) => r.text).join(' ');
    if (typeof matcher === 'string' && fullText.includes(matcher) && runs[0]) {
      return buildResult({ text: matcher, row: runs[0].row, col: runs[0].col, width: visualWidth(matcher) });
    }

    const avail = runs.map((r) => `'${r.text}'`).join(', ');
    throw new QueryNotFoundError(`Unable to find element with text matching ${fmt(matcher)}. Found: [${avail}]`);
  }

  function getAllByText(matcher: TextMatch): QueryResult[] {
    const { runs, nodes, plan } = currentSnapshot();
    const results: QueryResult[] = [];

    for (const run of runs) {
      if (matchText(matcher, run.text)) {
        const r = buildResult(run, findNodeForText(run.text, nodes));
        enrichFocus(r, run.text, plan);
        results.push(r);
      }
    }

    if (results.length === 0) {
      const avail = runs.map((r) => `'${r.text}'`).join(', ');
      throw new QueryNotFoundError(`Unable to find any elements with text matching ${fmt(matcher)}. Found: [${avail}]`);
    }
    return results;
  }

  function queryByText(m: TextMatch): QueryResult | null {
    try {
      return getByText(m);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return null;
    }
  }

  function queryAllByText(matcher: TextMatch): QueryResult[] {
    try {
      return getAllByText(matcher);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return [];
    }
  }

  function getByTestId(id: string): QueryResult {
    const { nodes: allNodes, runs } = currentSnapshot();
    const found = allNodes.find((n) => n.testId === id);
    if (!found) {
      const ids = allNodes.filter((n) => n.testId).map((n) => `'${n.testId}'`);
      throw new QueryNotFoundError(
        `Unable to find element with test ID '${id}'. ` + (ids.length > 0 ? `Available test IDs: [${ids.join(', ')}]` : 'No elements have test IDs.'),
      );
    }
    return buildNodeResult(found, runs);
  }

  function queryByTestId(id: string): QueryResult | null {
    try {
      return getByTestId(id);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return null;
    }
  }

  function getAllByTestId(id: string): QueryResult[] {
    const { nodes: allNodes, runs } = currentSnapshot();
    const found = allNodes.filter((n) => n.testId === id);
    if (found.length === 0) {
      const ids = allNodes.filter((n) => n.testId).map((n) => `'${n.testId}'`);
      throw new QueryNotFoundError(
        `Unable to find any elements with test ID '${id}'. ` + (ids.length > 0 ? `Available test IDs: [${ids.join(', ')}]` : 'No elements have test IDs.'),
      );
    }
    return found.map((node) => buildNodeResult(node, runs));
  }

  function queryAllByTestId(id: string): QueryResult[] {
    try {
      return getAllByTestId(id);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return [];
    }
  }

  function getByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult {
    const { nodes: allNodes, runs } = currentSnapshot();
    let cands = allNodes.filter((n) => n.a11y?.role === role && isAccessible(n, options?.hidden));
    if (options?.name) {
      cands = cands.filter((n) => n.a11y?.label && matchText(options.name!, n.a11y!.label!));
    }
    if (cands.length === 0) {
      const roles = [...new Set(allNodes.filter((n) => n.a11y?.role).map((n) => n.a11y!.role!))];
      const suffix = options?.name ? ` and name ${fmt(options.name)}` : '';
      throw new QueryNotFoundError(
        `Unable to find element with role '${role}'${suffix}. ` +
          (roles.length > 0 ? `Available roles: [${roles.map((r) => `'${r}'`).join(', ')}]` : 'No elements have ARIA roles.'),
      );
    }
    return buildNodeResult(cands[0]!, runs);
  }

  function getAllByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult[] {
    const { nodes: allNodes, runs } = currentSnapshot();
    let cands = allNodes.filter((n) => n.a11y?.role === role && isAccessible(n, options?.hidden));
    if (options?.name) {
      cands = cands.filter((n) => n.a11y?.label && matchText(options.name!, n.a11y!.label!));
    }
    if (cands.length === 0) {
      const suffix = options?.name ? ` and name ${fmt(options.name)}` : '';
      throw new QueryNotFoundError(`Unable to find any elements with role '${role}'${suffix}.`);
    }
    return cands.map((c) => buildNodeResult(c, runs));
  }

  function queryByRole(role: AriaRole, opts?: RoleQueryOptions): QueryResult | null {
    try {
      return getByRole(role, opts);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return null;
    }
  }

  function queryAllByRole(role: AriaRole, options?: RoleQueryOptions): QueryResult[] {
    const { nodes: allNodes, runs } = currentSnapshot();
    let cands = allNodes.filter((n) => n.a11y?.role === role && isAccessible(n, options?.hidden));
    if (options?.name) {
      cands = cands.filter((n) => n.a11y?.label && matchText(options.name!, n.a11y!.label!));
    }
    if (cands.length === 0) {
      return [];
    }
    return cands.map((c) => buildNodeResult(c, runs));
  }

  function getByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult {
    const { nodes: allNodes, runs } = currentSnapshot();
    const found = allNodes.find((n) => isAccessible(n, options?.hidden) && n.a11y?.label && matchText(matcher, n.a11y!.label!));
    if (!found) {
      const labels = allNodes.filter((n) => n.a11y?.label).map((n) => `'${n.a11y!.label}'`);
      throw new QueryNotFoundError(
        `Unable to find element with label matching ${fmt(matcher)}. ` +
          (labels.length > 0 ? `Available labels: [${labels.join(', ')}]` : 'No elements have ARIA labels.'),
      );
    }
    return buildNodeResult(found, runs);
  }

  function getAllByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult[] {
    const { nodes: allNodes, runs } = currentSnapshot();
    const found = allNodes.filter((n) => isAccessible(n, options?.hidden) && n.a11y?.label && matchText(matcher, n.a11y!.label!));
    if (found.length === 0) {
      const labels = allNodes.filter((n) => n.a11y?.label).map((n) => `'${n.a11y!.label}'`);
      throw new QueryNotFoundError(
        `Unable to find any elements with label matching ${fmt(matcher)}. ` +
          (labels.length > 0 ? `Available labels: [${labels.join(', ')}]` : 'No elements have ARIA labels.'),
      );
    }
    return found.map((node) => buildNodeResult(node, runs));
  }

  function queryByLabel(m: TextMatch, options?: LabelQueryOptions): QueryResult | null {
    try {
      return getByLabel(m, options);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return null;
    }
  }

  function queryAllByLabel(matcher: TextMatch, options?: LabelQueryOptions): QueryResult[] {
    try {
      return getAllByLabel(matcher, options);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return [];
    }
  }

  function getBySelector(selector: Selector): QueryResult {
    const segments = parseSelector(selector);
    const { nodes, runs } = currentSnapshot();
    const matches = nodes.filter((node) => matchesSelector(node, segments));
    if (matches.length === 0) {
      throw new QueryNotFoundError(`Unable to find element matching selector ${fmt(selector)}.`);
    }

    return buildNodeResult(matches[0]!, runs);
  }

  function getAllBySelector(selector: Selector): QueryResult[] {
    const segments = parseSelector(selector);
    const { nodes, runs } = currentSnapshot();
    const matches = nodes.filter((node) => matchesSelector(node, segments));
    if (matches.length === 0) {
      throw new QueryNotFoundError(`Unable to find any elements matching selector ${fmt(selector)}.`);
    }

    return matches.map((node) => buildNodeResult(node, runs));
  }

  function queryBySelector(selector: Selector): QueryResult | null {
    try {
      return getBySelector(selector);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return null;
    }
  }

  function queryAllBySelector(selector: Selector): QueryResult[] {
    try {
      return getAllBySelector(selector);
    } catch (error) {
      if (!(error instanceof QueryNotFoundError)) throw error;
      return [];
    }
  }

  return {
    getByText,
    getAllByText,
    queryByText,
    queryAllByText,
    getByTestId,
    queryByTestId,
    getAllByTestId,
    queryAllByTestId,
    getByRole,
    getAllByRole,
    queryByRole,
    queryAllByRole,
    getByLabel,
    getAllByLabel,
    queryByLabel,
    queryAllByLabel,
    getBySelector,
    getAllBySelector,
    queryBySelector,
    queryAllBySelector,
  };
}

function fmt(m: TextMatch): string {
  return typeof m === 'string' ? `'${m}'` : `${m}`;
}
