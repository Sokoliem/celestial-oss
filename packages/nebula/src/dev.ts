/**
 * Nebula Dev Utilities
 *
 * Development-time utilities for hot reload and state-preserving restarts
 * of celesTUI applications.
 *
 * Since true hot-module replacement is complex in Node.js, this module takes
 * a simpler but effective approach:
 * - Watches specified files/directories using fs.watch (no external deps)
 * - On change, saves current model to a temp file, then exits with code 75
 * - An external wrapper script (or tsx --watch) handles restarting
 * - On restart, hydrates the model from the saved temp file
 *
 * Limitations:
 * - Model state must be JSON-serializable (no functions, circular refs, etc.)
 * - State is only preserved for 30 seconds to avoid stale data
 * - Exit code 75 is used as a signal for "restart requested"
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AppConfig } from './app.js';
import type { Plugin } from './plugin.js';
import type { Cmd } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DevOptions {
  /** Watch these file patterns for changes (glob patterns or directory paths) */
  watch?: string[];
  /** Debounce delay in ms before reload (default: 300) */
  debounceMs?: number;
  /** Callback when a file changes (for custom reload logic) */
  onFileChange?: (path: string) => void;
  /** Show reload notification in the TUI (reserved for future use) */
  showNotification?: boolean;
  /**
   * @internal Injectable watch function for testing. Defaults to fs.watch.
   * Signature matches fs.watch(path, options, callback).
   */
  _watchFn?: (path: string, options: { recursive: boolean }, callback: (eventType: string, filename: string | null) => void) => { close(): void };
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Exit code that signals "restart requested" to the dev runner wrapper. */
const DEV_RESTART_EXIT_CODE = 75;

/** Maximum age in ms for saved state to be considered valid. */
const STATE_STALENESS_MS = 30_000;

/** Prefix for temporary state files. */
const STATE_FILE_PREFIX = 'celestui-dev-state-';

// ─── State Persistence ──────────────────────────────────────────────────────

/**
 * Get the path for the state file for this working directory.
 * Uses a hash of process.cwd() so each project gets its own state file,
 * and a restart (new PID) can still find it.
 */
function getStateFilePath(): string {
  const cwd = process.cwd();
  // Simple hash to create a filesystem-safe identifier from cwd
  let hash = 0;
  for (let i = 0; i < cwd.length; i++) {
    hash = ((hash << 5) - hash + cwd.charCodeAt(i)) | 0;
  }
  const id = Math.abs(hash).toString(36);
  return path.join(os.tmpdir(), `${STATE_FILE_PREFIX}${id}.json`);
}

/**
 * Find the most recent celestui dev state file in the temp directory.
 * Returns the path if found, or null if no state file exists.
 */
function findStateFile(): string | null {
  const tmpDir = os.tmpdir();
  try {
    const files = fs.readdirSync(tmpDir);
    let newest: { path: string; mtime: number } | null = null;

    for (const file of files) {
      if (file.startsWith(STATE_FILE_PREFIX) && file.endsWith('.json')) {
        const filePath = path.join(tmpDir, file);
        try {
          const stat = fs.statSync(filePath);
          const mtime = stat.mtimeMs;
          if (newest === null || mtime > newest.mtime) {
            newest = { path: filePath, mtime };
          }
        } catch {
          // File may have been deleted between readdir and stat
        }
      }
    }

    return newest?.path ?? null;
  } catch {
    return null;
  }
}

/**
 * Save model state to a temp file for state-preserving reloads.
 * Returns the path where state was saved.
 *
 * The model must be JSON-serializable. Functions, circular references,
 * and other non-serializable values will be lost or cause an error.
 */
export function saveState<Model>(model: Model): string {
  const filePath = getStateFilePath();
  fs.writeFileSync(filePath, JSON.stringify(model), 'utf-8');
  return filePath;
}

/**
 * Load previously saved model state, if available.
 * Returns null if no saved state exists or it's stale (>30s old).
 *
 * The state file is always deleted after reading (whether valid or stale)
 * to prevent leftover files from accumulating.
 */
export function loadState<Model>(): Model | null {
  const filePath = findStateFile();
  if (filePath === null) {
    return null;
  }

  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;

    // Read the file contents before deleting
    const contents = fs.readFileSync(filePath, 'utf-8');

    // Always clean up the file
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore deletion errors
    }

    // Check staleness after reading
    if (ageMs > STATE_STALENESS_MS) {
      return null;
    }

    return JSON.parse(contents) as Model;
  } catch {
    // If anything goes wrong, clean up and return null
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore
    }
    return null;
  }
}

