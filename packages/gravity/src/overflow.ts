import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { ComponentNode, VNode } from './types.js';

export interface OverflowOptions {
  mode?: 'truncate' | 'fade' | 'ellipsis' | 'badge';
  maxHeight?: number;
  maxWidth?: number;
  badgeFormatter?: (hiddenCount: number) => string;
}

export function overflow(node: VNode, opts: OverflowOptions = {}): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const measured = measureNodeWithContext(node, measurementContext);
      const width = Math.max(1, opts.maxWidth ?? measured.width);
      const height = Math.max(1, opts.maxHeight ?? measured.height);

      if (measured.width <= width && measured.height <= height) {
        return node;
      }

      const base: VNode = {
        kind: 'box',
        width,
        height,
        overflow: 'hidden',
        children: [node],
      };

      const mode = opts.mode ?? 'truncate';
      if (mode === 'truncate') {
        return base;
      }

      const indicator = createIndicator(mode, estimateHiddenCount(measured, width, height), width);
      if (indicator === null) {
        return base;
      }

      const indicatorText = mode === 'badge' && opts.badgeFormatter ? opts.badgeFormatter(estimateHiddenCount(measured, width, height)) : indicator;

      return {
        kind: 'box',
        width,
        height,
        overflow: 'hidden',
        children: [
          node,
          {
            kind: 'overlay',
            child: {
              kind: 'text',
              content: indicatorText,
            },
            x: Math.max(0, width - indicatorText.length),
            y: height - 1,
            width: Math.min(width, indicatorText.length),
            height: 1,
            zIndex: 1,
            transparent: true,
          },
        ],
      };
    },
  };
}

function estimateHiddenCount(measured: { width: number; height: number }, width: number, height: number): number {
  return Math.max(1, Math.max(measured.width - width, measured.height - height));
}

function createIndicator(mode: NonNullable<OverflowOptions['mode']>, hiddenCount: number, width: number): string | null {
  switch (mode) {
    case 'fade':
      return width >= 3 ? '░▒▓' : '▓'.repeat(width);
    case 'ellipsis':
      return width >= 3 ? '...' : '.'.repeat(width);
    case 'badge':
      return `+${hiddenCount} more`;
    case 'truncate':
    default:
      return null;
  }
}
