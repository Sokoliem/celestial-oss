import type { AccessibilitySink } from '../a11y.js';
import type { CompositorOptions } from '../compositor.js';
import type { RenderCause } from '../message-priority.js';
import type { RenderTracer } from '../profiler.js';
import type { Priority } from '../scheduler.js';
import type { CellShader } from '../shader.js';
import type { TerminalBackend } from '../terminal.js';
import type { Cmd, Sub } from '../types.js';
import type { LayoutPlan, VNode } from '../vdom.js';

export interface AppConfig<Model, M> {
  init: () => [Model, Cmd<M>];
  update: (msg: M, model: Model) => [Model, Cmd<M>];
  view: (model: Model) => VNode;
  subscriptions: (model: Model) => Sub<M>;
  shaders?: CellShader[] | ((model: Model) => CellShader[]);
}

export interface RenderFrameTelemetry {
  readonly frameNumber: number;
  readonly msgType: string;
  readonly priority: Priority;
  readonly cols: number;
  readonly rows: number;
  readonly totalMs: number;
  readonly overBudget: boolean;
  readonly interrupted: boolean;
  readonly committed: boolean;
  readonly phases: ReadonlyArray<{ readonly name: string; readonly ms: number }>;
  readonly layoutStats?: LayoutPlan['stats'];
  readonly error?: unknown;
}

export interface AppOptions {
  /** Inject a custom terminal backend (e.g. for testing). Defaults to the real process.stdin/stdout backend. */
  terminal?: TerminalBackend;
  /**
   * Enable DEC private mode 2026 synchronized output to prevent visual
   * tearing/flicker during frame rendering.  When enabled, each frame is
   * wrapped with begin/end sequences that tell the terminal to batch all
   * output and render it atomically.
   *
   * - `true`  — always emit sync sequences (default)
   * - `false` — disable sync sequences
   */
  syncOutput?: boolean;

  /** File path to write crash logs to. When set, crash reports include model snapshots. */
  crashLogPath?: string;

  /** Disable automatic crash recovery (terminal state restoration on crash/signal). */
  disableCrashRecovery?: boolean;

  /**
   * Enable inline mode — renders within the existing terminal content
   * instead of using the alternate screen buffer.
   *
   * - `true`  — inline mode with default height (10 rows)
   * - `{ height: N }` — inline mode with custom height
   */
  inline?: boolean | { height: number };

  /** Registry of custom command executors. Key = command tag, value = async executor function. */
  commandHandlers?: Record<string, (payload: unknown) => Promise<unknown>>;

  /** Optional accessibility sink for focus changes and announcements. */
  accessibility?: AccessibilitySink;

  /** Optional render tracer for structured render pipeline tracing. */
  renderTracer?: RenderTracer;

  /** Called when the render pipeline throws. The previous frame is preserved on screen. */
  onRenderError?: (error: unknown) => void;

  /**
   * Where caught update/view/subscription errors go when `onRenderError` is not
   * supplied.
   *
   * - `'stderr'` (default) — write the message and stack to `process.stderr`
   * - `'silent'` — on-screen red row only
   *
   * The runtime always keeps the app running; this controls whether the failure
   * leaves a trace beyond a single terminal row that the next repaint erases.
   */
  renderErrorReporting?: 'stderr' | 'silent';
  /** Called when the render pipeline recovers after a previous error. */
  onRenderRecovery?: () => void;

  /**
   * Maximum render duration in milliseconds before the process is terminated.
   * Protects against infinite loops in hot-reloaded view/update code.
   * Uses a worker thread watchdog — only enable during development.
   * Recommended: 5000–10000. Disabled by default.
   */
  renderTimeout?: number;

  /**
   * Update-loop guard. When more than `threshold` dispatches occur within
   * `windowMs`, the callback fires once per cooldown window (windowMs * 5).
   * Designed to catch infinite re-render loops introduced by a hot reload —
   * the wrapper can use this signal to roll back to last-known-good or
   * escalate to a full restart.
   *
   * Default: { threshold: 200, windowMs: 100 } when onUpdateLoop is set.
   * Disabled when onUpdateLoop is omitted.
   */
  updateLoopGuard?: { threshold?: number; windowMs?: number };

  /** Called when the update-loop guard trips. See `updateLoopGuard`. */
  onUpdateLoop?: (info: { count: number; windowMs: number }) => void;

  /**
   * Enable the priority scheduler for interruptible rendering.
   *
   * When enabled, the render pipeline checks for higher-priority messages
   * between phases (view, layout, rasterize, shaders, diff). If a
   * higher-priority message arrives mid-render, the current render is
   * abandoned and restarted with the new model state.
   *
   * **IMPORTANT**: This is opt-in. When disabled (the default), the render
   * pipeline behaves exactly as it always has — fully synchronous, no
   * yielding, no interruption. This is the safe default for all existing apps.
   *
   * - `true`  — enable with default settings
   * - `false` — disable (default)
   * - `SchedulerConfig` — enable with custom settings
   */
  scheduler?: boolean | SchedulerConfig;

  /**
   * Custom message priority classifier. When the scheduler is enabled,
   * this function determines the rendering priority of each dispatched
   * message. The default classifier uses heuristic pattern matching on
   * the message's type/kind/tag field.
   */
  classifyMessage?: (msg: unknown) => Priority;

  /**
   * Called when a render is interrupted by a higher-priority message.
   * Useful for debugging and performance monitoring.
   */
  onRenderInterrupt?: (cause: RenderCause) => void;

  /**
   * Called after each render attempt, including interrupted or failed attempts.
   * The callback is synchronous and should stay lightweight.
   */
  onRenderFrame?: (frame: RenderFrameTelemetry) => void;

  /**
   * Enable compositor-driven visual interpolation for layoutIds.
   * Logical layout feedback and hit regions continue to use the snapped plan.
   */
  compositor?: (CompositorOptions & { animateOnlyOverrides?: boolean }) | false;
}

export interface SchedulerConfig {
  /** Maximum time slice before yielding between phases (ms). Default: 8. */
  frameDeadlineMs?: number;
}

export interface ReplaceConfigOptions {
  /** Transform the old model to fit the new config's expected shape */
  migrate?: (oldModel: unknown) => unknown;
  /**
   * Run a dry-validate phase before committing the swap (default: false).
   * When true, calls migrate, then probes newConfig.view() and newConfig.subscriptions()
   * on the migrated model. If any step throws, the existing config and model are preserved
   * and replaceConfig re-throws so the caller can roll back (e.g. fall back to last-known-good).
   * Default false preserves the historical contract where reload errors are swallowed and
   * surfaced via onRenderError; the hot-reload path opts in for atomicity.
   */
  validate?: boolean;
}

export interface AppHandle<M = unknown> {
  /** Dispatch a message through the same update, command, and render path used by subscriptions. */
  dispatch(message: M): void;
  stop(): void;
  suspend(): void;
  resume(): void;
  /** Swap the app's config in-place, preserving model state. Triggers a full re-render. */
  replaceConfig(newConfig: AppConfig<any, any>, options?: ReplaceConfigOptions): void;
  /** Force a full re-render, discarding the diff cache. Useful for programmatic screenshots and Lens agent captures. */
  requestRedraw(): void;
  /** The current model state (read-only) */
  readonly model: unknown;
}
