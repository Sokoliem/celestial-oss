/**
 * Static VNode rendering utilities.
 *
 * Render a VNode tree to plain text without needing the full app runtime.
 * Useful for snapshot-style assertions in tests.
 */

import type { LayoutEntry, LayoutPlan, VNode } from '@celestial/core/nebula';
import { gridToPlainLines } from './internal/grid-text.js';
import { renderGrid } from './internal/render-grid.js';

export interface RenderOptions {
  /** Width of the virtual terminal (default: 80 columns) */
  width?: number;
  /** Height of the virtual terminal (default: 24 rows) */
  height?: number;
}

export interface RenderProfileDescriptor extends RenderOptions {
  vnode: VNode | (() => VNode);
}

export interface RenderProfileResult {
  avgTimeMs: number;
  peakMemoryBytes: number;
  vnodeCount: number;
}

/**
 * Render a VNode to a multi-line plain text string.
 * Trailing whitespace on each line is trimmed.
 */
export function renderToText(vnode: VNode, options?: RenderOptions): string {
  return renderToLines(vnode, options).join('\n');
}

/**
 * Render a VNode to an array of strings, one per line.
 * Trailing whitespace on each line is trimmed.
 */
export function renderToLines(vnode: VNode, options?: RenderOptions): string[] {
  const rendered = renderGrid(vnode, options);
  return rendered ? gridToPlainLines(rendered.grid) : [];
}

export function profileRender(descriptor: VNode | RenderProfileDescriptor | (() => VNode), iterations = 10): RenderProfileResult {
  if (!Number.isFinite(iterations)) throw new RangeError('Profile iterations must be finite.');
  const totalIterations = Math.max(1, Math.min(1_000_000, Math.floor(iterations)));
  let totalTimeMs = 0;
  let peakMemoryBytes = 0;
  let vnodeCount = 0;

  for (let i = 0; i < totalIterations; i++) {
    const { vnode, options } = resolveProfileDescriptor(descriptor);
    const beforeMemory = readHeapUsed();
    const start = performance.now();
    const rendered = renderGrid(vnode, options);
    totalTimeMs += performance.now() - start;
    const afterMemory = readHeapUsed();
    peakMemoryBytes = Math.max(peakMemoryBytes, Math.max(afterMemory - beforeMemory, 0));
    vnodeCount = Math.max(vnodeCount, rendered ? countPlanEntries(rendered.plan) : 0);
  }

  return {
    avgTimeMs: totalTimeMs / totalIterations,
    peakMemoryBytes,
    vnodeCount,
  };
}

function resolveProfileDescriptor(descriptor: VNode | RenderProfileDescriptor | (() => VNode)): { vnode: VNode; options?: RenderOptions } {
  if (typeof descriptor === 'function') {
    return { vnode: descriptor() };
  }

  if ('kind' in descriptor) {
    return { vnode: descriptor };
  }

  return {
    vnode: typeof descriptor.vnode === 'function' ? descriptor.vnode() : descriptor.vnode,
    options: { width: descriptor.width, height: descriptor.height },
  };
}

function countPlanEntries(plan: LayoutPlan): number {
  const countEntry = (entry: LayoutEntry): number => 1 + entry.children.reduce((sum, child) => sum + countEntry(child), 0);
  return countEntry(plan.root) + plan.overlays.reduce((sum, overlay) => sum + countEntry(overlay.entry), 0);
}

function readHeapUsed(): number {
  if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
    return 0;
  }

  return process.memoryUsage().heapUsed;
}
