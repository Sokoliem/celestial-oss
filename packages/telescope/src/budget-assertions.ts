/**
 * Render budget assertions for Telescope.
 *
 * Provides performance-oriented assertions to verify that rendering stays
 * within time budgets and that VNode trees do not exceed complexity limits.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface RenderBudgetResult {
  /** Whether the render stayed within the budget. */
  passed: boolean;
  /** Average render time in milliseconds. */
  avgMs: number;
  /** Maximum render time in milliseconds. */
  maxMs: number;
  /** Number of iterations executed. */
  iterations: number;
  /** The budget in milliseconds that was asserted against. */
  budget: number;
}

export interface NodeCountResult {
  /** Whether the node count is within the limit. */
  passed: boolean;
  /** Actual node count. */
  count: number;
  /** Maximum allowed. */
  max: number;
}

export interface RenderBudgetOptions {
  /** Number of iterations to run (default: 10). */
  iterations?: number;
}

// ── Implementation ─────────────────────────────────────────────────────

/**
 * Assert that a render function completes within a time budget.
 *
 * Runs `renderFn` for `iterations` (default 10) and checks that the
 * average execution time stays within `budgetMs`.
 */
export function assertRenderWithinBudget(renderFn: () => unknown, budgetMs: number, options?: RenderBudgetOptions): RenderBudgetResult {
  const iterations = Math.max(1, Math.floor(options?.iterations ?? 10));
  let totalMs = 0;
  let maxMs = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    renderFn();
    const elapsed = performance.now() - start;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);
  }

  const avgMs = totalMs / iterations;

  return {
    passed: avgMs <= budgetMs,
    avgMs,
    maxMs,
    iterations,
    budget: budgetMs,
  };
}

/**
 * Assert that a VNode tree (or generic tree object) does not exceed
 * a maximum node count.
 *
 * The tree is walked recursively: any object with `children` (array) or
 * `child` (object) properties is counted as a node. Primitive values
 * encountered in child arrays are skipped.
 */
export function assertNodeCount(tree: unknown, maxNodes: number): NodeCountResult {
  const count = countNodes(tree);
  return {
    passed: count <= maxNodes,
    count,
    max: maxNodes,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────

function countNodes(node: unknown): number {
  if (node === null || node === undefined || typeof node !== 'object') {
    return 0;
  }

  const obj = node as Record<string, unknown>;
  let count = 1; // count self

  // Array of children
  if (Array.isArray(obj.children)) {
    for (const child of obj.children) {
      if (typeof child === 'object' && child !== null) {
        count += countNodes(child);
      }
    }
  }

  // Single child
  if (typeof obj.child === 'object' && obj.child !== null) {
    count += countNodes(obj.child);
  }

  return count;
}
