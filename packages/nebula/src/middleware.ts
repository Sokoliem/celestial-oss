/**
 * Nebula Middleware
 *
 * Message processing pipeline with standard middleware implementations
 * for undo/redo, persistence, logging, and composition.
 */

// ─── Core types ─────────────────────────────────────────────────────────────

export interface Middleware<Model, M> {
  readonly name: string;
  process(msg: M, model: Model): M | M[] | null;
}

// ─── Standard middlewares ───────────────────────────────────────────────────

export const middlewares = {
  logger<Model, M>(log?: (msg: M) => void): Middleware<Model, M> {
    return {
      name: 'logger',
      process(msg: M, _model: Model): M {
        if (log) {
          log(msg);
        }
        return msg;
      },
    };
  },

  debounce<Model, M>(selector: (msg: M) => boolean, ms: number, redispatch: (msg: M) => void): Middleware<Model, M> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastMsg: M | undefined;

    return {
      name: 'debounce',
      process(msg: M, _model: Model): M | null {
        if (!selector(msg)) {
          return msg;
        }

        // Clear previous timer
        if (timer !== null) {
          clearTimeout(timer);
        }

        // Store the latest message and re-dispatch it after the delay
        lastMsg = msg;
        timer = setTimeout(() => {
          timer = null;
          if (lastMsg !== undefined) {
            const msg = lastMsg;
            lastMsg = undefined;
            redispatch(msg);
          }
        }, ms);

        return null;
      },
    };
  },

  throttle<Model, M>(selector: (msg: M) => boolean, ms: number): Middleware<Model, M> {
    let lastTime = 0;

    return {
      name: 'throttle',
      process(msg: M, _model: Model): M | null {
        if (!selector(msg)) {
          return msg;
        }

        const now = Date.now();
        if (now - lastTime >= ms) {
          lastTime = now;
          return msg;
        }

        return null;
      },
    };
  },
};

// ─── Pipeline ───────────────────────────────────────────────────────────────

/**
 * Creates a pipeline that processes messages through middlewares in order.
 * Each middleware can pass a message through, swallow it (return null),
 * or expand it into multiple messages (return an array).
 * When a message is expanded, each resulting message continues through
 * the remaining middlewares.
 */
export function createMiddlewarePipeline<Model, M>(...mws: Middleware<Model, M>[]): (msg: M, model: Model) => M[] {
  return function pipeline(msg: M, model: Model): M[] {
    return processThrough([msg], 0, mws, model);
  };
}

function processThrough<Model, M>(messages: M[], index: number, mws: Middleware<Model, M>[], model: Model): M[] {
  if (index >= mws.length) {
    return messages;
  }

  const mw = mws[index]!;
  const results: M[] = [];

  for (const msg of messages) {
    const result = mw.process(msg, model);

    if (result === null) {
      // Message swallowed
      continue;
    }

    if (Array.isArray(result)) {
      results.push(...result);
    } else {
      results.push(result);
    }
  }

  return processThrough(results, index + 1, mws, model);
}

// ─── Undo middleware ────────────────────────────────────────────────────────

export interface UndoState<Model> {
  past: Model[];
  present: Model;
  future: Model[];
}

export interface UndoConfig<M> {
  /** Predicate that identifies the "undo" message */
  isUndo: (msg: M) => boolean;
  /** Predicate that identifies the "redo" message */
  isRedo: (msg: M) => boolean;
  /** Maximum history size (default: 50) */
  maxHistory?: number;
  /** Predicate to skip certain messages from history (e.g., cursor moves) */
  skip?: (msg: M) => boolean;
}

/**
 * Create an undo/redo middleware.
 *
 * The middleware tracks model snapshots on every non-skipped message.
 * When an undo or redo message is detected, it returns null to swallow
 * the message, and exposes the restored model via getUndoState().
 *
 * Usage: call getUndoState() after processing to get the undo state,
 * then use state.present as your model.
 */
export function undoMiddleware<Model, M>(
  config: UndoConfig<M>,
): Middleware<Model, M> & { getUndoState: () => UndoState<Model> | null; setPresent: (model: Model) => void } {
  const maxHistory = config.maxHistory ?? 50;
  let undoState: UndoState<Model> | null = null;

  return {
    name: 'undo',

    getUndoState(): UndoState<Model> | null {
      return undoState;
    },

    setPresent(model: Model): void {
      if (undoState === null) {
        undoState = { past: [], present: model, future: [] };
      } else {
        undoState = { ...undoState, present: model };
      }
    },

    process(msg: M, model: Model): M | null {
      // Initialize undo state on first message
      if (undoState === null) {
        undoState = { past: [], present: model, future: [] };
      }

      if (config.isUndo(msg)) {
        if (undoState.past.length === 0) return null;
        const previous = undoState.past[undoState.past.length - 1]!;
        // Use the live model (passed as param) as the current state to push to future
        undoState = {
          past: undoState.past.slice(0, -1),
          present: previous,
          future: [model, ...undoState.future],
        };
        return null;
      }

      if (config.isRedo(msg)) {
        if (undoState.future.length === 0) return null;
        const next = undoState.future[0]!;
        // Use the live model as the current state to push to past
        undoState = {
          past: [...undoState.past, model],
          present: next,
          future: undoState.future.slice(1),
        };
        return null;
      }

      // Skip certain messages from history
      if (config.skip?.(msg)) {
        return msg;
      }

      // Record current state in history before this update
      const newPast = [...undoState.past, model];
      if (newPast.length > maxHistory) {
        newPast.shift();
      }
      undoState = {
        past: newPast,
        present: model,
        future: [], // clear redo stack on new action
      };

      return msg;
    },
  };
}

