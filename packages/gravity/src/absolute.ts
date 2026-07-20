import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { AbsolutePositionOptions, ComponentNode, VNode } from './types.js';

function resolveAbsoluteSize(start: number | undefined, end: number | undefined, explicit: number | undefined, total: number, measured: number): number {
  if (explicit !== undefined) {
    return Math.max(0, explicit);
  }
  if (start !== undefined && end !== undefined) {
    return Math.max(0, total - start - end);
  }
  return Math.max(0, measured);
}

export function absolute(node: VNode, options: AbsolutePositionOptions): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const measured = measureNodeWithContext(node, measurementContext);
      const width = resolveAbsoluteSize(options.left, options.right, options.width, measurementContext.terminal.cols, measured.width);
      const height = resolveAbsoluteSize(options.top, options.bottom, options.height, measurementContext.terminal.rows, measured.height);
      const x = options.left ?? Math.max(0, measurementContext.terminal.cols - (options.right ?? 0) - width);
      const y = options.top ?? Math.max(0, measurementContext.terminal.rows - (options.bottom ?? 0) - height);

      return {
        kind: 'overlay',
        child: node,
        x,
        y,
        width,
        height,
        zIndex: options.zIndex,
        transparent: options.transparent,
      };
    },
  };
}
