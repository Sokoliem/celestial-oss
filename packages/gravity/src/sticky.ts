import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import { reserveSafeArea, type SafeAreaReservationHandle } from './safe-area.js';
import type { ComponentNode, SafeAreaEdge, VNode } from './types.js';

export interface StickyOptions {
  scrollOffset: number;
  elementOffset: number;
  position?: 'top' | 'bottom';
  offset?: number;
  zIndex?: number;
  transparent?: boolean;
  /**
   * When set, publishes the sticky element's measured size as a safe-area
   * reservation on the matching edge so layout consumers can offset around it.
   */
  reserveSafeArea?: {
    source: string;
    zone?: string;
  };
}

export function sticky(node: VNode, opts: StickyOptions): ComponentNode {
  let reservationHandle: SafeAreaReservationHandle | null = null;

  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const measured = measureNodeWithContext(node, measurementContext);
      const inset = opts.offset ?? 0;
      const naturalY = opts.elementOffset - opts.scrollOffset;
      const position: 'top' | 'bottom' = opts.position ?? 'top';

      if (opts.reserveSafeArea) {
        const edge: SafeAreaEdge = position === 'top' ? 'top' : 'bottom';
        const size = Math.max(0, measured.height);
        if (reservationHandle) {
          reservationHandle.update({ edge, size });
        } else {
          reservationHandle = reserveSafeArea({
            edge,
            size,
            source: opts.reserveSafeArea.source,
            zone: opts.reserveSafeArea.zone,
          });
        }
      }

      if (position === 'top') {
        if (naturalY > inset) {
          return node;
        }

        return {
          kind: 'overlay',
          child: node,
          x: 0,
          y: inset,
          width: measurementContext.container.cols,
          height: measured.height,
          zIndex: opts.zIndex,
          transparent: opts.transparent,
        };
      }

      const stickyY = Math.max(0, measurementContext.container.rows - measured.height - inset);
      if (naturalY < stickyY) {
        return node;
      }

      return {
        kind: 'overlay',
        child: node,
        x: 0,
        y: stickyY,
        width: measurementContext.container.cols,
        height: measured.height,
        zIndex: opts.zIndex,
        transparent: opts.transparent,
      };
    },
  };
}
