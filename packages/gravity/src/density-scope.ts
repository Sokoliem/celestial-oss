/**
 * `densityScope` — propagates a density preference (compact / cozy /
 * comfortable) down a subtree. Components opt in by reading the resolved
 * density via `useDensity()`.
 *
 * Design-system review Phase 7.5 / F8. Lives in gravity because density is
 * a layout concern (it affects spacing, gaps, padding) and gravity already
 * owns the responsive / breakpoint primitives that gate similar behavior.
 *
 * Implementation: a simple module-level stack that view functions can push
 * onto via `withDensity()` and read from via `currentDensity()`. The stack
 * is unwound when `withDensity` returns. Suitable for synchronous render
 * passes; not safe for cross-tick state.
 *
 * @experimental — Stability per ADR 0003.
 */

export type Density = 'compact' | 'cozy' | 'comfortable';

export const DEFAULT_DENSITY: Density = 'cozy';

/**
 * Spacing scale tuned per density. Components that read `currentDensity()`
 * may consult this table or compute their own.
 */
export const DENSITY_SPACING: Record<Density, { padding: number; gap: number; rowHeight: number }> = {
  compact: { padding: 0, gap: 0, rowHeight: 1 },
  cozy: { padding: 1, gap: 1, rowHeight: 2 },
  comfortable: { padding: 2, gap: 2, rowHeight: 3 },
};

// Stack-based scope so nested density() blocks compose predictably.
const densityStack: Density[] = [];

/**
 * Read the current density. Returns the topmost density on the stack, or
 * `DEFAULT_DENSITY` if no scope is active.
 */
export function currentDensity(): Density {
  return densityStack[densityStack.length - 1] ?? DEFAULT_DENSITY;
}

/**
 * Run `fn` inside a density scope. The scope pushes `density` onto the
 * stack, invokes `fn`, then pops (always — even if `fn` throws).
 *
 * Example:
 *   const compactView = withDensity('compact', () => myList.view(model));
 */
export function withDensity<T>(density: Density, fn: () => T): T {
  densityStack.push(density);
  try {
    return fn();
  } finally {
    densityStack.pop();
  }
}

/**
 * Convenience: resolve the spacing tuple for the current density.
 */
export function densitySpacing(): { padding: number; gap: number; rowHeight: number } {
  return DENSITY_SPACING[currentDensity()];
}

/**
 * Reset the density stack. Test-only escape hatch — production code should
 * always pair push/pop via `withDensity()`.
 *
 * @internal
 */
export function _resetDensityStackForTests(): void {
  densityStack.length = 0;
}
