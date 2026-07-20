import type { LayoutEntry, VNode } from '@celestial/nebula';
import { planLayout } from '@celestial/nebula';
import { getTerminalSize } from './context.js';
import type { LayoutTraceResult, SerializedLayoutEntry, TraceLayoutOptions } from './types.js';

function serializeEntry(entry: LayoutEntry): SerializedLayoutEntry {
  return {
    id: entry.id,
    kind: entry.node.kind,
    rect: entry.rect,
    available: entry.available,
    reused: entry.reused,
    layoutId: entry.node.layoutId,
    children: entry.children.map((child) => serializeEntry(child)),
  };
}

export function traceLayout(node: VNode, options?: TraceLayoutOptions): LayoutTraceResult {
  const terminal = getTerminalSize();
  const width = options?.width ?? terminal.cols;
  const height = options?.height ?? terminal.rows;
  const plan = planLayout(node, width, height, {
    trace: true,
    previousPlan: options?.previousPlan,
  });

  return {
    size: { cols: width, rows: height },
    root: serializeEntry(plan.root),
    overlays: plan.overlays.map((overlay) => ({
      zIndex: overlay.zIndex,
      transparent: overlay.transparent,
      entry: serializeEntry(overlay.entry),
    })),
    trace: plan.trace ?? [],
    stats: plan.stats,
  };
}