// ─── Persist middleware ──────────────────────────────────────────────────────

export interface PersistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Create a persistence middleware that saves model snapshots.
 *
 * On each non-null message result, the current model is serialized
 * and stored via the provided storage backend.
 *
 * Call loadState() to retrieve the last persisted model.
 */
export function persistMiddleware<Model, M>(
  key: string,
  storage?: PersistStorage,
): Middleware<Model, M> & { loadState: () => Model | null; saveNow: (model: Model) => void } {
  const store: PersistStorage = storage ?? createMemoryStorage();

  return {
    name: 'persist',

    loadState(): Model | null {
      const data = store.getItem(key);
      if (data === null) return null;
      try {
        return JSON.parse(data) as Model;
      } catch {
        return null;
      }
    },

    saveNow(model: Model): void {
      store.setItem(key, JSON.stringify(model));
    },

    process(msg: M, model: Model): M {
      // Save state after each message
      store.setItem(key, JSON.stringify(model));
      return msg;
    },
  };
}

function createMemoryStorage(): PersistStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

// ─── Log middleware (enhanced) ───────────────────────────────────────────────

export interface LogEntry<M, Model> {
  msg: M;
  model: Model;
  timestamp: number;
}

/**
 * Create an enhanced log middleware that records timestamped entries.
 */
export function logMiddleware<Model, M>(opts?: {
  filter?: (msg: M) => boolean;
  maxEntries?: number;
}): Middleware<Model, M> & { getLog: () => readonly LogEntry<M, Model>[]; clearLog: () => void } {
  const entries: LogEntry<M, Model>[] = [];
  const maxEntries = opts?.maxEntries ?? 1000;
  const filter = opts?.filter;

  return {
    name: 'log',

    getLog(): readonly LogEntry<M, Model>[] {
      return [...entries];
    },

    clearLog(): void {
      entries.length = 0;
    },

    process(msg: M, model: Model): M {
      if (filter && !filter(msg)) return msg;

      entries.push({ msg, model, timestamp: Date.now() });
      if (entries.length > maxEntries) {
        entries.shift();
      }
      return msg;
    },
  };
}

// ─── Middleware composition ──────────────────────────────────────────────────

/**
 * Compose multiple middlewares into a single middleware.
 * Messages flow through each middleware in order.
 */
export function composeMiddleware<Model, M>(...mws: Middleware<Model, M>[]): Middleware<Model, M> {
  return {
    name: `composed(${mws.map((m) => m.name).join(', ')})`,
    process(msg: M, model: Model): M | M[] | null {
      const pipeline = createMiddlewarePipeline(...mws);
      const results = pipeline(msg, model);
      if (results.length === 0) return null;
      if (results.length === 1) return results[0]!;
      return results;
    },
  };
}

// ─── Before/After hooks ─────────────────────────────────────────────────────

/**
 * Create a middleware with before/after hooks on the update cycle.
 *
 * **Important:** Both hooks receive the model state as it exists at the time
 * `process()` is called, which is BEFORE `config.update()` runs. The `after`
 * hook fires asynchronously via `queueMicrotask`, but still captures the
 * pre-update model snapshot.
 *
 * @param name - A descriptive name for this middleware instance.
 * @param hooks.before - Called synchronously before the message passes through.
 *   @param msg - The message being processed.
 *   @param model - The model state BEFORE the update is applied.
 * @param hooks.after - Called asynchronously (via queueMicrotask) after the message passes through.
 *   @param msg - The message being processed.
 *   @param model - The model state BEFORE the update was applied (captured at process-time).
 */
export function hookMiddleware<Model, M>(
  name: string,
  hooks: {
    before?: (msg: M, model: Model) => void;
    after?: (msg: M, model: Model) => void;
  },
): Middleware<Model, M> {
  return {
    name,
    process(msg: M, model: Model): M {
      if (hooks.before) hooks.before(msg, model);
      // The message passes through — the "after" hook fires after processing
      // We store a reference and use a microtask to fire it
      if (hooks.after) {
        const afterFn = hooks.after;
        queueMicrotask(() => afterFn(msg, model));
      }
      return msg;
    },
  };
}
