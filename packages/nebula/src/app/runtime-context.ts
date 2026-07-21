import { type AccessibilityRuntime, createAccessibilityRuntime } from '../a11y.js';
import { type ConnectionManager, createConnectionManager } from '../agent-runtime.js';
import type { AgentEvent, RetryPolicy, TransportConfig } from '../agent-types.js';
import type { buildAutomationSnapshot, LensBridgeClient } from '../automation.js';
import { createLensBridgeClientFromEnv } from '../automation.js';
import type { Compositor } from '../compositor.js';
import { createCompositor } from '../compositor.js';
import type { CrashRecoveryGuard } from '../crash-recovery.js';
import { createFocusState, type FocusNodeInfo, type FocusState } from '../focus.js';
import type { HitRegionInfo } from '../hit-regions.js';
import type { MachineRegistry, MachineRegistryEntry } from '../machine-registry.js';
import { classifyMessagePriority, type RenderCause } from '../message-priority.js';
import type { RenderTracer } from '../profiler.js';
import { createRenderWatchdog, type RenderWatchdog } from '../render-watchdog.js';
import { createScheduler, type Priority, type Scheduler } from '../scheduler.js';
import { createTerminal, type KeyEvent, type TerminalBackend } from '../terminal.js';
import { type Cmd, type ElementMouseEvent, type FrameInfo, type MouseEventData, type StreamSource, Sub } from '../types.js';
import { createVNodeStateScope, setVNodeStateScheduleRender, type VNodeStateScope } from '../vdom/state.js';
import type { CellGrid, LayoutPlan } from '../vdom.js';
import type { AppConfig, AppOptions, ReplaceConfigOptions } from './contracts.js';

type AutomationSnapshot = ReturnType<typeof buildAutomationSnapshot>;
type ClipboardRequest = (result: { ok: true; value: string } | { ok: false; error: Error }) => void;
type RunningTaskEntry = { controller: AbortController; owner?: string };

