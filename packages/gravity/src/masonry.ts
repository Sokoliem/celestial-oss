import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { ComponentNode, VNode } from './types.js';

export interface MasonryOptions {
  columns?: number;
  gap?: number;
}

export function masonry(items: readonly VNode[], opts: MasonryOptions = {}): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      if (items.length === 0) {
        return { kind: 'empty' };
      }

      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const columns = Math.max(1, Math.min(opts.columns ?? 2, items.length));
      const gap = opts.gap ?? 0;
      const totalGap = gap * Math.max(0, columns - 1);
      const columnWidth = Math.max(1, Math.floor((measurementContext.container.cols - totalGap) / columns));
      const itemContext = {
        ...measurementContext,
        container: {
          cols: columnWidth,
          rows: measurementContext.container.rows,
        },
      };

      const columnItems: VNode[][] = Array.from({ length: columns }, () => []);
      const columnHeights = Array.from({ length: columns }, () => 0);

      for (const item of items) {
        const height = measureNodeWithContext(item, itemContext).height;
        const columnIndex = shortestColumn(columnHeights);

        columnItems[columnIndex]!.push({
          kind: 'box',
          width: columnWidth,
          children: [item],
        });
        columnHeights[columnIndex] = columnHeights[columnIndex]! + height + (columnItems[columnIndex]!.length > 1 ? gap : 0);
      }

      return {
        kind: 'row',
        gap,
        children: columnItems.map((children) => ({
          kind: 'box',
          width: columnWidth,
          children: [
            {
              kind: 'column',
              gap,
              children: children.length > 0 ? children : [{ kind: 'empty' }],
            },
          ],
        })),
      };
    },
  };
}

function shortestColumn(heights: readonly number[]): number {
  let bestIndex = 0;
  let bestHeight = heights[0] ?? 0;

  for (let index = 1; index < heights.length; index++) {
    if ((heights[index] ?? 0) < bestHeight) {
      bestIndex = index;
      bestHeight = heights[index] ?? 0;
    }
  }

  return bestIndex;
}
