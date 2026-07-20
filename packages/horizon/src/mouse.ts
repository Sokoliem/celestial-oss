/**
 * Mouse integration layer for Horizon pane management.
 *
 * Composes Nexus primitives (drag, sortable, gesture, HitMap) into a
 * single reducer that produces layout effects from raw mouse events.
 *
 * All functions are pure — the original model is never mutated.
 * The HitMap is rebuilt transiently on each mouse event from the geometry cache.
 */

import type { MouseEventData } from '@celestial/core/nebula';
import type { DragState, GestureEvent, GestureState, SortableState } from '@celestial/core/nexus';
import {
  createDragState,
  createGestureState,
  createSortableState,
  detectCapabilities,
  dragUpdate,
  getPreviewOrder,
  HitMap,
  sortableUpdate,
} from '@celestial/core/nexus';
import { type FloatingWindowFrame, type FloatingWindowResizeEdge, type FloatingWindowResizeState, resizeFloatingWindowFrame } from './floating-window-drag.js';
import type { FloatGeometry, GeometryCache, RectWithId, SplitGeometry, TabGeometry } from './primitives/geometry.js';
import { previewSnapZone, type SnapZone } from './snap-zones.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** What kind of mouse interaction is active, if any */
export type ActiveInteraction =
  | { readonly kind: 'none' }
  | { readonly kind: 'resize-split'; readonly splitId: string; readonly direction: 'horizontal' | 'vertical' }
  | { readonly kind: 'reorder-tab'; readonly tabbedId: string; readonly overTabbedId?: string; readonly overPaneId?: string }
  | { readonly kind: 'drag-float'; readonly floatId: string }
  | { readonly kind: 'resize-float'; readonly floatId: string; readonly edge: FloatingWindowResizeEdge }
  | { readonly kind: 'scroll-pane'; readonly paneId: string };

/** Data attached to drag operations */
export type MouseDragData =
  | {
      readonly kind: 'separator';
      readonly splitId: string;
      readonly direction: 'horizontal' | 'vertical';
      readonly originalRatio: number;
      readonly totalSize: number;
    }
  | { readonly kind: 'title-bar'; readonly floatId: string; readonly originalX: number; readonly originalY: number }
  | { readonly kind: 'float-resize'; readonly floatId: string; readonly resize: FloatingWindowResizeState }
  | { readonly kind: 'tab'; readonly tabbedId: string; readonly tabIndex: number };

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface SnapConfig {
  readonly ratios: readonly number[];
  readonly threshold: number;
}

export interface EdgeSnapConfig {
  readonly threshold: number;
}

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  ratios: [0.25, 0.333, 0.5, 0.667, 0.75],
  threshold: 2,
};

