/**
 * @celestial/horizon
 *
 * A high-performance, layout-centric UI framework for the Celestial TUI ecosystem.
 */

// ─── Layout Animation System ───────────────────────────────────────────────
export {
  type AnimatedLayoutModel,
  type AnimatedLayoutMsg,
  animatedLayoutUpdate,
  type CollapseAnimationConfig,
  type CollapseAnimationModel,
  type CollapseAnimationMsg,
  collapseAnimationUpdate,
  createAnimatedLayoutModel,
  createCollapseAnimationModel,
  createRatioAnimationModel,
  getAnimatedLayoutValues,
  getAnimatedRatio,
  getCollapseProgress,
  isAnimationComplete,
  isCollapseAnimationComplete,
  isRatioAnimationComplete,
  type LayoutAnimationConfig,
  type LayoutTransition,
  type RatioAnimationModel,
  type RatioAnimationMsg,
  ratioAnimationUpdate,
  transitions,
} from './animation.js';
// ─── Breadcrumb Trail ─────────────────────────────────────────────────────
export {
  type BreadcrumbTrailModel,
  type BreadcrumbTrailMsg,
  breadcrumbTrailUpdate,
  canGoBack,
  canGoForward,
  createBreadcrumbTrailModel,
  getCurrentBreadcrumb,
  pushFocusChange,
} from './breadcrumb-trail.js';
export * from './compat/index.js';
// ─── Constraint System ────────────────────────────────────────────────────
export {
  applySplitConstraints,
  applyTileConstraints,
  type ConstraintModel,
  type ConstraintMsg,
  constraintUpdate,
  createConstraintModel,
  DEFAULT_CONSTRAINT,
  getConstraint,
  isCollapsed,
  isCollapsible,
  isLocked,
  type PaneConstraint,
  resolveConstraints,
  type SizeRequest,
} from './constraints.js';
export * from './core/index.js';
// ─── Layout Dev Tools ───────────────────────────────────────────────────
export {
  disableLayoutDebugLogging,
  enableLayoutDebugLogging,
  getLayoutPerformanceMetrics,
  incrementAnimationCount,
  isDebugLoggingEnabled,
  type LayoutInspectorConfig,
  type LayoutPerformanceMetrics,
  type LayoutTreeInspectorConfig,
  layoutDebugLog,
  layoutInspector,
  layoutTreeInspector,
  recordLayoutTime,
  recordRenderTime,
  resetPerformanceMetrics,
} from './dev.js';
export * from './floating-window-drag.js';
// ─── Peek ────────────────────────────────────────────────────────────────
export {
  createPeekModel,
  isPeekingPanel,
  isPinnedPanel,
  type PeekModel,
  type PeekMsg,
  peekUpdate,
} from './peek.js';
// ─── Pointer-capture (nexus primitive, surfaced for drag/resize gestures) ──
export type {
  PointerCaptureEnd,
  PointerCaptureEndKind,
  PointerCaptureMsg,
  PointerCaptureReason,
  PointerCaptureSession,
  PointerCaptureState,
} from './pointer-capture.js';
export {
  createPointerCaptureState,
  getPointerCaptureLocalOffset,
  getPointerCaptureOffset,
  isPointerCaptured,
  isPointerCaptureOwner,
  pointerCaptureUpdate,
} from './pointer-capture.js';
// ─── Themes & Presets ─────────────────────────────────────────────────────
export {
  getIDEPreset,
  getShellPreset,
  getTheme,
  type IDEPreset,
  type IDEPresetName,
  idePresets,
  type LayoutTheme,
  listThemes,
  type PanelTheme,
  type ShellPreset,
  type ShellPresetName,
  shellPresets,
  type ThemeName,
  themes,
} from './presets.js';
export * from './primitives/index.js';
// ─── Responsive System ──────────────────────────────────────────────────
export {
  type BreakpointConfig,
  type BreakpointName,
  getBreakpoints,
  getColumns,
  getCurrentBreakpoint,
  getRows,
  isBreakpoint,
  isBreakpointOrAbove,
  isBreakpointOrBelow,
  mediaQuery,
  type ResponsivePanelOptions,
  type ResponsiveSplitOptions,
  resolveResponsiveOptions,
  resolveResponsiveSplitOptions,
  responsiveLayout,
  responsiveValue,
  setBreakpoints,
  when,
} from './responsive.js';
// ─── Window Snapping ─────────────────────────────────────────────────────
export {
  computeSnappedPosition,
  type SnapConfig,
  type SnapGuide,
} from './snap.js';
export { applySnapZone, computeSnapZones, previewSnapZone, type SnapPreview, type SnapZone, type SnapZoneKind, type SnapZoneOptions } from './snap-zones.js';
// ─── Spatial nav (nexus primitive, surfaced for tab/pane keyboard nav) ─────
export type { SpatialDirection, SpatialNavMap, SpatialNavMsg, SpatialNavState, SpatialRegion } from './spatial-nav.js';
export { buildSpatialNavMap, createSpatialNavState, findSpatialNeighbor, spatialNavUpdate } from './spatial-nav.js';
export {
  createHorizonSplitController,
  type HorizonSplitController,
  type HorizonSplitControllerOptions,
  splitPaneFromController,
} from './split-controller.js';
export * from './mouse.js';
export * from './window-manager-pointer.js';
export * from './state/index.js';
// ─── Weighted Pane Stack ─────────────────────────────────────────────────
export {
  getWeightedPaneStackLayout,
  type PaneRange,
  type PaneSpec,
  type ResizeHandleRange,
  type WeightedPaneStackConfig,
  type WeightedPaneStackLayout,
  weightedPaneStack,
} from './weighted-pane-stack.js';
