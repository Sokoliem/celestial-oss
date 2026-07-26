/**
 * createTestApp — spin up a Nebula app with a MockTerminal for testing.
 *
 * Provides helpers to inspect rendered output, simulate input, dispatch
 * messages, and cleanly shut down.
 */

import {
  type Announcement,
  type AppConfig,
  type AppHandle,
  type AppOptions,
  type AutomationSnapshot,
  app,
  applyFocusToTree,
  buildAutomationSnapshot,
  type CellGrid,
  layout,
} from '@celestial/core/nebula';
import { fireKey, fireMouse } from './events.js';
import { gridToPlainLines } from './internal/grid-text.js';
import { MockTerminal, type MockTerminalOptions } from './mock-terminal.js';
import { type FetchMockDefinition, installFetchMocks, type SubprocessMockDefinition } from './mocks.js';
import type { KeyModifiers, MessageCoverage } from './types.js';

export interface TestAppHandle<Model, M> {
  /** The underlying MockTerminal for advanced inspection */
  terminal: MockTerminal;

  /** Get the plain text (ANSI stripped) of the last rendered frame */
  lastFrame(): string;

  /** Get the raw output (with ANSI escape sequences) of the last rendered frame */
  lastFrameRaw(): string;

  /** Simulate pressing a key, optionally with modifiers */
  pressKey(key: string, modifiers?: KeyModifiers): void;

  /** Simulate typing a string (sends each character as a separate key press) */
  type(str: string): void;

  /** Dispatch a message directly to the app's update function */
  dispatch(msg: M): void;

  /**
   * Wait for the next render update. Resolves after a microtask flush
   * to allow any async commands or effects to settle.
   */
  waitForUpdate(): Promise<void>;

  /** Get the current model state */
  readonly model: Model;

  /** Cleanly stop the app and remove all listeners */
  stop(): void;

  /** Temporarily detach terminal IO while preserving model state */
  suspend(): void;

  /** Reattach terminal IO and repaint the preserved model state */
  resume(): void;

  /** Captured runtime accessibility announcements */
  announcements(): readonly Announcement[];

  /** Captured runtime focus change descriptions */
  focusEvents(): readonly { description: string; focusedId: string | null }[];

  /** Structured semantic snapshot of the current UI state */
  snapshot(): AutomationSnapshot;

  /** Simulate a mouse click at terminal coordinates, optionally with held modifiers. */
  click(col: number, row: number, button?: 'left' | 'right' | 'middle', modifiers?: KeyModifiers): void;

  /** Simulate a drag from (x1,y1) to (x2,y2) — sends press, move, release */
  drag(x1: number, y1: number, x2: number, y2: number): void;

  /** Simulate mouse scroll at terminal coordinates (negative = up, positive = down) */
  scrollAt(col: number, row: number, delta: number): void;

  /** Inspect dispatched message coverage by msg.type */
  messageCoverage(): MessageCoverage;

  /** Reset collected message coverage */
  resetMessageCoverage(): void;

  /**
   * Errors the runtime caught from update, view, subscriptions, or lifecycle.
   * Nebula swallows these to keep the app running, so this is the only way a
   * test can tell a silently broken app from a working one.
   */
  renderErrors(): readonly unknown[];

  /** Drop collected render errors — useful when a test asserts a failure on purpose. */
  clearRenderErrors(): void;
}

export interface TestAppOptions extends MockTerminalOptions {
  commandHandlers?: AppOptions['commandHandlers'];
  fetchMocks?: readonly FetchMockDefinition[];
  /** Allow unmatched requests to reach the previously installed fetch implementation. Defaults to false. */
  fetchPassthrough?: boolean;
  subprocessMocks?: readonly SubprocessMockDefinition[];
  /**
   * Called when the runtime catches an error thrown from update, view,
   * subscriptions, or a lifecycle hook. Runs in addition to collection, not
   * instead of it — `handle.renderErrors()` still records the error.
   */
  onRenderError?: (error: unknown) => void;
  /**
   * How caught runtime errors surface.
   *
   * - `'throw'` (default) — rethrow on a microtask so the test fails
   * - `'collect'` — record only; read them via `handle.renderErrors()`
   *
   * Nebula deliberately catches update/view/subscription errors to keep an app
   * running, which means a test asserting only on frame content cannot tell a
   * broken update from a working one. Throwing by default means a test has to
   * opt in to tolerating a broken app rather than opting in to noticing.
   *
   * Use `'collect'` when a test drives a failure on purpose.
   */
  renderErrors?: 'collect' | 'throw';
}

/**
 * Create a test app instance. Returns a handle with helpers for
 * inspecting output, simulating input, and managing lifecycle.
 */
