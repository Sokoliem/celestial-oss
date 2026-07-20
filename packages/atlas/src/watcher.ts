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
  const snapshot: CapabilityProfile = {};
  let running = false;
  let epoch = 0;
  let detectionRevision = 0;
  const lastAppliedRevision = new Map<string, number>();
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

  async function detectAndDiff(ids?: readonly string[], expectedEpoch?: number): Promise<void> {
    const env = getProcessEnv();
    const idsToCheck = ids ?? registry.ids();
    const revision = ++detectionRevision;

    await Promise.all(
      idsToCheck.map(async (id) => {
        const next = await registry.detect(id, { env });
        if (expectedEpoch !== undefined && (!running || epoch !== expectedEpoch)) return;
        if ((lastAppliedRevision.get(id) ?? 0) > revision) return;
        lastAppliedRevision.set(id, revision);
        const prev = snapshot[id];
        if (!Object.is(prev, next)) {
          snapshot[id] = next;
          emit(id, prev, next);
        }
      }),
    );
  }

  async function bootstrap(expectedEpoch: number): Promise<void> {
    const env = getProcessEnv();
    const revision = ++detectionRevision;
    const detected = await registry.detectAll({ env });
    if (!running || epoch !== expectedEpoch) return;
    for (const [id, next] of Object.entries(detected)) {
      if ((lastAppliedRevision.get(id) ?? 0) > revision) continue;
      lastAppliedRevision.set(id, revision);
      snapshot[id] = next;
    }
  }

  function attachResizeListener(expectedEpoch: number): void {
    const stdout = typeof process !== 'undefined' ? process.stdout : undefined;
    if (!stdout || typeof stdout.on !== 'function') return;

    const handler = (): void => {
      void detectAndDiff(undefined, expectedEpoch).catch(() => {});
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
      const startEpoch = ++epoch;

      // Bootstrap the snapshot asynchronously; once done, start polling.
      void bootstrap(startEpoch).then(
        () => {
          if (!running || epoch !== startEpoch) return;

          if (listenTtyResize) {
            attachResizeListener(startEpoch);
          }

          if (pollMs > 0) {
            pollTimer = setInterval(() => {
              void detectAndDiff(undefined, startEpoch).catch(() => {});
            }, pollMs);
            pollTimer.unref?.();
          }
        },
        () => {},
      );
    },

    stop(): void {
      if (!running) return;
      running = false;
      epoch++;

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
