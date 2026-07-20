import type { AppHandle } from '../app.js';
import type { Plugin } from '../plugin.js';

export interface HotPluginOptions {
  /** Absolute or relative path to the hot-swappable entry file */
  entry: string;
  /** Compatible module loader function supplied by the host tooling. */
  loader: (opts: { entryPoint: string; bustRequireCache?: string[] }) => Promise<{ exports: unknown; elapsed: number }>;
  /** Compatible application-export resolver supplied by the host tooling. */
  resolveExport: (exports: Record<string, unknown>, name?: string) => any;
  /** Export name to extract (default: tries default/app/dashboardApp) */
  exportName?: string;
  /** Additional file paths/dirs to watch (default: [entry]) */
  watch?: string[];
  /** Source directories of workspace packages to watch for cross-package hot-reload. */
  watchPackageDirs?: string[];
  /** External packages to clear from require.cache on each reload. */
  bustRequireCache?: string[];
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Migration strategy (default: 'auto-merge') */
  migrate?: 'auto-merge' | 'reset' | ((oldModel: unknown, freshModel: unknown) => unknown);
  /** Called on successful reload */
  onReload?: (info: { count: number; elapsed: number }) => void;
  /** Called on reload error */
  onError?: (error: Error) => void;
  /** Called when the plugin rolls back to the last-known-good config. */
  onRollback?: (info: {
    kept: { ts: number; reloadCount: number };
    consecutiveFailures: number;
    reason: 'consecutive-failures' | 'external-request';
    detail?: string;
  }) => void;
  /** Consecutive reload failures before falling back to last-known-good config. */
  rollbackAfter?: number;
  /** Optional file-level filter invoked before a reload is scheduled. */
  shouldReload?: (info: { watchPath: string; event: string; filename: string | null; changedPath: string | null }) => boolean;
  /** Called when a file watcher encounters an error or the watched directory disappears. */
  onWatchError?: (info: { path: string; error: Error; recoverable: boolean; attempt: number }) => void;
  /** Maximum number of self-heal attempts per watcher before giving up. */
  maxWatchRecoveries?: number;
  /** @internal Injectable watch function for testing */
  _watchFn?: (path: string, opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => { close(): void };
}

export interface HotPlugin<Model, M> extends Plugin<Model, M> {
  /** Connect to the app handle to enable hot-swap. Call after app(). */
  attach(handle: AppHandle): void;
  /** Disconnect file watchers and stop hot-swap. */
  detach(): void;
  /** Current reload count (cumulative across attach/detach cycles) */
  readonly reloadCount: number;
  /** Roll back to the last-known-good config immediately. */
  rollbackToLastGood(reason?: string): boolean;
}
