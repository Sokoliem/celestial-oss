import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { ComponentNode, VNode } from './types.js';

export function aspectRatio(ratio: number, node: VNode): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const width = Math.max(1, measurementContext.container.cols);
      const normalizedRatio = ratio > 0 ? ratio : 1;
      const height = Math.max(1, Math.floor(width / normalizedRatio));

      return {
        kind: 'box',
        children: [node],
        width,
        height,
      };
    },
  };
}
