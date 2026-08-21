import * as aurora from '@celestial/aurora';

export { spring } from '@celestial/aurora';
export type { A11yLevel, ThemeA11yReport } from '@celestial/corona';
export type {
  AccessibilityRuntime,
  AccessibilitySink,
  Announcement,
  AnnouncePriority,
  AriaAttrs,
  AriaRole,
  FocusIndicatorStyle,
  LiveRegion,
} from './a11y.js';
// ─── A11y ───────────────────────────────────────────────────────────────────
export {
  announce,
  ariaDescribedBy,
  ariaLabel,
  ariaLive,
  createAccessibilityRuntime,
  createAria,
  createLiveRegion,
  describeElement,
  focusIndicator,
  isInteractive,
  isLiveRegion,
  mergeAria,
  role,
  withFocusIndicator,
} from './a11y.js';
export type {
  ActionAvailability,
  ActionDescriptor,
  ActionRegistry,
  ActionResult,
  ActionScope,
  ActionUpdate,
  ResolvedAction,
} from './actions.js';
export { applyAction, createActionRegistry, getAction, getAvailableActions, invokeAction, isActionRegistry, resolveAction } from './actions.js';
export type {
  AgentEvent,
  AgentMessage,
  AgentSubConfig,
  McpServerInfo,
  McpToolInfo,
  RetryPolicy,
  TokenUsage,
  ToolCall,
  TransportConfig,
} from './agent-types.js';
export {
  type AppConfig,
  type AppHandle,
  type AppOptions,
  app,
  type RenderFrameTelemetry,
  type ReplaceConfigOptions,
  type SchedulerConfig,
} from './app.js';
export {
  encodePointerCursor,
  isPointerCursor,
  normalizePointerCursor,
  POINTER_CURSORS,
  supportsPointerCursorOsc22,
} from './pointer-cursor.js';
export type { PointerCursor } from './pointer-cursor.js';
export type {
  AutomationA11yAuditResult,
  AutomationA11yRuleName,
  AutomationA11yViolation,
  AutomationActionSnapshot,
  AutomationElementSnapshot,
  AutomationInteractionAuditOptions,
  AutomationInteractionRuleName,
  AutomationSnapshot,
  AutomationTextRun,
  LensBridgeClient,
  LensBridgeCommand,
  VNodeMeta,
} from './automation.js';
export {
  auditA11yTree,
  auditInteractionTree,
  buildAutomationSnapshot,
  createLensBridgeClientFromEnv,
  extractAutomationTextRuns,
  extractNodeText,
  fingerprintAutomationSnapshot,
  getVNodeMeta,
  setVNodeMeta,
  withClass,
  withMetadata,
  withState,
} from './automation.js';
export type {
  BreakpointContext,
  BreakpointName,
  BreakpointPlugin,
  BreakpointThresholds,
} from './breakpoint.js';
export { breakpointPlugin, createBreakpointContext, DEFAULT_THRESHOLDS, resolveBreakpoint } from './breakpoint.js';
export type { TerminalCapabilities } from './capabilities.js';
export { detectCapabilities, getCapabilities, resetCapabilitiesCache } from './capabilities.js';
// ─── Clipboard ──────────────────────────────────────────────────────────────
export {
  BRACKETED_PASTE_DISABLE,
  BRACKETED_PASTE_ENABLE,
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  ClipboardCmd,
  osc52Copy,
  osc52PasteRequest,
  parseBracketedPaste,
  parseOsc52Response,
  wrapBracketedPaste,
} from './clipboard.js';
export type { Compositor, CompositorOptions, LayoutTransitionConfig } from './compositor.js';
export { createCompositor } from './compositor.js';
export {
  type ConfigDiagnostic,
  type ConfigDiagnosticCode,
  type ConfigDiagnosticStage,
  type ConfigLoadContext,
  type ConfigLoadFailure,
  type ConfigLoadOptions,
  type ConfigLoadResult,
  type ConfigLoadSuccess,
  type ConfigSource,
  type ConfigValidation,
  loadConfig,
} from './config-loader.js';
export type {
  CrashRecoveryGuard,
  CrashRecoveryOptions,
} from './crash-recovery.js';
// ─── Crash Recovery ─────────────────────────────────────────────────────────
export { installCrashRecovery } from './crash-recovery.js';
export { type DebugOptions, debugPlugin } from './debug.js';
export { type DevOptions, devPlugin, loadState, saveState, withStateRecovery } from './dev.js';
export { createDevTools, type DevToolsController, type DevToolsMessageRecord, type DevToolsOptions, type DevToolsState } from './devtools/inspector.js';
export type { FocusOptions, PortalOptions } from './elements.js';
export {
  animated,
  badge,
  box,
  column,
  columnWithGap,
  component,
  conditional,
  divider,
  empty,
  event,
  flex,
  focus,
  gradientText,
  hover,
  imageEl,
  layerStack,
  lazy,
  link,
  list,
  localState,
  memo,
  overlay,
  portal,
  progressBar,
  region,
  row,
  rowWithGap,
  scroll,
  spinnerEl,
  stackedLayers,
  suspense,
  tabGroup,
  text,
  truncatedText,
} from './elements.js';
// ─── JSX / TSX Layer ────────────────────────────────────────────────────────
export {
  Badge as JsxBadge,
  Box,
  Button as JsxButton,
  Card as JsxCard,
  Column as JsxColumn,
  Divider as JsxDivider,
  Focus as JsxFocus,
  Fragment,
  h,
  jsx,
  jsxDEV,
  jsxs,
  normalizeChildren,
  normalizeSingleChild,
  ProgressBar as JsxProgressBar,
  Row as JsxRow,
  Scroll as JsxScroll,
  Spinner as JsxSpinner,
  Text as JsxText,
  TextInput as JsxTextInput,
} from './jsx/index.js';
export type {
  BadgeProps as JsxBadgeProps,
  BaseProps as JsxBaseProps,
  BoxProps,
  ButtonProps as JsxButtonProps,
  CardProps as JsxCardProps,
  Child as JsxChild,
  ColumnProps as JsxColumnProps,
  ComponentFunction,
  DividerProps as JsxDividerProps,
  FocusProps as JsxFocusProps,
  JSX,
  ProgressBarProps as JsxProgressBarProps,
  RowProps as JsxRowProps,
  ScrollProps as JsxScrollProps,
  SpinnerProps as JsxSpinnerProps,
  TextInputProps as JsxTextInputProps,
  TextProps as JsxTextProps,
} from './jsx/index.js';
export type { ErrorBoundaryOptions, ErrorInfo, RecoveryStrategy } from './error-boundary.js';
// ─── Error Boundary ─────────────────────────────────────────────────────────
export {
  errorBoundary,
  simpleErrorBoundary,
} from './error-boundary.js';
export type { FocusNodeInfo, FocusState } from './focus.js';
export {
  applyFocusToTree,
  collectFocusNodes,
  createFocusState,
  focusById,
  focusNext,
  focusPrev,
  popFocusGroup,
  pushFocusGroup,
} from './focus.js';
export { glassShader } from './glass-shader.js';
export type { HitRegionInfo } from './hit-regions.js';
export { collectHitRegions } from './hit-regions.js';
export { applyAutomaticHoverFeedback, usesAutomaticHoverFeedback } from './interaction-feedback.js';
export { buildMigrate, type HotPlugin, type HotPluginOptions, hotPlugin, isProperCmd, wrapRawConfig } from './hot.js';
export type {
  Keybinding,
  KeybindingLayer,
  KeybindingState,
  KeyChord,
  KeyResult,
} from './keybindings.js';
// ─── Keybindings ──────────────────────────────────────────────────────────────
export {
  createKeybindingState,
  findConflicts,
  getActiveBindings,
  getPendingMatches,
  parseKeyString,
  popLayer,
  processKey,
  pushLayer,
  resetChord,
  setMode,
  toKeyChord,
} from './keybindings.js';
export type { KittyKeyEvent } from './kitty-keyboard.js';
export { isKittySequence, KittyFlags, kittyKeyboard, parseKittyKeyInput } from './kitty-keyboard.js';
export type { MachineRegistry, MachineRegistryEntry } from './machine-registry.js';
export { createMachineRegistry } from './machine-registry.js';
// ─── Message Priority ──────────────────────────────────────────────────────
export type { RenderCause, RenderCauseBuilder } from './message-priority.js';
export { classifyMessagePriority, createRenderCauseBuilder, extractMsgType } from './message-priority.js';
export type {
  LogEntry,
  Middleware,
  PersistStorage,
  UndoConfig,
  UndoState,
} from './middleware.js';
// ─── Middleware ──────────────────────────────────────────────────────────────
export {
  composeMiddleware,
  createMiddlewarePipeline,
  hookMiddleware,
  logMiddleware,
  middlewares,
  persistMiddleware,
  undoMiddleware,
} from './middleware.js';
export { resolveMouseHandler } from './mouse.js';
export type { OptimisticOp, OptimisticState } from './optimistic.js';
export {
  applyOptimistic,
  clearResolved,
  confirmOptimistic,
  createOptimisticState,
  getOp,
  getPendingCount,
  rejectOptimistic,
} from './optimistic.js';
export {
  deserializeFromStorage,
  migrateData,
  type PersistedData,
  type PersistenceConfig,
  serializeForStorage,
} from './persistence.js';
export { type ConfigSwapInfo, createPlugin, getAttachedPlugins, loggerPlugin, PLUGINS_SYMBOL, type Plugin, withPlugins } from './plugin.js';
export type {
  FrameProfile,
  Profiler,
  ProfilerOptions,
  ProfilerStats,
  ProfileSample,
  RenderTracer,
  RenderTraceSpan,
} from './profiler.js';
// ─── Profiler ───────────────────────────────────────────────────────────────
export {
  createProfiler,
  createRenderTracer,
  measureDiff,
  measureLayout,
  measureRender,
  profilerPlugin,
} from './profiler.js';
export { createOutputMaskPlugin, maskVNode, type OutputMaskOptions } from './render-mask.js';
export { createRenderWatchdog, type RenderWatchdog } from './render-watchdog.js';
export {
  error,
  idle,
  loading,
  mapResource,
  type Resource,
  success,
} from './resource.js';
// Resource-variant `unwrapOr` intentionally NOT re-exported — duplicates
// `Result.unwrapOr` which is the canonical name. Import directly from
// './resource.js' if you specifically need the Resource variant.
// ─── Scheduler ─────────────────────────────────────────────────────────────
export type { Priority, Scheduler, SchedulerOptions } from './scheduler.js';
export { classifyPriority, createScheduler } from './scheduler.js';
export type {
  IntersectionEntry,
  MomentumState,
  ScrollIndicator,
  ScrollInfo,
  SnapPoint,
  VirtualViewport,
} from './scroll-driver.js';
// ─── Scroll Driver ──────────────────────────────────────────────────────────
export {
  applyScrollDelta,
  computeIntersections,
  computeScrollIndicator,
  computeScrollInfo,
  computeVirtualViewport,
  createMomentumState,
  generateSnapPoints,
  parallaxOffset,
  renderScrollIndicator,
  scrollBy,
  scrollTo,
  scrollToElement,
  snapToNearest,
  stickyPosition,
  tickMomentum,
} from './scroll-driver.js';
export type {
  CellShader,
  NeighborFn,
  ParseCache,
  RGB,
  ShaderCell,
  ShaderFn,
  ShaderOutput,
  ShaderUniforms,
} from './shader.js';
// ─── Shader ──────────────────────────────────────────────────────────────────
export {
  applyShaderOutput,
  applyShaders,
  cellToShaderCell,
  createParseCache,
  parseAnsiToRgb,
  rgbToBgAnsi,
  rgbToFgAnsi,
  shaders,
} from './shader.js';
export { batch, computed, createSignalContext, derived, effect, history, previous, type Signal, type SignalContext, signal } from './signals.js';
export { createStore, type Store } from './state/store.js';
export type { TaskDescriptor, TaskState, TaskStatus } from './tasks.js';
export {
  cancelTask,
  cancelTasksByOwner,
  startTask,
  taskCancelled,
  taskFailed,
  taskIdle,
  taskRunning,
  taskSucceeded,
} from './tasks.js';
export type { KeyEvent } from './terminal.js';
export { createTerminal, type TerminalBackend } from './terminal.js';
export type { ThemeContext, ThemePlugin } from './theme-plugin.js';
export { createThemeContext, themePlugin } from './theme-plugin.js';
export type { ElementMouseEvent, FrameInfo, KeyModifiers, LayoutRects, MouseEventData, StreamSource } from './types.js';
export { Cmd, cmdKind, type Msg, Result, Sub, subKind } from './types.js';
export { type VirtualListOptions, virtualList } from './virtual-list.js';

