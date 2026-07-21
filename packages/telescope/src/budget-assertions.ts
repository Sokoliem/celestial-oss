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
  if (!Number.isFinite(budgetMs) || budgetMs < 0) throw new RangeError('Render budget must be a non-negative finite number.');
  const requestedIterations = options?.iterations ?? 10;
  if (!Number.isFinite(requestedIterations)) throw new RangeError('Render iterations must be finite.');
  const iterations = Math.max(1, Math.min(1_000_000, Math.floor(requestedIterations)));
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
  if (!Number.isFinite(maxNodes) || maxNodes < 0) throw new RangeError('Maximum node count must be a non-negative finite number.');
  const normalizedMax = Math.floor(maxNodes);
  const count = countNodes(tree);
  return {
    passed: count <= normalizedMax,
    count,
    max: normalizedMax,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────

function countNodes(node: unknown): number {
  if (node === null || node === undefined || typeof node !== 'object') {
    return 0;
  }

  const active = new WeakSet<object>();
  const stack: Array<{ value: object; exiting: boolean }> = [{ value: node, exiting: false }];
  let count = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exiting) {
      active.delete(frame.value);
      continue;
    }
    if (active.has(frame.value)) continue;

    count++;
    active.add(frame.value);
    stack.push({ value: frame.value, exiting: true });

    const record = frame.value as Record<string, unknown>;
    const child = record.child;
    if (typeof child === 'object' && child !== null) stack.push({ value: child, exiting: false });
    if (Array.isArray(record.children)) {
      for (let index = record.children.length - 1; index >= 0; index--) {
        const candidate = record.children[index];
        if (typeof candidate === 'object' && candidate !== null) stack.push({ value: candidate, exiting: false });
      }
    }
  }

  return count;
}
