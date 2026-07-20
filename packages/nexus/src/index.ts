// ─── Terminal Capabilities ────────────────────────────────────────────────

// Re-export nebula scroll-driver types consumers need
export type { MomentumState, SnapPoint } from '@celestial/nebula';
export type { BellOpts } from './bell.js';
// ─── Bell ─────────────────────────────────────────────────────────────────
export { bell } from './bell.js';
export {
  detectCapabilities,
  type FallbackChain,
  fallback,
  type TerminalCapabilities,
  withCapability,
} from './capabilities.js';
export {
  CellHitMap,
  type ElementRegion,
  type EventHandlers,
} from './cell-hitmap.js';
export type {
  ClipboardPathRecorder,
  ClipboardReadOpts,
  ClipboardResult,
  ClipboardSource,
  ClipboardWriteOpts,
} from './clipboard.js';
// ─── Clipboard ────────────────────────────────────────────────────────────
export {
  bracketedPaste,
  osc52ReadRequest,
  osc52Write,
  parseBracketedPaste,
  parseOsc52Response,
  readClipboard,
  writeClipboard,
} from './clipboard.js';
export type { BindingEntry, BindingGroup, ConflictEntry, ConflictRef, ConflictReport } from './conflicts.js';
// ─── Conflict Detection ───────────────────────────────────────────────────
export {
  createBindingGroup,
  detectConflicts,
  fromNebulaKeybindingLayer,
  fromNebulaKeybindingLayers,
  fromNebulaKeybindingState,
} from './conflicts.js';
export type { ContextMenuMsg, ContextMenuRegion, ContextMenuState, MenuItem, SubmenuStackEntry } from './context-menu.js';
// ─── Context Menus ────────────────────────────────────────────────────────
export {
  contextMenu,
  contextMenuUpdate,
  createContextMenuState,
  getActiveItems,
  getSelectedItem,
} from './context-menu.js';
export type { CursorShape } from './cursor.js';
// ─── Cursor ───────────────────────────────────────────────────────────────
export { cursorHide, cursorShow, setCursorShape } from './cursor.js';
// Compatibility helpers (simplified shape + caching)
export {
  _resetCache,
  supportsHyperlinks,
  supportsMouseTracking,
} from './detection.js';
export type { DragMsg, DragPhase, DragState, DropTarget } from './drag.js';
// ─── Drag ─────────────────────────────────────────────────────────────────
export {
  createDragState,
  dragUpdate,
  getDragOffset,
  getDroppedResult,
  isDragging,
  isDropped,
} from './drag.js';
export type { DragThresholdConfig } from './drag-threshold.js';
// ─── Drag Threshold ───────────────────────────────────────────────────────
export {
  DEFAULT_DRAG_THRESHOLD_CONFIG,
  getDragDistance,
  resolveDragThresholdConfig,
  shouldStartDrag,
} from './drag-threshold.js';
export type { TerminalFileDrop } from './external-drop.js';
// ─── External Drop ────────────────────────────────────────────────────────
export { parseTerminalFileDrop } from './external-drop.js';
export type { FocusEvent } from './focus-events.js';
// ─── Focus Events ────────────────────────────────────────────────────────
export { deriveFocusEvents } from './focus-events.js';
export type { FocusFollowsConfig, FocusFollowsMouseMsg, FocusFollowsMouseState } from './focus-follows-mouse.js';
// ─── Focus Follows Mouse ──────────────────────────────────────────────────
export {
  createFocusFollowsMouseState,
  focusFollowsMouseUpdate,
  getFocusedRegionId,
} from './focus-follows-mouse.js';
export type {
  FocusLayer,
  FocusStackMsg,
  FocusStackState,
  FocusStackUpdateResult,
} from './focus-stack.js';
// ─── Focus Stack ─────────────────────────────────────────────────────────
export {
  createFocusStackState,
  focusStackUpdate,
  getActiveFocusId,
  getActiveLayer,
  getLayerById,
  isLayerTrapped,
} from './focus-stack.js';
export type { GestureConfig, GestureEvent, GestureState } from './gesture.js';
// ─── Gesture ──────────────────────────────────────────────────────────────
export {
  checkLongPress,
  createGestureState,
  DEFAULT_GESTURE_CONFIG,
  type MouseEventData,
  processMouseEvent as processGesture,
  resolveConfig as resolveGestureConfig,
} from './gesture.js';
// ─── Hit Testing ──────────────────────────────────────────────────────────
export { HitMap, type HitRegion } from './hitmap.js';
export type {
  HoverIntentConfig,
  HoverIntentEvent,
  HoverIntentMsg,
  HoverIntentState,
  HoverPhase,
} from './hover-intent.js';
// ─── Hover Intent ─────────────────────────────────────────────────────────
export {
  createHoverIntentState,
  DEFAULT_HOVER_INTENT_CONFIG,
  hoverIntentUpdate,
  resolveHoverIntentConfig,
} from './hover-intent.js';
// ─── Hyperlinks ───────────────────────────────────────────────────────────
export { type HyperlinkOpts, hyperlink } from './hyperlink.js';
export type { InertialDragConfig, InertialDragMsg, InertialDragState } from './inertial-drag.js';
// ─── Inertial Drag ────────────────────────────────────────────────────────
export {
  createInertialDragState,
  getInertialDragOffset,
  inertialDragUpdate,
  isInertialDragAnimating,
  isInertialDragging,
} from './inertial-drag.js';
export type { InputRecorder, InputRecording, RecordedInputEvent } from './input-recording.js';
// ─── Input Recording ──────────────────────────────────────────────────────
export { recordInput, replayInput } from './input-recording.js';
export type {
  InteractionTraceEntry,
  InteractionTraceInput,
  InteractionTraceRecorder,
  InteractionTraceResult,
  InteractionTraceResultKind,
  InteractionTraceSnapshot,
  JsonPrimitive,
  JsonValue,
  TraceableInteractionRegion,
} from './interaction-trace.js';
// ─── Interaction Trace ────────────────────────────────────────────────────
export { createInteractionTraceRecorder, recordInteractionTrace, recordRegionRouteTrace } from './interaction-trace.js';
export type { KittyKeyboardFlags, KittyKeyEvent } from './kitty-keyboard.js';
// ─── Kitty Keyboard ───────────────────────────────────────────────────────
export {
  DEFAULT_KITTY_KEYBOARD_FLAGS,
  kittyKeyboardDisable,
  kittyKeyboardEnable,
  kittyKeyboardReset,
  parseKittyKeyboardEvent,
  withKittyKeyboard,
} from './kitty-keyboard.js';
export type { LayeredRegion, LayerHitMap } from './layer-hitmap.js';
// ─── Layer Hit Map ───────────────────────────────────────────────────────
export { createLayerHitMap } from './layer-hitmap.js';
export type { KeyboardRouteOptions, KeyboardRouteResult } from './layer-keyboard.js';
// ─── Layer Keyboard ──────────────────────────────────────────────────────
export { routeKeyboard } from './layer-keyboard.js';
export type { MarqueeRect, MarqueeSelectMsg, MarqueeSelectState } from './marquee-select.js';
// ─── Marquee Select ───────────────────────────────────────────────────────
export {
  createMarqueeSelectState,
  getMarqueeRect,
  hitTestMarquee,
  marqueeSelectUpdate,
  renderMarqueeRect,
} from './marquee-select.js';
// ─── Mouse ────────────────────────────────────────────────────────────────
export {
  disableMouseTracking,
  enableMouseTracking,
  type MouseEvent,
  type MouseTrackingOpts,
  mouseDisable,
  mouseEnable,
  parseMouseEvent,
  parseSgrMouseEvent,
  parseSgrPixelMouseEvent,
  parseUrxvt1015MouseEvent,
  parseX10MouseEvent,
} from './mouse.js';
export type { ListMultiSelectClick, ListMultiSelectItem, ListMultiSelectState } from './multi-select.js';
// ─── List Multi-Select ────────────────────────────────────────────────────
export {
  createListMultiSelectState,
  selectListRange,
  toggleListSelection,
  updateListMultiSelectState,
} from './multi-select.js';
export type {
  CursorClaim,
  CursorPriority,
  CursorType,
  PointerMsg,
  PointerState,
} from './pointer.js';
// ─── Pointer ──────────────────────────────────────────────────────────────
export {
  claimFromHitRegion,
  createPointerState,
  pointerUpdate,
  resolvedCursor,
} from './pointer.js';
export type {
  PointerCaptureEnd,
  PointerCaptureEndKind,
  PointerCaptureMsg,
  PointerCaptureReason,
  PointerCaptureSession,
  PointerCaptureState,
} from './pointer-capture.js';
// ─── Pointer Capture ──────────────────────────────────────────────────────
export {
  createPointerCaptureState,
  getPointerCaptureLocalOffset,
  getPointerCaptureOffset,
  isPointerCaptured,
  isPointerCaptureOwner,
  pointerCaptureUpdate,
} from './pointer-capture.js';
export type { RegionRouteEvent, RegionRouteLayer, RegionRouteMatch, RegionRoutePhase, RegionRouter, RegionRouterOptions } from './region-router.js';
// ─── Region Router ───────────────────────────────────────────────────────
export { createRegionRouter, resolveRegionHandler } from './region-router.js';
export type {
  ResizableRect,
  ResizeConstraints,
  ResizeCursor,
  ResizeEdge,
  ResizeHandleMsg,
  ResizeHandleState,
  ResizePhase,
} from './resize-handle.js';
// ─── Resize Handle ───────────────────────────────────────────────────────
export {
  applyConstraints,
  createResizeHandleState,
  detectEdge,
  edgeToCursor,
  resizeHandleUpdate,
} from './resize-handle.js';
export type {
  AxisLock,
  OverscrollConfig,
  ScrollPhysicsConfig,
  ScrollPhysicsMsg,
  ScrollPhysicsState,
} from './scroll-physics.js';
// ─── Scroll Physics ──────────────────────────────────────────────────────
export {
  createScrollPhysicsState,
  getScrollPosition,
  isScrollAnimating,
  scrollPhysicsUpdate,
} from './scroll-physics.js';
export type {
  MultiSelectState,
  NormalizedRange,
  SelectionAnchor,
  SelectionMode,
  SelectionMsg,
  SelectionRange,
} from './selection.js';
// ─── Selection ────────────────────────────────────────────────────────────
export {
  createSelectionState,
  getSelectedText,
  isCellSelected,
  mergeOverlappingRanges,
  normalizeRange,
  selectionUpdate,
} from './selection.js';
export type { SortableMsg, SortableState } from './sortable.js';
// ─── Sortable ─────────────────────────────────────────────────────────────
export {
  createSortableState,
  getPreviewOrder,
  reorder,
  sortableUpdate,
} from './sortable.js';
export type {
  SpatialDirection,
  SpatialNavMap,
  SpatialNavMsg,
  SpatialNavState,
  SpatialRegion,
} from './spatial-nav.js';
// ─── Spatial Navigation ──────────────────────────────────────────────────
export {
  buildSpatialNavMap,
  createSpatialNavState,
  findSpatialNeighbor,
  spatialNavUpdate,
} from './spatial-nav.js';
// ─── Sync Output ──────────────────────────────────────────────────────────
export { syncOutputBegin, syncOutputEnd, withSyncOutput } from './sync-output.js';
export type { TerminalFocusEvent } from './terminal-focus.js';
// ─── Terminal Focus ───────────────────────────────────────────────────────
export {
  parseTerminalFocusEvent,
  terminalFocusDisable,
  terminalFocusEnable,
} from './terminal-focus.js';
// ─── Window Title ─────────────────────────────────────────────────────────
export { setIconAndTitle, setTabColor, setWindowTitle } from './window-title.js';
