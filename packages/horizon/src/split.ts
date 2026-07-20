/**
 * Horizon Split Pane
 *
 * Binary split pane layout that divides space between two child VNodes
 * with a configurable ratio, separator, and minimum size constraint.
 */

import { type Style, style } from '@celestial/core/corona';
import { box, type ColumnNode, type FlexNode, type RowNode, text, type VNode } from '@celestial/core/nebula';
import { clampFinite, nonNegativeInteger } from './internal.js';

export interface SplitConfig {
  /** Direction of the split */
  direction: 'horizontal' | 'vertical';
  /** Ratio from 0.0 to 1.0 — how much space the first pane gets */
  ratio: number;
  /** First pane content */
  first: VNode;
  /** Second pane content */
  second: VNode;
  /** Separator character (default: '│' for horizontal, '─' for vertical) */
  separator?: string;
  /** Minimum pane size in cells (default: 3) */
  minSize?: number;
  /** Optional style for the first pane's clipping container */
  firstStyle?: Style;
  /** Optional style for the second pane's clipping container */
  secondStyle?: Style;
}

const DEFAULT_HORIZONTAL_SEPARATOR = '│';
const DEFAULT_VERTICAL_SEPARATOR = '─';
const DEFAULT_MIN_SIZE = 3;

/** Clamp a value between min and max (inclusive) */
function clamp(value: number, min: number, max: number): number {
  return clampFinite(value, min, max, 0.5);
}

/** Create a split pane layout */
export function splitPane(config: SplitConfig): VNode {
  const { direction, ratio, first, second } = config;
  const minSize = nonNegativeInteger(config.minSize, DEFAULT_MIN_SIZE);

  // Clamp ratio to valid range
  const clampedRatio = clamp(ratio, 0, 1);

  const separator = config.separator ?? (direction === 'horizontal' ? DEFAULT_HORIZONTAL_SEPARATOR : DEFAULT_VERTICAL_SEPARATOR);

  if (direction === 'horizontal') {
    return createHorizontalSplit(first, second, separator, clampedRatio, minSize, config.firstStyle, config.secondStyle);
  } else {
    return createVerticalSplit(first, second, separator, clampedRatio, minSize, config.firstStyle, config.secondStyle);
  }
}

/**
 * Horizontal split: two panes side by side with a vertical separator.
 * Uses a row layout: [first] [sep] [second]
 */
function createHorizontalSplit(
  first: VNode,
  second: VNode,
  separator: string,
  ratio: number,
  minSize: number,
  firstStyle?: Style,
  secondStyle?: Style,
): RowNode {
  // Separator is a single-character-wide text column, no border (border adds 2 extra cols)
  const separatorNode: VNode = text(separator, style({ dim: true }));

  return {
    kind: 'row',
    children: [
      createSizedPane(first, ratio, 'minWidth', minSize, firstStyle),
      separatorNode,
      createSizedPane(second, 1 - ratio, 'minWidth', minSize, secondStyle),
    ],
  };
}

/**
 * Vertical split: two panes stacked with a horizontal separator.
 * Uses a column layout: [first] / [sep] / [second]
 */
function createVerticalSplit(
  first: VNode,
  second: VNode,
  separator: string,
  ratio: number,
  minSize: number,
  firstStyle?: Style,
  secondStyle?: Style,
): ColumnNode {
  const separatorNode: VNode = text(separator, style({ dim: true }));

  return {
    kind: 'column',
    children: [
      createSizedPane(first, ratio, 'minHeight', minSize, firstStyle),
      separatorNode,
      createSizedPane(second, 1 - ratio, 'minHeight', minSize, secondStyle),
    ],
  };
}

/**
 * Wrap a VNode in a flex layout with a proportional size hint.
 */
function createSizedPane(content: VNode, ratio: number, minProp: 'minWidth' | 'minHeight', minSize: number, paneStyle?: Style): FlexNode {
  return {
    kind: 'flex',
    flex: Math.max(1, Math.round(ratio * 100)),
    [minProp]: minSize,
    child: box(content, paneStyle, { overflow: 'hidden' }),
  };
}