/**
 * Create an init function that hydrates from saved state when available.
 * Falls back to the original init if no saved state exists or it's stale.
 *
 * The original init's Cmd is always preserved — only the Model is replaced
 * when saved state is found.
 */
export function withStateRecovery<Model, M>(init: () => [Model, Cmd<M>]): () => [Model, Cmd<M>] {
  return (): [Model, Cmd<M>] => {
    const [originalModel, cmd] = init();
    const savedModel = loadState<Model>();

    if (savedModel !== null) {
      return [savedModel, cmd];
    }

    return [originalModel, cmd];
  };
}

// ─── Dev Plugin ─────────────────────────────────────────────────────────────

/**
 * Create a dev plugin that watches for file changes and triggers a reload.
 *
 * When `watch` patterns are specified, the plugin:
 * 1. On init, starts file watchers on the specified paths
 * 2. On file change (debounced), calls onFileChange if provided
 * 3. If no onFileChange is provided, the default behavior is to
 *    save the current model and exit with code 75
 *
 * When `watch` is not specified or empty, the plugin is a no-op —
 * safe to include in production builds.
 *
 * ```ts
 * import { devPlugin, withPlugins, withStateRecovery } from '@celestial/nebula';
 *
 * const config = withPlugins(myApp, [
 *   devPlugin({ watch: ['./src'] }),
 * ]);
 * ```
 */
export function devPlugin<Model, M>(options?: DevOptions): Plugin<Model, M> {
  const watchPaths = options?.watch ?? [];
  const debounceMs = options?.debounceMs ?? 300;
  const onFileChange = options?.onFileChange;
  const watchFn =
    options?._watchFn ??
    ((watchPath: string, opts: { recursive: boolean }, cb: (eventType: string, filename: string | null) => void) => fs.watch(watchPath, opts, cb));

  // If no watch paths, return a no-op plugin (safe for production)
  if (watchPaths.length === 0) {
    return { name: 'dev' };
  }

  return {
    name: 'dev',
    wrap(config: AppConfig<Model, M>): AppConfig<Model, M> {
      const watchers: { close(): void }[] = [];
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let currentModel: Model | undefined;

      function handleFileChange(filename: string | null): void {
        const changedPath = filename ?? 'unknown';

        if (debounceMs <= 0) {
          // No debounce — fire immediately
          if (onFileChange) {
            onFileChange(changedPath);
          } else {
            triggerReload();
          }
          return;
        }

        // Debounce: reset the timer on each change
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (onFileChange) {
            onFileChange(changedPath);
          } else {
            triggerReload();
          }
        }, debounceMs);
      }

      function triggerReload(): void {
        // Save current model state before exiting
        if (currentModel !== undefined) {
          saveState(currentModel);
        }

        // Clean up watchers
        for (const watcher of watchers) {
          watcher.close();
        }
        watchers.length = 0;

        // Exit with the special restart code
        process.exit(DEV_RESTART_EXIT_CODE);
      }

      return {
        ...config,

        init(): [Model, ReturnType<AppConfig<Model, M>['init']>[1]] {
          const [model, cmd] = config.init();
          currentModel = model;

          // Start file watchers
          for (const wp of watchPaths) {
            try {
              const watcher = watchFn(wp, { recursive: true }, (_eventType: string, filename: string | null) => {
                handleFileChange(filename);
              });
              watchers.push(watcher);
            } catch {
              // Silently ignore watch errors (e.g., path doesn't exist)
              // In dev mode we don't want to crash just because a watch path
              // is temporarily missing.
            }
          }

          // Clean up watchers on process exit (Ctrl+C, SIGTERM, etc.)
          const cleanup = () => {
            for (const watcher of watchers) watcher.close();
            watchers.length = 0;
          };
          process.on('exit', cleanup);

          return [model, cmd];
        },

        update(msg: M, model: Model): [Model, ReturnType<AppConfig<Model, M>['update']>[1]] {
          const [newModel, cmd] = config.update(msg, model);
          currentModel = newModel;
          return [newModel, cmd];
        },
      };
    },
  };
}
