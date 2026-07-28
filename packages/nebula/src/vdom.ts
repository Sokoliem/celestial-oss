/**
 * Nebula Virtual Terminal facade.
 *
 * Public and direct-source imports are preserved while implementation lives
 * in focused modules under ./vdom/.
 */

import type { CellGrid } from './vdom/cells.js';
import type { VNode } from './vdom/nodes.js';
import { planLayout } from './vdom/planning.js';
import { rasterize } from './vdom/rasterize.js';

export type { Cell, CellGrid } from './vdom/cells.js';
export type { PointerCursor } from './pointer-cursor.js';
export type { CellUpdate } from './vdom/diff.js';
export { diff, extractRawBlobs, renderUpdates } from './vdom/diff.js';
export type { LayoutEntry, LayoutPlan, LayoutPlanOptions, LayoutPlanStats, LayoutRect, LayoutTraceEntry, OverlayEntry } from './vdom/layout-types.js';
export { measure } from './vdom/measure.js';
export type {
  BoxNode,
  ColumnNode,
  ComponentNode,
  EmptyNode,
  EventHandlers,
  EventNode,
  FlexNode,
  FocusNode,
  HoverNode,
  ImageNode,
  LayerFocusMode,
  LazyNode,
  LocalStateNode,
  MemoNode,
  MouseHandler,
  MouseModifierHandler,
  OverlayNode,
  PortalNode,
  RegionIntent,
  RegionMetadata,
  RowNode,
  ScrollNode,
  SuspenseNode,
  TabGroupNode,
  TextNode,
  VNode,
} from './vdom/nodes.js';
export { planLayout } from './vdom/planning.js';
export { rasterize, snapLayoutPlanToGrid } from './vdom/rasterize.js';
export { getBreakpoint, normalizeSides, resolveResponsive, resolveStyle } from './vdom/responsive.js';
export { beginLocalStateFrame, endLocalStateFrame, resolveMemo, setLazyScheduleRender, setLocalStateScheduleRender } from './vdom/state.js';
export type { ComponentRenderContext, EchoHint, LayoutSpace, ResolvedStyleAttrs, ResolvedStyleEffects, StyleAttrs } from './vdom/style.js';

/** Render a VNode tree into a CellGrid (backwards-compatible convenience wrapper) */
export function layout(node: VNode, width: number, height: number): CellGrid {
  return rasterize(planLayout(node, width, height));
}
