/**
 * CapabilityWatcher — subscribe to mid-session capability changes.
 *
 * Sources of change:
 *  - TTY resize (`process.stdout.on('resize')`)
 *  - Env-var polling (configurable interval)
 *  - Manual `watcher.invalidate(id)` for targeted re-detection
 *
 * Also exports a `Sub.capability`-shaped convenience handler for nebula apps
 * (plain function that takes a callback, to avoid a circular nebula import).
 */

import type { CapabilityProfile, CapabilityRegistry } from './registry.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CapabilityChange {
  /** The detector id that changed. */
  readonly id: string;
  /** The previous value (or `undefined` on the first snapshot). */
  readonly prev: unknown;
  /** The newly detected value. */
  readonly next: unknown;
}

export type CapabilityChangeHandler = (change: CapabilityChange) => void;

export interface CapabilityWatcherOptions {
  /**
   * How often (ms) to poll env-var changes. Set to 0 to disable polling.
   * @default 1000
   */
  readonly pollMs?: number;
  /**
   * Whether to re-detect when the terminal is resized.
   * @default true
   */
  readonly listenTtyResize?: boolean;
}

export interface CapabilityWatcher {
  /** Subscribe to capability changes. Returns an unsubscribe function. */
  subscribe(handler: CapabilityChangeHandler): () => void;

  /** Start the watcher (polling + resize listener). Idempotent. */
  start(): void;

  /** Stop the watcher and cancel all listeners. Does NOT remove subscribers. */
  stop(): void;

  /**
   * Force an immediate re-detection of a single capability by id.
   * Fires `subscribe` handlers only if the value changed.
   */
  invalidate(id: string): Promise<void>;

  /**
   * Force an immediate re-detection of ALL capabilities.
   * Fires `subscribe` handlers for each changed value.
   */
  invalidateAll(): Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

function getProcessEnv(): NodeJS.ProcessEnv {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

/**
 * Create a `CapabilityWatcher` that watches `registry` for changes.
 *
 * @example
 * ```ts
 * const watcher = createCapabilityWatcher(registry, { pollMs: 2000 });
 * const unsub = watcher.subscribe((change) => console.log(change));
 * watcher.start();
 * // ... later
 * watcher.stop();
 * ```
 */
export function createCapabilityWatcher(registry: CapabilityRegistry, options: CapabilityWatcherOptions = {}): CapabilityWatcher {
  const pollMs = options.pollMs ?? 1000;
  const listenTtyResize = options.listenTtyResize ?? true;

  const handlers = new Set<CapabilityChangeHandler>();
  let snapshot: CapabilityProfile = {};
  let running = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let resizeCleanup: (() => void) | null = null;

  function emit(id: string, prev: unknown, next: unknown): void {
    const change: CapabilityChange = { id, prev, next };
    for (const h of handlers) {
      try {
        h(change);
      } catch {
        // Never let a subscriber crash the watcher.
      }
    }
  }

  async function detectAndDiff(ids?: readonly string[]): Promise<void> {
    const env = getProcessEnv();
    const idsToCheck = ids ?? registry.ids();

    await Promise.all(
      idsToCheck.map(async (id) => {
        const next = await registry.detect(id, { env });
        const prev = snapshot[id];
        if (!Object.is(prev, next)) {
          snapshot[id] = next;
          emit(id, prev, next);
        }
      }),
    );
  }

  async function bootstrap(): Promise<void> {
    const env = getProcessEnv();
    snapshot = await registry.detectAll({ env });
  }

  function attachResizeListener(): void {
    const stdout = typeof process !== 'undefined' ? process.stdout : undefined;
    if (!stdout || typeof stdout.on !== 'function') return;

    const handler = (): void => {
      void detectAndDiff();
    };
    stdout.on('resize', handler);
    resizeCleanup = () => {
      stdout.removeListener?.('resize', handler);
    };
  }

  function detachResizeListener(): void {
    resizeCleanup?.();
    resizeCleanup = null;
  }

  const watcher: CapabilityWatcher = {
    subscribe(handler: CapabilityChangeHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    start(): void {
      if (running) return;
      running = true;

      // Bootstrap the snapshot asynchronously; once done, start polling.
      void bootstrap().then(() => {
        if (!running) return; // stop() was called before bootstrap finished

        if (listenTtyResize) {
          attachResizeListener();
        }

        if (pollMs > 0) {
          pollTimer = setInterval(() => {
            void detectAndDiff();
          }, pollMs);
        }
      });
    },

    stop(): void {
      if (!running) return;
      running = false;

      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      detachResizeListener();
    },

    async invalidate(id: string): Promise<void> {
      await detectAndDiff([id]);
    },

    async invalidateAll(): Promise<void> {
      await detectAndDiff();
    },
  };

  return watcher;
}

// ─── Sub.capability convenience shape ────────────────────────────────────────

/**
 * A `Sub.capability`-shaped handler for use in nebula apps.
 *
 * Rather than importing nebula's `Sub` directly (which would create a circular
 * dependency), this returns the handler callback shape so nebula can bind it:
 *
 * ```ts
 * // In a nebula app:
 * import { capabilitySubHandler } from '@celestial/atlas';
 *
 * Sub.batch([
 *   // pseudo-code: nebula binds this into its subscription lifecycle
 *   capabilitySubHandler(watcher, (change) => ({ type: 'CapabilityChanged', change })),
 * ]);
 * ```
 *
 * The returned handler can be called directly for testing.
 */
export function capabilitySubHandler(
  watcher: CapabilityWatcher,
  toMsg: (change: CapabilityChange) => unknown,
): (dispatch: (msg: unknown) => void) => () => void {
  return (dispatch: (msg: unknown) => void) => {
    return watcher.subscribe((change) => {
      dispatch(toMsg(change));
    });
  };
}