export interface RuntimeContext<Model, M> {
  config: AppConfig<any, any>;
  options: AppOptions | undefined;
  terminal: TerminalBackend;
  useSyncOutput: boolean;
  inlineMode: boolean;
  inlineHeight: number;
  crashGuard: CrashRecoveryGuard | null;
  running: boolean;
  appAbortController: AbortController;
  suspended: boolean;
  terminalSessionActive: boolean;
  model: Model;
  prevGrid: CellGrid | null;
  lastLayoutPlan: LayoutPlan | null;
  compositor: Compositor | null;
  compositorAnimating: boolean;
  vnodeStateScope: VNodeStateScope;
  timers: NodeJS.Timeout[];
  latestTimerSubs: Array<{ ms: number; fire: () => void }>;
  timerInstallIndex: number;
  prevTimerKey: string;
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
  mouseActive: boolean;
  latestAutomationSnapshot: AutomationSnapshot | null;
  pasteActive: boolean;
  windowFocusActive: boolean;
  pendingClipboardRequests: ClipboardRequest[];
  focusState: FocusState;
  frameTick: number;
  renderFrameNumber: number;
  currentHitRegions: HitRegionInfo[];
  isRendering: boolean;
  lastRenderErrorMsg: string | null;
  lastGoodSubs: Sub<M>;
  pendingRenderNeeded: boolean;
  lastHoveredId: string | null;
  lastHoveredRegion: HitRegionInfo | null;
  lastFocusNodes: FocusNodeInfo[];
  lastA11yFocusId: string | null | undefined;
  renderWatchdog: RenderWatchdog | null;
  configVersion: number;
  updateLoopThreshold: number;
  updateLoopWindowMs: number;
  updateLoopCooldownMs: number;
  updateTimestamps: number[];
  lastUpdateLoopFiredAt: number;
  renderScheduled: boolean;
  renderTimer: NodeJS.Timeout | null;
  lastRenderAt: number;
  initialRenderDone: boolean;
  animFrameTimer: NodeJS.Timeout | null;
  animFrameCount: number;
  animFrameLastTime: number;
  suspendSignalHandler: (() => void) | null;
  resumeSignalHandler: (() => void) | null;
  accessibilityRuntime: AccessibilityRuntime;
  lensBridge: LensBridgeClient | null;
  renderTracer: RenderTracer | null;
  connectionManager: ConnectionManager<M>;
  activeAgentIds: Set<string>;
  agentFingerprints: Map<string, string>;
  runningTasks: Map<string, Set<RunningTaskEntry>>;
  scheduler: Scheduler | null;
  classifyMsg: (msg: unknown) => Priority;
  renderGeneration: number;
  lastRenderCause: RenderCause | null;
  lastDispatchedMsgType: string;
  lastDispatchedPriority: Priority;
  currentRenderPriority: Priority;
  combinatorDebounceTimers: Map<string, NodeJS.Timeout>;
  combinatorThrottleTimestamps: Map<string, number>;
  combinatorDistinctLast: Map<string, { value: unknown }>;
  debouncedCmdTimers: Map<string, { timer: NodeJS.Timeout; cancel: () => void }>;
  idleTimers: Map<number, NodeJS.Timeout>;
  idleSubs: Array<{ ms: number; fire: () => void }>;
  activePhaseIds: Set<string>;
  phaseUnsubscribers: Map<string, () => void>;
  phaseRegistries: Map<string, MachineRegistry>;
  activePhaseEntries: Map<string, MachineRegistryEntry>;
  phaseMachineRefs: Map<string, unknown>;
  phaseHandlers: Map<string, (state: unknown, prev: unknown | null) => boolean>;
  activeStreamIds: Set<string>;
  activeStreamSources: Map<string, StreamSource>;
  streamHandlers: Map<string, (data: unknown) => void>;
  streamRestartKeys: Map<string, string | number | undefined>;
  dispatch: (msg: M) => void;
  executeCmd: (cmd: Cmd<M>) => void;
  render: () => void;
  scheduleRender: () => void;
  cancelScheduledRender: () => void;
  resetCompositorState: () => void;
  safeGetSubs: () => Sub<M>;
  notifyRenderError: (err: unknown) => void;
  flushAccessibilityAnnouncements: () => void;
  clearDebouncedCmdTimers: () => void;
  clearIdleTimers: () => void;
  armIdleTimers: () => void;
  resetIdleTimers: () => void;
  combinatorInnerSub: (kind: ReturnType<typeof import('../types.js').subKind<M>>) => Sub<M>;
  wrapSubDispatch: (kind: ReturnType<typeof import('../types.js').subKind<M>>, key: string, dispatch: (message: M) => void) => (message: M) => void;
  hasPasteSub: (sub: Sub<M>) => boolean;
  hasMouseSub: (sub: Sub<M>) => boolean;
  hasResizeSub: (sub: Sub<M>) => boolean;
  hasWindowFocusSub: (sub: Sub<M>) => boolean;
  collectSubs: (sub: Sub<M>) => void;
  reconcileSubscriptions: () => void;
  dispatchAnimationFrame: (info: FrameInfo) => void;
  dispatchPasteEvent: (sub: Sub<M>, text: string) => void;
  dispatchKeyEvent: (sub: Sub<M>, event: KeyEvent) => void;
  dispatchMouseEvent: (sub: Sub<M>, event: MouseEventData) => void;
  dispatchResizeEvent: (sub: Sub<M>, cols: number, rows: number) => void;
  dispatchFocusChange: (sub: Sub<M>, focusedId: string | null) => void;
  dispatchWindowFocus: (sub: Sub<M>, focused: boolean) => void;
  dispatchLayoutFeedback: (sub: Sub<M>, plan: LayoutPlan) => void;
  dispatchElementMouseEvent: (sub: Sub<M>, event: ElementMouseEvent) => void;
  dispatchAutoElementMouse: (sub: Sub<M>, event: MouseEventData) => void;
  matchKeySub: (sub: Sub<M>, key: string, event: { ctrl: boolean; alt: boolean; shift: boolean }) => void;
  handleInput: (data: Buffer) => void;
  attachRuntimeHandlers: () => void;
  detachRuntimeHandlers: () => void;
  enterTerminalSession: (initial: boolean) => void;
  exitTerminalSession: (final: boolean) => void;
  suspend: () => void;
  resume: () => void;
  replaceConfig: (newConfig: AppConfig<any, any>, opts?: ReplaceConfigOptions) => void;
  shutdown: () => void;
  installSuspendResumeHandlers: () => void;
  uninstallSuspendResumeHandlers: () => void;
  detachActivePhase: (id: string, removeRegistryEntry: boolean) => void;
  parseWindowFocusEvent: (input: string) => { focused: boolean; start: number; end: number } | null;
}

function notInstalled(name: string): never {
  throw new Error(`nebula app runtime method not installed: ${name}`);
}

