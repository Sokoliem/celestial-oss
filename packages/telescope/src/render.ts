/**
 * Static VNode rendering utilities.
 *
 * Render a VNode tree to plain text without needing the full app runtime.
 * Useful for snapshot-style assertions in tests.
 */

import { type CellGrid, layout, measure, type VNode } from '@celestial/core/nebula';

export interface RenderOptions {
  /** Width of the virtual terminal (default: auto-measured) */
  width?: number;
  /** Height of the virtual terminal (default: auto-measured) */
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
  const size = measure(vnode);
  const width = options?.width ?? size.width;
  const height = options?.height ?? size.height;

  if (width <= 0 || height <= 0) {
    return [];
  }

  const grid: CellGrid = layout(vnode, width, height);
  const lines: string[] = [];

  for (let r = 0; r < grid.height; r++) {
    let line = '';
    const row = grid.cells[r];
    if (row) {
      for (let c = 0; c < grid.width; c++) {
        const cell = row[c];
        line += cell ? cell.char : ' ';
      }
    }
    lines.push(line.trimEnd());
  }

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

export function profileRender(descriptor: VNode | RenderProfileDescriptor | (() => VNode), iterations = 10): RenderProfileResult {
  const totalIterations = Math.max(1, Math.floor(iterations));
  let totalTimeMs = 0;
  let peakMemoryBytes = 0;
  let vnodeCount = 0;

  for (let i = 0; i < totalIterations; i++) {
    const { vnode, options } = resolveProfileDescriptor(descriptor);
    const beforeMemory = readHeapUsed();
    const start = performance.now();
    renderToLines(vnode, options);
    totalTimeMs += performance.now() - start;
    const afterMemory = readHeapUsed();
    peakMemoryBytes = Math.max(peakMemoryBytes, Math.max(afterMemory - beforeMemory, 0));
    vnodeCount = Math.max(vnodeCount, countVNodes(vnode));
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

function countVNodes(node: VNode): number {
  switch (node.kind) {
    case 'text':
    case 'empty':
    case 'image':
      return 1;
    case 'row':
    case 'column':
    case 'box':
      return 1 + node.children.reduce((sum, child) => sum + countVNodes(child), 0);
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
      return 1 + countVNodes(node.child);
    case 'component':
      return 1 + countVNodes(node.render());
    default:
      return 1;
  }
}

function readHeapUsed(): number {
  if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
    return 0;
  }

  return process.memoryUsage().heapUsed;
}