const auroraEasing = aurora.easing;
export const linear = auroraEasing?.linear ?? ((t: number): number => t);
export const easeIn = auroraEasing?.easeIn ?? ((t: number): number => t * t * t);
export const easeOut =
  auroraEasing?.easeOut ??
  ((t: number): number => {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
  });
export const easeInOut =
  auroraEasing?.easeInOut ??
  ((t: number): number => {
    if (t < 0.5) {
      return 4 * t * t * t;
    }
    const inv = -2 * t + 2;
    return 1 - (inv * inv * inv) / 2;
  });
export type {
  BoxNode,
  CellGrid,
  ColumnNode,
  ComponentNode,
  ComponentRenderContext,
  EchoHint,
  EmptyNode,
  EventHandlers,
  EventNode,
  FlexNode,
  FocusNode,
  HoverNode,
  ImageNode,
  LayerFocusMode,
  LayoutEntry,
  LayoutPlan,
  LayoutPlanOptions,
  LayoutPlanStats,
  LayoutRect,
  LayoutSpace,
  LayoutTraceEntry,
  LazyNode,
  LocalStateNode,
  MemoNode,
  MouseHandler,
  MouseModifierHandler,
  OverlayEntry,
  OverlayNode,
  PortalNode,
  RegionIntent,
  RegionMetadata,
  ResolvedStyleEffects,
  RowNode,
  ScrollNode,
  StyleAttrs,
  SuspenseNode,
  TabGroupNode,
  TextNode,
  VNode,
} from './vdom.js';
export {
  beginLocalStateFrame,
  endLocalStateFrame,
  layout,
  measure,
  planLayout,
  rasterize,
  resolveMemo,
  setLazyScheduleRender,
  setLocalStateScheduleRender,
} from './vdom.js';
export { createWin32InputBridge, needsWin32InputBridge, type Win32InputBridge } from './win32-input.js';