export function createTestApp<Model, M>(config: AppConfig<Model, M>, options?: TestAppOptions): TestAppHandle<Model, M> {
  const terminal = new MockTerminal(options);
  let currentModel: Model;
  let renderFrame = 0;
  let expectedRenderFrame: number | null = null;
  const renderWaiters = new Set<{ target: number; resolve: () => void }>();
  const renderErrorLog: unknown[] = [];
  /** Errors awaiting report in 'throw' mode. Drained by waitForUpdate(). */
  const pendingRenderErrors: unknown[] = [];
  const announcementLog: Announcement[] = [];
  const focusLog: Array<{ description: string; focusedId: string | null }> = [];
  const coverageCounts = new Map<string, number>();
  let unknownMessages = 0;
  const restoreFetch = installFetchMocks(options?.fetchMocks, options?.fetchPassthrough);

  const proxyConfig: AppConfig<Model, M> = {
    init: () => {
      const [model, cmd] = config.init();
      currentModel = model;
      return [model, cmd];
    },

    update: (msg: M, model: Model) => {
      recordMessage(msg);
      const [newModel, cmd] = config.update(msg, model);
      currentModel = newModel;
      return [newModel, cmd];
    },

    view: config.view,

    subscriptions: config.subscriptions,
  };

  let appHandle: AppHandle & { dispatch(message: M): void };
  try {
    appHandle = app(proxyConfig, {
      terminal,
      commandHandlers: createCommandHandlers(options),
      onRenderFrame() {
        renderFrame += 1;
        for (const waiter of renderWaiters) {
          if (renderFrame >= waiter.target) {
            renderWaiters.delete(waiter);
            waiter.resolve();
          }
        }
      },
      accessibility: {
        onAnnouncements(items) {
          announcementLog.push(...items);
        },
        onFocusChange(description, focusedId) {
          focusLog.push({ description, focusedId });
        },
      },
      onRenderError(error) {
        renderErrorLog.push(error);
        if ((options?.renderErrors ?? 'throw') === 'throw') pendingRenderErrors.push(error);
        options?.onRenderError?.(error);
      },
    }) as AppHandle & { dispatch(message: M): void };
  } catch (error) {
    restoreFetch();
    throw error;
  }

  /**
   * Build a CellGrid from the current model's view, matching what the
   * runtime renders to the terminal.
   */
  function currentFocusedId(): string | null {
    return focusLog.length > 0 ? focusLog[focusLog.length - 1]!.focusedId : null;
  }

  function currentGrid(): CellGrid {
    const { cols, rows } = terminal.getSize();
    const vnode = applyFocusToTree(config.view(currentModel), currentFocusedId());
    return layout(vnode, cols, rows);
  }

  /**
   * Convert a CellGrid into an array of plain-text lines (trailing
   * whitespace trimmed, trailing empty lines removed).
   */
  function gridToLines(grid: CellGrid): string[] {
    return gridToPlainLines(grid);
  }

  function getLastFrame(): string {
    return gridToLines(currentGrid()).join('\n');
  }

  function getLastFrameRaw(): string {
    // Return the raw terminal output since the last clear-screen
    const output = terminal.output;
    const clearScreenSeq = '\x1b[2J';
    const lastClear = output.lastIndexOf(clearScreenSeq);
    if (lastClear !== -1) {
      return output.slice(lastClear + clearScreenSeq.length);
    }
    return output;
  }

  function expectRender(): void {
    expectedRenderFrame = Math.max(expectedRenderFrame ?? 0, renderFrame + 1);
  }

  function pressKey(key: string, modifiers?: KeyModifiers): void {
    expectRender();
    fireKey(terminal, key, modifiers);
  }

  function typeStr(str: string): void {
    expectRender();
    for (const ch of str) {
      terminal.simulateInput(Buffer.from(ch, 'utf8'));
    }
  }

  function dispatch(msg: M): void {
    expectRender();
    appHandle.dispatch(msg);
  }

  async function waitForUpdate(): Promise<void> {
    await Promise.resolve();
    const target = expectedRenderFrame;
    expectedRenderFrame = null;

    if (target !== null && renderFrame < target) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallback);
          renderWaiters.delete(waiter);
          resolve();
        };
        const waiter = { target, resolve: finish };
        const fallback = setTimeout(finish, 50);
        renderWaiters.add(waiter);
      });
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await Promise.resolve();
    throwPendingRenderError();
  }

  /**
   * Report a caught runtime error as a normal test failure.
   *
   * Rethrowing from the runtime's own callback would re-enter its catch and
   * recurse; rethrowing on a microtask kills the vitest worker and reports
   * "Worker exited unexpectedly" instead of the real error. Surfacing it here,
   * at a sync point the test already awaits, keeps the failure attributed to
   * the test that caused it and preserves the original message and stack.
   */
  function throwPendingRenderError(): void {
    const error = pendingRenderErrors.shift();
    if (error === undefined) return;
    pendingRenderErrors.length = 0;
    if (error instanceof Error) {
      error.message = `App threw during update/view and the runtime caught it: ${error.message}\n(Pass renderErrors: 'collect' to TestAppOptions if this is intentional.)`;
      throw error;
    }
    throw new Error(`App threw during update/view and the runtime caught it: ${String(error)}`);
  }

  function recordMessage(msg: M): void {
    if (typeof msg === 'object' && msg !== null && 'type' in (msg as object) && typeof (msg as { type?: unknown }).type === 'string') {
      const type = (msg as unknown as { type: string }).type;
      coverageCounts.set(type, (coverageCounts.get(type) ?? 0) + 1);
      return;
    }
    unknownMessages += 1;
  }

  function messageCoverage(): MessageCoverage {
    return {
      totalDispatched: [...coverageCounts.values()].reduce((sum, count) => sum + count, 0) + unknownMessages,
      unknownMessages,
      byType: Object.fromEntries([...coverageCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    };
  }

  function resetMessageCoverage(): void {
    coverageCounts.clear();
    unknownMessages = 0;
  }

  const handle: TestAppHandle<Model, M> = {
    terminal,
    lastFrame: getLastFrame,
    lastFrameRaw: getLastFrameRaw,
    pressKey,
    type: typeStr,
    dispatch,
    waitForUpdate,
    get model(): Model {
      return currentModel;
    },
    stop(): void {
      restoreFetch();
      appHandle.stop();
    },
    suspend(): void {
      appHandle.suspend();
    },
    resume(): void {
      appHandle.resume();
    },
    announcements(): readonly Announcement[] {
      return [...announcementLog];
    },
    focusEvents(): readonly { description: string; focusedId: string | null }[] {
      return [...focusLog];
    },
    renderErrors(): readonly unknown[] {
      return [...renderErrorLog];
    },
    clearRenderErrors(): void {
      renderErrorLog.length = 0;
    },
    snapshot(): AutomationSnapshot {
      const { cols, rows } = terminal.getSize();
      const vnode = applyFocusToTree(config.view(currentModel), currentFocusedId());
      return buildAutomationSnapshot(vnode, layout(vnode, cols, rows), cols, rows);
    },
    click(col: number, row: number, button: 'left' | 'right' | 'middle' = 'left', modifiers?: KeyModifiers): void {
      expectRender();
      fireMouse(terminal, { type: 'click', row, col, button, modifiers });
    },
    drag(x1: number, y1: number, x2: number, y2: number): void {
      expectRender();
      fireMouse(terminal, { type: 'down', row: y1, col: x1, button: 'left' });
      fireMouse(terminal, { type: 'move', row: y2, col: x2 });
      fireMouse(terminal, { type: 'up', row: y2, col: x2 });
    },
    scrollAt(col: number, row: number, delta: number): void {
      expectRender();
      if (!Number.isSafeInteger(delta)) throw new RangeError('Scroll delta must be a finite safe integer.');
      if (Math.abs(delta) > 10_000) throw new RangeError('Scroll delta exceeds the 10,000-event safety limit.');
      const direction = delta < 0 ? ('up' as const) : ('down' as const);
      const count = Math.abs(delta);
      for (let i = 0; i < count; i++) {
        fireMouse(terminal, { type: 'scroll', row, col, direction });
      }
    },
    messageCoverage,
    resetMessageCoverage,
  };

  // Expose the config for createScreen() to call config.view(model)
  (handle as unknown as Record<string, unknown>).__config = config;

  return handle;
}

function createCommandHandlers(options?: TestAppOptions): AppOptions['commandHandlers'] | undefined {
  const userHandlers = options?.commandHandlers;
  const subprocessMocks = options?.subprocessMocks ?? [];

  if ((!userHandlers || Object.keys(userHandlers).length === 0) && subprocessMocks.length === 0) {
    return undefined;
  }

  const subprocessHandler = userHandlers?.['subprocess'];

  return {
    ...userHandlers,
    async subprocess(payload: unknown) {
      for (const mock of subprocessMocks) {
        if (mock.matches(payload)) {
          return mock.resolve(payload);
        }
      }

      if (subprocessHandler) {
        return subprocessHandler(payload);
      }

      throw new Error(`No subprocess mock matched ${JSON.stringify(payload)}`);
    },
  };
}

export { keyToBuffer } from './keys.js';