export const DEFAULT_EDGE_SNAP: EdgeSnapConfig = {
  threshold: 3,
};

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type HorizonMouseEffect =
  | { readonly effect: 'focus-pane'; readonly paneId: string }
  | { readonly effect: 'set-split-ratio'; readonly splitId: string; readonly ratio: number }
  | { readonly effect: 'reorder-tabs'; readonly tabbedId: string; readonly fromIndex: number; readonly toIndex: number }
  | {
      readonly effect: 'move-tab';
      readonly sourceTabbedId: string;
      readonly sourceIndex: number;
      readonly targetTabbedId: string;
      readonly targetIndex: number;
    }
  | { readonly effect: 'move-tab-to-pane'; readonly sourceTabbedId: string; readonly sourceIndex: number; readonly targetPaneId: string }
  | { readonly effect: 'activate-tab'; readonly tabbedId: string; readonly tabIndex: number }
  | { readonly effect: 'move-float'; readonly floatId: string; readonly x: number; readonly y: number }
  | { readonly effect: 'resize-float'; readonly floatId: string; readonly edge: FloatingWindowResizeEdge; readonly frame: FloatingWindowFrame }
  | { readonly effect: 'snap-window'; readonly floatId: string; readonly zoneId: string; readonly frame: FloatingWindowFrame }
  | { readonly effect: 'toggle-maximize'; readonly paneId: string }
  | { readonly effect: 'scroll-pane'; readonly paneId: string; readonly delta: number }
  | { readonly effect: 'none' };

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface HorizonMouseModel {
  readonly enabled: boolean;
  readonly active: ActiveInteraction;
  readonly drag: DragState<MouseDragData>;
  readonly sortable: SortableState;
  readonly gesture: GestureState;
  readonly hoveredPaneId: string | null;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly termCols: number;
  readonly termRows: number;
  readonly geometry: GeometryCache;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type HorizonMouseMsg =
  | { readonly type: 'mouse-event'; readonly event: MouseEventData }
  | { readonly type: 'mouse-resize'; readonly cols: number; readonly rows: number }
  | { readonly type: 'mouse-enable' }
  | { readonly type: 'mouse-disable' }
  | { readonly type: 'mouse-register-splits'; readonly splits: readonly SplitGeometry[] }
  | { readonly type: 'mouse-register-tabs'; readonly tabs: readonly TabGeometry[] }
  | { readonly type: 'mouse-register-floats'; readonly floats: readonly FloatGeometry[] }
  | { readonly type: 'mouse-register-panes'; readonly panes: readonly RectWithId[] }
  | { readonly type: 'mouse-gesture'; readonly gesture: GestureEvent };

// ---------------------------------------------------------------------------
// Internal hit-test region tag
// ---------------------------------------------------------------------------

type MouseRegion =
  | { readonly kind: 'pane'; readonly paneId: string }
  | {
      readonly kind: 'separator';
      readonly splitId: string;
      readonly direction: 'horizontal' | 'vertical';
      readonly totalSize: number;
      readonly firstPaneX: number;
      readonly firstPaneY: number;
    }
  | { readonly kind: 'tab'; readonly tabbedId: string; readonly tabIndex: number }
  | { readonly kind: 'title-bar'; readonly floatId: string; readonly titleBarX: number; readonly titleBarY: number }
  | { readonly kind: 'resize-handle'; readonly floatId: string; readonly edge: FloatingWindowResizeEdge };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new HorizonMouseModel with optional terminal dimensions */
export function createHorizonMouseModel(opts?: { cols?: number; rows?: number; enabled?: boolean }): HorizonMouseModel {
  const capabilities = detectCapabilities();
  return {
    enabled: opts?.enabled ?? capabilities.mouse ?? false,
    active: { kind: 'none' },
    drag: createDragState<MouseDragData>(),
    sortable: createSortableState(),
    gesture: createGestureState(),
    hoveredPaneId: null,
    cursorX: 0,
    cursorY: 0,
    termCols: opts?.cols ?? 80,
    termRows: opts?.rows ?? 24,
    geometry: { splits: [], tabs: [], floats: [], panes: [] },
  };
}

// ---------------------------------------------------------------------------
// Main reducer
// ---------------------------------------------------------------------------

interface UpdateResult {
  readonly model: HorizonMouseModel;
  readonly effects: readonly HorizonMouseEffect[];
}

const NO_EFFECTS: readonly HorizonMouseEffect[] = [];

/** Pure reducer — processes a HorizonMouseMsg and returns new model + effects */
export function horizonMouseUpdate(
  msg: HorizonMouseMsg,
  model: HorizonMouseModel,
  config?: { snap?: SnapConfig; edgeSnap?: EdgeSnapConfig; snapZones?: readonly SnapZone[] },
): UpdateResult {
  switch (msg.type) {
    case 'mouse-enable':
      return { model: { ...model, enabled: true }, effects: NO_EFFECTS };

    case 'mouse-disable':
      return handleDisable(model);

    case 'mouse-resize':
      return { model: { ...model, termCols: msg.cols, termRows: msg.rows }, effects: NO_EFFECTS };

    case 'mouse-register-splits':
      return { model: { ...model, geometry: { ...model.geometry, splits: msg.splits } }, effects: NO_EFFECTS };

    case 'mouse-register-tabs':
      return { model: { ...model, geometry: { ...model.geometry, tabs: msg.tabs } }, effects: NO_EFFECTS };

    case 'mouse-register-floats':
      return { model: { ...model, geometry: { ...model.geometry, floats: msg.floats } }, effects: NO_EFFECTS };

    case 'mouse-register-panes':
      return { model: { ...model, geometry: { ...model.geometry, panes: msg.panes } }, effects: NO_EFFECTS };

    case 'mouse-gesture':
      if (!model.enabled) return { model, effects: NO_EFFECTS };
      return handleGesture(msg.gesture, model);

    case 'mouse-event':
      if (!model.enabled) return { model, effects: NO_EFFECTS };
      return handleMouseEvent(msg.event, model, config);
  }
}

// ---------------------------------------------------------------------------
// Disable handler
// ---------------------------------------------------------------------------

function handleDisable(model: HorizonMouseModel): UpdateResult {
  return {
    model: {
      ...model,
      enabled: false,
      active: { kind: 'none' },
      drag: createDragState<MouseDragData>(),
      sortable: createSortableState(),
    },
    effects: NO_EFFECTS,
  };
}

// ---------------------------------------------------------------------------
// Gesture handler
// ---------------------------------------------------------------------------

function handleGesture(gesture: GestureEvent, model: HorizonMouseModel): UpdateResult {
  if (gesture.gesture === 'double-click') {
    // Build a pane-only hit map for the double-click target
    const hitmap = new HitMap<MouseRegion>();
    for (const pane of model.geometry.panes) {
      hitmap.register({
        x: pane.x,
        y: pane.y,
        width: pane.width,
        height: pane.height,
        onClick: { kind: 'pane', paneId: pane.id },
      });
    }
    const hit = hitmap.hitTest(gesture.x, gesture.y);
    if (hit?.onClick && hit.onClick.kind === 'pane') {
      return {
        model,
        effects: [{ effect: 'toggle-maximize', paneId: hit.onClick.paneId }],
      };
    }
  }
  return { model, effects: NO_EFFECTS };
}

// ---------------------------------------------------------------------------
// Mouse event handler
// ---------------------------------------------------------------------------

function handleMouseEvent(
  event: MouseEventData,
  model: HorizonMouseModel,
  config?: { snap?: SnapConfig; edgeSnap?: EdgeSnapConfig; snapZones?: readonly SnapZone[] },
): UpdateResult {
  const snapCfg = config?.snap ?? DEFAULT_SNAP_CONFIG;
  const edgeSnapCfg = config?.edgeSnap ?? DEFAULT_EDGE_SNAP;

  // If there is an active interaction, route to its handler
  if (model.active.kind !== 'none') {
    return handleActiveInteraction(event, model, snapCfg, edgeSnapCfg, config?.snapZones);
  }

  // No active interaction — handle based on event type
  switch (event.type) {
    case 'press':
      return handlePress(event, model, snapCfg);
    case 'release':
      return { model, effects: NO_EFFECTS };
    case 'move':
      return handleIdleMove(event, model);
    case 'scroll-up':
      return handleScroll(event, model, -1);
    case 'scroll-down':
      return handleScroll(event, model, 1);
  }
}

// ---------------------------------------------------------------------------
// Build transient HitMap from geometry cache
// ---------------------------------------------------------------------------

function buildHitMap(geometry: GeometryCache): HitMap<MouseRegion> {
  const hitmap = new HitMap<MouseRegion>();

  // Register in z-priority order: panes (lowest) < separators < tabs < title bars (highest)
  for (const pane of geometry.panes) {
    hitmap.register({
      x: pane.x,
      y: pane.y,
      width: pane.width,
      height: pane.height,
      onClick: { kind: 'pane', paneId: pane.id },
    });
  }

  for (const split of geometry.splits) {
    hitmap.register({
      x: split.separatorX,
      y: split.separatorY,
      width: split.separatorWidth,
      height: split.separatorHeight,
      onClick: {
        kind: 'separator',
        splitId: split.splitId,
        direction: split.direction,
        totalSize: split.totalSize,
        firstPaneX: split.firstPaneX,
        firstPaneY: split.firstPaneY,
      },
    });
  }

  for (const tabGroup of geometry.tabs) {
    for (const tab of tabGroup.tabs) {
      hitmap.register({
        x: tab.x,
        y: tab.y,
        width: tab.width,
        height: tab.height,
        onClick: { kind: 'tab', tabbedId: tabGroup.tabbedId, tabIndex: tab.index },
      });
    }
  }

  for (const float of geometry.floats) {
    hitmap.register({
      x: float.titleBarX,
      y: float.titleBarY,
      width: float.titleBarWidth,
      height: float.titleBarHeight,
      onClick: {
        kind: 'title-bar',
        floatId: float.floatId,
        titleBarX: float.titleBarX,
        titleBarY: float.titleBarY,
      },
    });
    for (const region of floatingResizeRegions(float)) {
      hitmap.register({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        onClick: { kind: 'resize-handle', floatId: float.floatId, edge: region.edge },
      });
    }
  }

  return hitmap;
}

function floatingFrame(float: FloatGeometry): FloatingWindowFrame {
  const width = Math.max(float.titleBarWidth, float.contentWidth);
  const height = Math.max(1, float.contentY - float.titleBarY + float.contentHeight);
  return { x: float.titleBarX, y: float.titleBarY, width, height };
}

function floatingResizeRegions(float: FloatGeometry): Array<FloatingWindowFrame & { edge: FloatingWindowResizeEdge }> {
  const frame = floatingFrame(float);
  const right = frame.x + frame.width - 1;
  const bottom = frame.y + frame.height - 1;
  const regions: Array<FloatingWindowFrame & { edge: FloatingWindowResizeEdge }> = [
    { edge: 'bottom-left', x: frame.x, y: bottom, width: 1, height: 1 },
    { edge: 'bottom-right', x: right, y: bottom, width: 1, height: 1 },
    { edge: 'left', x: frame.x, y: frame.y + 1, width: 1, height: Math.max(0, frame.height - 2) },
    { edge: 'right', x: right, y: frame.y + 1, width: 1, height: Math.max(0, frame.height - 2) },
    { edge: 'bottom', x: frame.x + 1, y: bottom, width: Math.max(0, frame.width - 2), height: 1 },
  ];
  return regions.filter((region) => region.width > 0 && region.height > 0);
}

// ---------------------------------------------------------------------------
// Press handler (idle state)
// ---------------------------------------------------------------------------

function handlePress(event: MouseEventData, model: HorizonMouseModel, _snapCfg: SnapConfig): UpdateResult {
  const hitmap = buildHitMap(model.geometry);
  const hit = hitmap.hitTest(event.x, event.y);

  if (!hit?.onClick) {
    return { model, effects: NO_EFFECTS };
  }

  const region = hit.onClick;

  switch (region.kind) {
    case 'separator':
      return startSplitResize(event, model, region);
    case 'resize-handle':
      return startFloatResize(event, model, region);
    case 'tab':
      return startTabReorder(event, model, region);
    case 'title-bar':
      return startFloatDrag(event, model, region);
    case 'pane':
      return {
        model: { ...model, cursorX: event.x, cursorY: event.y },
        effects: [{ effect: 'focus-pane', paneId: region.paneId }],
      };
  }
}

function startFloatResize(event: MouseEventData, model: HorizonMouseModel, region: Extract<MouseRegion, { kind: 'resize-handle' }>): UpdateResult {
  const floatGeo = model.geometry.floats.find((f) => f.floatId === region.floatId);
  if (!floatGeo) return { model, effects: NO_EFFECTS };
  const frame = floatingFrame(floatGeo);
  const resize: FloatingWindowResizeState = {
    edge: region.edge,
    startMouseX: event.x,
    startMouseY: event.y,
    startX: frame.x,
    startY: frame.y,
    startWidth: frame.width,
    startHeight: frame.height,
  };
  const dragData: MouseDragData = { kind: 'float-resize', floatId: region.floatId, resize };
  const newDrag = dragUpdate<MouseDragData>({ type: 'drag-start', sourceId: region.floatId, data: dragData, x: event.x, y: event.y }, model.drag, []);

  return {
    model: {
      ...model,
      active: { kind: 'resize-float', floatId: region.floatId, edge: region.edge },
      drag: newDrag,
      cursorX: event.x,
      cursorY: event.y,
    },
    effects: NO_EFFECTS,
  };
}

// ---------------------------------------------------------------------------
// Start split resize
// ---------------------------------------------------------------------------

function startSplitResize(event: MouseEventData, model: HorizonMouseModel, region: Extract<MouseRegion, { kind: 'separator' }>): UpdateResult {
  // Compute original ratio from first pane size / total size
  const split = model.geometry.splits.find((s) => s.splitId === region.splitId);
  const originalRatio = split ? (region.direction === 'horizontal' ? split.firstPaneWidth / split.totalSize : split.firstPaneHeight / split.totalSize) : 0.5;

  const dragData: MouseDragData = {
    kind: 'separator',
    splitId: region.splitId,
    direction: region.direction,
    originalRatio,
    totalSize: region.totalSize,
  };

  const newDrag = dragUpdate<MouseDragData>({ type: 'drag-start', sourceId: region.splitId, data: dragData, x: event.x, y: event.y }, model.drag, []);

  return {
    model: {
      ...model,
      active: { kind: 'resize-split', splitId: region.splitId, direction: region.direction },
      drag: newDrag,
      cursorX: event.x,
      cursorY: event.y,
    },
    effects: NO_EFFECTS,
  };
}

// ---------------------------------------------------------------------------
// Start tab reorder
// ---------------------------------------------------------------------------

function startTabReorder(event: MouseEventData, model: HorizonMouseModel, region: Extract<MouseRegion, { kind: 'tab' }>): UpdateResult {
  const newSortable = sortableUpdate({ type: 'sort-start', index: region.tabIndex }, model.sortable);

  return {
    model: {
      ...model,
      active: { kind: 'reorder-tab', tabbedId: region.tabbedId, overTabbedId: region.tabbedId },
      sortable: newSortable,
      cursorX: event.x,
      cursorY: event.y,
    },
    effects: [{ effect: 'activate-tab', tabbedId: region.tabbedId, tabIndex: region.tabIndex }],
  };
}

// ---------------------------------------------------------------------------
// Start float drag
// ---------------------------------------------------------------------------

function startFloatDrag(event: MouseEventData, model: HorizonMouseModel, region: Extract<MouseRegion, { kind: 'title-bar' }>): UpdateResult {
  // Find the float geometry to get original position
  const floatGeo = model.geometry.floats.find((f) => f.floatId === region.floatId);
  const originalX = floatGeo?.titleBarX ?? event.x;
  const originalY = floatGeo?.titleBarY ?? event.y;

  const dragData: MouseDragData = {
    kind: 'title-bar',
    floatId: region.floatId,
    originalX,
    originalY,
  };

  const newDrag = dragUpdate<MouseDragData>({ type: 'drag-start', sourceId: region.floatId, data: dragData, x: event.x, y: event.y }, model.drag, []);

  return {
    model: {
      ...model,
      active: { kind: 'drag-float', floatId: region.floatId },
      drag: newDrag,
      cursorX: event.x,
      cursorY: event.y,
    },
    effects: NO_EFFECTS,
  };
}

// ---------------------------------------------------------------------------
// Idle move handler
// ---------------------------------------------------------------------------

function handleIdleMove(event: MouseEventData, model: HorizonMouseModel): UpdateResult {
  const hoveredPaneId = findPaneAt(model.geometry, event.x, event.y);
  return {
    model: {
      ...model,
      cursorX: event.x,
      cursorY: event.y,
      hoveredPaneId,
    },
    effects: NO_EFFECTS,
  };
}

// ---------------------------------------------------------------------------
// Scroll handler
// ---------------------------------------------------------------------------

function handleScroll(event: MouseEventData, model: HorizonMouseModel, delta: number): UpdateResult {
  const paneId = findPaneAt(model.geometry, event.x, event.y);
  if (paneId == null) {
    return { model, effects: NO_EFFECTS };
  }
  return {
    model,
    effects: [{ effect: 'scroll-pane', paneId, delta }],
  };
}

// ---------------------------------------------------------------------------
// Active interaction routing
// ---------------------------------------------------------------------------

function handleActiveInteraction(
  event: MouseEventData,
  model: HorizonMouseModel,
  snapCfg: SnapConfig,
  edgeSnapCfg: EdgeSnapConfig,
  snapZones?: readonly SnapZone[],
): UpdateResult {
  switch (model.active.kind) {
    case 'resize-split':
      return handleResizeInteraction(event, model, model.active, snapCfg);
    case 'reorder-tab':
      return handleTabReorderInteraction(event, model, model.active);
    case 'drag-float':
      return handleFloatDragInteraction(event, model, model.active, edgeSnapCfg, snapZones);
    case 'resize-float':
      return handleFloatResizeInteraction(event, model, model.active);
    case 'scroll-pane':
      // Scroll interaction ends immediately, so this shouldn't happen
      return { model: { ...model, active: { kind: 'none' } }, effects: NO_EFFECTS };
    case 'none':
      return { model, effects: NO_EFFECTS };
  }
}

// ---------------------------------------------------------------------------
// Resize interaction handlers
// ---------------------------------------------------------------------------

function handleResizeInteraction(
  event: MouseEventData,
  model: HorizonMouseModel,
  active: Extract<ActiveInteraction, { kind: 'resize-split' }>,
  snapCfg: SnapConfig,
): UpdateResult {
  switch (event.type) {
    case 'move': {
      const newDrag = dragUpdate<MouseDragData>({ type: 'drag-move', x: event.x, y: event.y }, model.drag, []);
      const ratio = computeSplitRatio(newDrag, model.geometry, active.splitId, active.direction, snapCfg);
      const effects: HorizonMouseEffect[] = ratio != null ? [{ effect: 'set-split-ratio', splitId: active.splitId, ratio }] : [];
      return {
        model: { ...model, drag: newDrag, cursorX: event.x, cursorY: event.y },
        effects,
      };
    }
    case 'release': {
      // Compute final ratio and emit
      const ratio = computeSplitRatio(model.drag, model.geometry, active.splitId, active.direction, snapCfg);
      const effects: HorizonMouseEffect[] = ratio != null ? [{ effect: 'set-split-ratio', splitId: active.splitId, ratio }] : [];
      return {
        model: {
          ...model,
          active: { kind: 'none' },
          drag: createDragState<MouseDragData>(),
          cursorX: event.x,
          cursorY: event.y,
        },
        effects,
      };
    }
    default:
      // press during resize — ignore (only one interaction at a time)
      return { model, effects: NO_EFFECTS };
  }
}

function computeSplitRatio(
  drag: DragState<MouseDragData>,
  geometry: GeometryCache,
  splitId: string,
  direction: 'horizontal' | 'vertical',
  snapCfg: SnapConfig,
): number | null {
  if (drag.phase !== 'dragging') return null;
  if (drag.data.kind !== 'separator') return null;

  const split = geometry.splits.find((s) => s.splitId === splitId);
  if (!split) return null;

  const totalSize = split.totalSize;
  if (totalSize <= 0) return null;

  // Compute raw ratio from cursor position relative to the first pane origin
  let rawRatio: number;
  if (direction === 'horizontal') {
    rawRatio = (drag.currentX - split.firstPaneX) / totalSize;
  } else {
    rawRatio = (drag.currentY - split.firstPaneY) / totalSize;
  }

  // Clamp to [0.05, 0.95]
  rawRatio = Math.max(0.05, Math.min(0.95, rawRatio));

  // Snap to preferred ratios
  return applySnap(rawRatio, totalSize, snapCfg);
}

function applySnap(ratio: number, totalSize: number, snapCfg: SnapConfig): number {
  const thresholdRatio = totalSize > 0 ? snapCfg.threshold / totalSize : 0;

  // Find the closest snap point within threshold
  let bestSnap: number | null = null;
  let bestDist = Infinity;
  for (const snapRatio of snapCfg.ratios) {
    const dist = Math.abs(ratio - snapRatio);
    if (dist <= thresholdRatio && dist < bestDist) {
      bestSnap = snapRatio;
      bestDist = dist;
    }
  }
  if (bestSnap != null) return bestSnap;

  // Round to 2 decimal places for clean numbers
  return Math.round(ratio * 100) / 100;
}

// ---------------------------------------------------------------------------
// Tab reorder interaction handlers
// ---------------------------------------------------------------------------

function handleTabReorderInteraction(
  event: MouseEventData,
  model: HorizonMouseModel,
  active: Extract<ActiveInteraction, { kind: 'reorder-tab' }>,
): UpdateResult {
  switch (event.type) {
    case 'move': {
      // Rebuild HitMap for transient global hit-testing
      const hitmap = buildHitMap(model.geometry);
      const hit = hitmap.hitTest(event.x, event.y);

      let overIndex = model.sortable.overIndex ?? model.sortable.draggingIndex;
      let newOverTabbedId = active.overTabbedId;
      let newOverPaneId = active.overPaneId;

      if (hit?.onClick?.kind === 'tab') {
        newOverTabbedId = hit.onClick.tabbedId;
        overIndex = hit.onClick.tabIndex;
        newOverPaneId = undefined;
      } else if (hit?.onClick?.kind === 'pane') {
        const paneId = hit.onClick.paneId;
        // See if there's a tab group for this pane
        const tabGroup = model.geometry.tabs.find((t) => t.tabbedId === paneId);
        if (tabGroup) {
          newOverTabbedId = paneId;
          overIndex = tabGroup.tabs.length; // Append at end
          newOverPaneId = undefined;
        } else {
          newOverPaneId = paneId;
          newOverTabbedId = undefined;
        }
      }

      const newSortable = overIndex != null ? sortableUpdate({ type: 'sort-over', index: overIndex }, model.sortable) : model.sortable;

      return {
        model: {
          ...model,
          sortable: newSortable,
          active: { ...active, overTabbedId: newOverTabbedId, overPaneId: newOverPaneId },
          cursorX: event.x,
          cursorY: event.y,
        },
        effects: NO_EFFECTS,
      };
    }
    case 'release': {
      const effects: HorizonMouseEffect[] = [];
      const draggingIndex = model.sortable.draggingIndex;
      const overIndex = model.sortable.overIndex;

      if (draggingIndex != null) {
        if (active.overTabbedId != null) {
          if (active.tabbedId === active.overTabbedId) {
            // Same tab group reorder
            if (overIndex != null && draggingIndex !== overIndex) {
              effects.push({
                effect: 'reorder-tabs',
                tabbedId: active.tabbedId,
                fromIndex: draggingIndex,
                toIndex: overIndex,
              });
            }
          } else {
            // Cross-pane tab move
            effects.push({
              effect: 'move-tab',
              sourceTabbedId: active.tabbedId,
              sourceIndex: draggingIndex,
              targetTabbedId: active.overTabbedId,
              targetIndex: overIndex ?? 0,
            });
          }
        } else if (active.overPaneId != null && active.overPaneId !== active.tabbedId) {
          // Drop onto an empty pane
          effects.push({
            effect: 'move-tab-to-pane',
            sourceTabbedId: active.tabbedId,
            sourceIndex: draggingIndex,
            targetPaneId: active.overPaneId,
          });
        }
      }

      const newSortable = sortableUpdate({ type: 'sort-end' }, model.sortable);
      return {
        model: {
          ...model,
          active: { kind: 'none' },
          sortable: newSortable,
          cursorX: event.x,
          cursorY: event.y,
        },
        effects,
      };
    }
    default:
      return { model, effects: NO_EFFECTS };
  }
}

// ---------------------------------------------------------------------------
// Float drag interaction handlers
// ---------------------------------------------------------------------------

function handleFloatDragInteraction(
  event: MouseEventData,
  model: HorizonMouseModel,
  active: Extract<ActiveInteraction, { kind: 'drag-float' }>,
  edgeSnapCfg: EdgeSnapConfig,
  snapZones?: readonly SnapZone[],
): UpdateResult {
  switch (event.type) {
    case 'move': {
      const newDrag = dragUpdate<MouseDragData>({ type: 'drag-move', x: event.x, y: event.y }, model.drag, []);
      const pos = computeFloatPosition(newDrag, model.termCols, model.termRows, model.geometry, active.floatId, edgeSnapCfg);
      const effects: HorizonMouseEffect[] = pos != null ? [{ effect: 'move-float', floatId: active.floatId, x: pos.x, y: pos.y }] : [];
      const snapEffect = computeSnapWindowEffect(event.x, event.y, model.geometry, active.floatId, snapZones);
      if (snapEffect) effects.push(snapEffect);
      return {
        model: { ...model, drag: newDrag, cursorX: event.x, cursorY: event.y },
        effects,
      };
    }
    case 'release': {
      const pos = computeFloatPosition(model.drag, model.termCols, model.termRows, model.geometry, active.floatId, edgeSnapCfg);
      const effects: HorizonMouseEffect[] = pos != null ? [{ effect: 'move-float', floatId: active.floatId, x: pos.x, y: pos.y }] : [];
      const snapEffect = computeSnapWindowEffect(event.x, event.y, model.geometry, active.floatId, snapZones);
      if (snapEffect) effects.push(snapEffect);
      return {
        model: {
          ...model,
          active: { kind: 'none' },
          drag: createDragState<MouseDragData>(),
          cursorX: event.x,
          cursorY: event.y,
        },
        effects,
      };
    }
    default:
      return { model, effects: NO_EFFECTS };
  }
}

function handleFloatResizeInteraction(
  event: MouseEventData,
  model: HorizonMouseModel,
  active: Extract<ActiveInteraction, { kind: 'resize-float' }>,
): UpdateResult {
  if (event.type !== 'move' && event.type !== 'release') {
    return { model, effects: NO_EFFECTS };
  }
  const drag = event.type === 'move' ? dragUpdate<MouseDragData>({ type: 'drag-move', x: event.x, y: event.y }, model.drag, []) : model.drag;
  if (drag.phase !== 'dragging' || drag.data.kind !== 'float-resize') {
    return { model, effects: NO_EFFECTS };
  }
  const frame = resizeFloatingWindowFrame(drag.data.resize, event.x, event.y, { cols: model.termCols, rows: model.termRows }, { minWidth: 1, minHeight: 1 });
  const effects: HorizonMouseEffect[] = [{ effect: 'resize-float', floatId: active.floatId, edge: active.edge, frame }];
  if (event.type === 'release') {
    return {
      model: {
        ...model,
        active: { kind: 'none' },
        drag: createDragState<MouseDragData>(),
        cursorX: event.x,
        cursorY: event.y,
      },
      effects,
    };
  }
  return {
    model: { ...model, drag, cursorX: event.x, cursorY: event.y },
    effects,
  };
}

function computeSnapWindowEffect(
  x: number,
  y: number,
  geometry: GeometryCache,
  floatId: string,
  snapZones?: readonly SnapZone[],
): Extract<HorizonMouseEffect, { effect: 'snap-window' }> | null {
  if (!snapZones || snapZones.length === 0) return null;
  const floatGeo = geometry.floats.find((f) => f.floatId === floatId);
  if (!floatGeo) return null;
  const preview = previewSnapZone({ x, y }, floatingFrame(floatGeo), snapZones);
  if (!preview) return null;
  return { effect: 'snap-window', floatId, zoneId: preview.zone.id, frame: preview.frame };
}

function computeFloatPosition(
  drag: DragState<MouseDragData>,
  termCols: number,
  termRows: number,
  geometry: GeometryCache,
  floatId: string,
  edgeSnapCfg: EdgeSnapConfig,
): { x: number; y: number } | null {
  if (drag.phase !== 'dragging') return null;
  if (drag.data.kind !== 'title-bar') return null;

  const dx = drag.currentX - drag.startX;
  const dy = drag.currentY - drag.startY;

  let newX = drag.data.originalX + dx;
  let newY = drag.data.originalY + dy;

  // Find the float geometry for width/height info
  const floatGeo = geometry.floats.find((f) => f.floatId === floatId);
  const floatWidth = floatGeo ? Math.max(floatGeo.titleBarWidth, floatGeo.contentWidth) : 1;
  const floatHeight = floatGeo ? floatGeo.contentY - floatGeo.titleBarY + floatGeo.contentHeight : 1;

  // Edge snap
  const threshold = edgeSnapCfg.threshold;

  // Left edge
  if (newX >= 0 && newX <= threshold) newX = 0;
  // Negative x always snaps to 0
  if (newX < 0) newX = 0;
  // Top edge
  if (newY >= 0 && newY <= threshold) newY = 0;
  // Negative y always snaps to 0
  if (newY < 0) newY = 0;
  // Right edge
  const rightEdge = termCols - floatWidth;
  if (rightEdge > 0 && newX >= rightEdge - threshold && newX <= rightEdge + threshold) newX = rightEdge;
  if (newX > rightEdge && rightEdge > 0) newX = rightEdge;
  // Bottom edge
  const bottomEdge = termRows - floatHeight;
  if (bottomEdge > 0 && newY >= bottomEdge - threshold && newY <= bottomEdge + threshold) newY = bottomEdge;
  if (newY > bottomEdge && bottomEdge > 0) newY = bottomEdge;

  return { x: newX, y: newY };
}

// ---------------------------------------------------------------------------
// Pane lookup helper
// ---------------------------------------------------------------------------

function findPaneAt(geometry: GeometryCache, x: number, y: number): string | null {
  // Check panes in reverse order (last registered = highest priority)
  for (let i = geometry.panes.length - 1; i >= 0; i--) {
    const pane = geometry.panes[i]!;
    if (x >= pane.x && x < pane.x + pane.width && y >= pane.y && y < pane.y + pane.height) {
      return pane.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/** Check if mouse should be enabled based on terminal capabilities */
export function shouldEnableMouse(): boolean {
  return detectCapabilities().mouse ?? false;
}

/** Get tab preview order given current sortable state */
export function getTabPreviewOrder<T>(items: readonly T[], mouseModel: HorizonMouseModel): T[] {
  return getPreviewOrder(items, mouseModel.sortable);
}

/** Check if a specific split separator is being dragged */
export function isDraggingSeparator(mouseModel: HorizonMouseModel, splitId: string): boolean {
  return mouseModel.active.kind === 'resize-split' && mouseModel.active.splitId === splitId;
}

/** Check if a specific float window is being dragged */
export function isDraggingFloat(mouseModel: HorizonMouseModel, floatId: string): boolean {
  return mouseModel.active.kind === 'drag-float' && mouseModel.active.floatId === floatId;
}

export function isResizingFloat(mouseModel: HorizonMouseModel, floatId: string): boolean {
  return mouseModel.active.kind === 'resize-float' && mouseModel.active.floatId === floatId;
}
