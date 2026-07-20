/**
 * Horizon Tiling Layout
 *
 * A recursive tiling window manager that builds VNode trees from
 * a binary-split tree description. Provides helpers for common
 * layouts: equal columns, equal rows, and grids.
 */

import type { VNode } from '@celestial/core/nebula';
import { splitPane } from './split.js';

/** A tiling layout is either a leaf (content) or a binary split */
export type TileLayout =
  | { kind: 'leaf'; content: VNode }
  | {
      kind: 'split';
      direction: 'horizontal' | 'vertical';
      ratio: number;
      first: TileLayout;
      second: TileLayout;
    };

/** Render a tiling layout recursively */
export function tile(layout: TileLayout): VNode {
  switch (layout.kind) {
    case 'leaf':
      return layout.content;
    case 'split':
      return splitPane({
        direction: layout.direction,
        ratio: layout.ratio,
        first: tile(layout.first),
        second: tile(layout.second),
      });
  }
}

/**
 * Create a horizontal tiling layout with equal-width columns.
 *
 * For N panes, builds a right-leaning binary tree of horizontal splits.
 * Each pane gets 1/N of the space.
 */
export function columns(...panes: VNode[]): TileLayout {
  if (panes.length === 0) {
    return { kind: 'leaf', content: { kind: 'empty' } };
  }
  if (panes.length === 1) {
    return { kind: 'leaf', content: panes[0]! };
  }

  return buildEqualSplits(panes, 'horizontal');
}

/**
 * Create a vertical tiling layout with equal-height rows.
 *
 * For N panes, builds a bottom-leaning binary tree of vertical splits.
 * Each pane gets 1/N of the space.
 */
export function rows(...panes: VNode[]): TileLayout {
  if (panes.length === 0) {
    return { kind: 'leaf', content: { kind: 'empty' } };
  }
  if (panes.length === 1) {
    return { kind: 'leaf', content: panes[0]! };
  }

  return buildEqualSplits(panes, 'vertical');
}

/**
 * Create a grid tiling layout from a 2D array of panes.
 *
 * Rows are stacked vertically, and within each row, panes are placed
 * horizontally. Optional ratios control how space is distributed.
 *
 * @param panes - 2D array where panes[row][col] is the VNode at that position
 * @param ratios - Optional row and column ratio arrays
 */
export function grid(panes: VNode[][], ratios?: { rows?: number[]; cols?: number[] }): TileLayout {
  if (panes.length === 0) {
    return { kind: 'leaf', content: { kind: 'empty' } };
  }

  const rowRatios = ratios?.rows;
  const colRatios = ratios?.cols;

  // Build each row as a horizontal split
  const rowLayouts: TileLayout[] = panes.map((rowPanes) => {
    if (rowPanes.length === 0) {
      return { kind: 'leaf' as const, content: { kind: 'empty' as const } };
    }
    if (rowPanes.length === 1) {
      return { kind: 'leaf' as const, content: rowPanes[0]! };
    }
    if (colRatios) {
      return buildWeightedSplits(rowPanes, 'horizontal', colRatios);
    }
    return buildEqualSplits(rowPanes, 'horizontal');
  });

  // Stack rows vertically
  if (rowLayouts.length === 1) {
    return rowLayouts[0]!;
  }

  if (rowRatios) {
    return buildWeightedSplitsFromLayouts(rowLayouts, 'vertical', rowRatios);
  }
  return buildEqualSplitsFromLayouts(rowLayouts, 'vertical');
}

/**
 * Build a balanced binary tree of equal splits from an array of panes.
 * Uses a right-leaning approach: first pane gets 1/N, rest get (N-1)/N recursively.
 */
function buildEqualSplits(panes: VNode[], direction: 'horizontal' | 'vertical'): TileLayout {
  if (panes.length === 1) {
    return { kind: 'leaf', content: panes[0]! };
  }

  const ratio = 1 / panes.length;

  return {
    kind: 'split',
    direction,
    ratio,
    first: { kind: 'leaf', content: panes[0]! },
    second: buildEqualSplits(panes.slice(1), direction),
  };
}

/**
 * Build a binary tree of splits using specified weight ratios.
 * Weights are normalized so that they sum to 1.0.
 */
function buildWeightedSplits(panes: VNode[], direction: 'horizontal' | 'vertical', weights: number[]): TileLayout {
  const layouts: TileLayout[] = panes.map((p) => ({ kind: 'leaf' as const, content: p }));
  return buildWeightedSplitsFromLayouts(layouts, direction, weights);
}

/** Build weighted splits from pre-existing TileLayouts */
function buildWeightedSplitsFromLayouts(layouts: TileLayout[], direction: 'horizontal' | 'vertical', weights: number[]): TileLayout {
  if (layouts.length === 1) {
    return layouts[0]!;
  }

  // Total weight of all items
  const totalWeight = weights.slice(0, layouts.length).reduce((a, b) => a + b, 0);
  const firstWeight = weights[0] ?? 1;
  const ratio = firstWeight / totalWeight;

  return {
    kind: 'split',
    direction,
    ratio,
    first: layouts[0]!,
    second: buildWeightedSplitsFromLayouts(layouts.slice(1), direction, weights.slice(1)),
  };
}

/** Build equal splits from pre-existing TileLayouts */
function buildEqualSplitsFromLayouts(layouts: TileLayout[], direction: 'horizontal' | 'vertical'): TileLayout {
  if (layouts.length === 1) {
    return layouts[0]!;
  }

  const ratio = 1 / layouts.length;

  return {
    kind: 'split',
    direction,
    ratio,
    first: layouts[0]!,
    second: buildEqualSplitsFromLayouts(layouts.slice(1), direction),
  };
}