export function createRuntimeContext<Model, M>(initialConfig: AppConfig<Model, M>, options?: AppOptions): RuntimeContext<Model, M> {
  const terminalBackend = options?.terminal ?? createTerminal();
  const rawTerminalWrite = terminalBackend.write.bind(terminalBackend);
  const debugTerminalWritePattern = /\x1b\[\?(?:1000|1002|1003|1004|1006|1049|2026)[hl]|\x1bc|\x1b\[!p/;
  const terminal: TerminalBackend = {
    enterRawMode: terminalBackend.enterRawMode.bind(terminalBackend),
    exitRawMode: terminalBackend.exitRawMode.bind(terminalBackend),
    onInput: terminalBackend.onInput.bind(terminalBackend),
    offInput: terminalBackend.offInput.bind(terminalBackend),
    onResize: terminalBackend.onResize.bind(terminalBackend),
    offResize: terminalBackend.offResize.bind(terminalBackend),
    getSize: terminalBackend.getSize.bind(terminalBackend),
    write(data: string): void {
      if (process.env.CELESTIAL_DEBUG_INPUT && debugTerminalWritePattern.test(data)) {
        process.stderr.write(
          `[term-write] len=${data.length} hex=${Buffer.from(data).toString('hex').slice(0, 120)} str=${JSON.stringify(data.replace(/\x1b/g, '\\x1b').slice(0, 80))}\n`,
        );
      }
      rawTerminalWrite(data);
    },
  };

  const inlineOpt = options?.inline;
  const scheduler = options?.scheduler
    ? createScheduler(typeof options.scheduler === 'object' ? { frameDeadlineMs: options.scheduler.frameDeadlineMs } : undefined)
    : null;
  const updateLoopWindowMs = options?.updateLoopGuard?.windowMs ?? 100;
  const vnodeStateScope = createVNodeStateScope();
  const ctx: RuntimeContext<Model, M> = {
    config: initialConfig,
    options,
    terminal,
    useSyncOutput: options?.syncOutput !== false,
    inlineMode: !!inlineOpt,
    inlineHeight: inlineOpt === true ? 10 : typeof inlineOpt === 'object' ? inlineOpt.height : 0,
    crashGuard: null,
    running: true,
    appAbortController: new AbortController(),
    suspended: false,
    terminalSessionActive: false,
    model: undefined as Model,
    prevGrid: null,
    lastLayoutPlan: null,
    compositor: options?.compositor ? createCompositor(options.compositor) : null,
    compositorAnimating: false,
    vnodeStateScope,
    timers: [],
    latestTimerSubs: [],
    timerInstallIndex: 0,
    prevTimerKey: '',
    inputHandler: null,
    resizeHandler: null,
    mouseActive: false,
    latestAutomationSnapshot: null,
    pasteActive: false,
    windowFocusActive: false,
    pendingClipboardRequests: [],
    focusState: createFocusState(),
    frameTick: 0,
    renderFrameNumber: 0,
    currentHitRegions: [],
    isRendering: false,
    lastRenderErrorMsg: null,
    lastGoodSubs: Sub.none() as Sub<M>,
    pendingRenderNeeded: false,
    lastHoveredId: null,
    lastHoveredRegion: null,
    lastFocusNodes: [],
    lastA11yFocusId: undefined,
    renderWatchdog: options?.renderTimeout ? createRenderWatchdog(options.renderTimeout) : null,
    configVersion: 0,
    updateLoopThreshold: options?.onUpdateLoop ? (options.updateLoopGuard?.threshold ?? 200) : 0,
    updateLoopWindowMs,
    updateLoopCooldownMs: updateLoopWindowMs * 5,
    updateTimestamps: [],
    lastUpdateLoopFiredAt: 0,
    renderScheduled: false,
    renderTimer: null,
    lastRenderAt: 0,
    initialRenderDone: false,
    animFrameTimer: null,
    animFrameCount: 0,
    animFrameLastTime: 0,
    suspendSignalHandler: null,
    resumeSignalHandler: null,
    accessibilityRuntime: createAccessibilityRuntime(options?.accessibility),
    lensBridge: createLensBridgeClientFromEnv(),
    renderTracer: options?.renderTracer ?? null,
    connectionManager: createConnectionManager<M>(),
    activeAgentIds: new Set(),
    agentFingerprints: new Map(),
    runningTasks: new Map(),
    scheduler,
    classifyMsg: options?.classifyMessage ?? classifyMessagePriority,
    renderGeneration: 0,
    lastRenderCause: null,
    lastDispatchedMsgType: 'init',
    lastDispatchedPriority: 'normal',
    currentRenderPriority: 'normal',
    combinatorDebounceTimers: new Map(),
    combinatorThrottleTimestamps: new Map(),
    combinatorDistinctLast: new Map(),
    debouncedCmdTimers: new Map(),
    idleTimers: new Map(),
    idleSubs: [],
    activePhaseIds: new Set(),
    phaseUnsubscribers: new Map(),
    phaseRegistries: new Map(),
    activePhaseEntries: new Map(),
    phaseMachineRefs: new Map(),
    phaseHandlers: new Map(),
    activeStreamIds: new Set(),
    activeStreamSources: new Map(),
    streamHandlers: new Map(),
    streamRestartKeys: new Map(),
    dispatch: () => notInstalled('dispatch'),
    executeCmd: () => notInstalled('executeCmd'),
    render: () => notInstalled('render'),
    scheduleRender: () => notInstalled('scheduleRender'),
    cancelScheduledRender: () => notInstalled('cancelScheduledRender'),
    resetCompositorState: () => notInstalled('resetCompositorState'),
    safeGetSubs: () => notInstalled('safeGetSubs'),
    notifyRenderError: () => notInstalled('notifyRenderError'),
    flushAccessibilityAnnouncements: () => notInstalled('flushAccessibilityAnnouncements'),
    clearDebouncedCmdTimers: () => notInstalled('clearDebouncedCmdTimers'),
    clearIdleTimers: () => notInstalled('clearIdleTimers'),
    armIdleTimers: () => notInstalled('armIdleTimers'),
    resetIdleTimers: () => notInstalled('resetIdleTimers'),
    combinatorInnerSub: () => notInstalled('combinatorInnerSub'),
    wrapSubDispatch: () => notInstalled('wrapSubDispatch'),
    hasPasteSub: () => notInstalled('hasPasteSub'),
    hasMouseSub: () => notInstalled('hasMouseSub'),
    hasResizeSub: () => notInstalled('hasResizeSub'),
    hasWindowFocusSub: () => notInstalled('hasWindowFocusSub'),
    collectSubs: () => notInstalled('collectSubs'),
    reconcileSubscriptions: () => notInstalled('reconcileSubscriptions'),
    dispatchAnimationFrame: () => notInstalled('dispatchAnimationFrame'),
    dispatchPasteEvent: () => notInstalled('dispatchPasteEvent'),
    dispatchKeyEvent: () => notInstalled('dispatchKeyEvent'),
    dispatchMouseEvent: () => notInstalled('dispatchMouseEvent'),
    dispatchResizeEvent: () => notInstalled('dispatchResizeEvent'),
    dispatchFocusChange: () => notInstalled('dispatchFocusChange'),
    dispatchWindowFocus: () => notInstalled('dispatchWindowFocus'),
    dispatchLayoutFeedback: () => notInstalled('dispatchLayoutFeedback'),
    dispatchElementMouseEvent: () => notInstalled('dispatchElementMouseEvent'),
    dispatchAutoElementMouse: () => notInstalled('dispatchAutoElementMouse'),
    matchKeySub: () => notInstalled('matchKeySub'),
    handleInput: () => notInstalled('handleInput'),
    attachRuntimeHandlers: () => notInstalled('attachRuntimeHandlers'),
    detachRuntimeHandlers: () => notInstalled('detachRuntimeHandlers'),
    enterTerminalSession: () => notInstalled('enterTerminalSession'),
    exitTerminalSession: () => notInstalled('exitTerminalSession'),
    suspend: () => notInstalled('suspend'),
    resume: () => notInstalled('resume'),
    replaceConfig: () => notInstalled('replaceConfig'),
    shutdown: () => notInstalled('shutdown'),
    installSuspendResumeHandlers: () => notInstalled('installSuspendResumeHandlers'),
    uninstallSuspendResumeHandlers: () => notInstalled('uninstallSuspendResumeHandlers'),
    detachActivePhase: () => notInstalled('detachActivePhase'),
    parseWindowFocusEvent: () => notInstalled('parseWindowFocusEvent'),
  };

  setVNodeStateScheduleRender(vnodeStateScope, () => {
    if (ctx.running && !ctx.suspended) ctx.scheduleRender();
  });

  return ctx;
}

export type { AgentEvent, RetryPolicy, TransportConfig };
