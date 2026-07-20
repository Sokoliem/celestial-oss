import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig, AppHandle } from '../app.js';
import type { HotPlugin, HotPluginOptions } from './contracts.js';
import { wrapRawConfig } from './convert.js';
import { buildMigrate } from './migration.js';

type WatchHandle = { close(): void };
type LkgEntry = { wrappedConfig: AppConfig<any, any>; ts: number; reloadCount: number };

export function hotPlugin<Model, M>(options: HotPluginOptions): HotPlugin<Model, M> {
  const entryPoint = path.resolve(options.entry);
  const debounceMs = options.debounceMs ?? 300;
  const migrateStrategy = options.migrate ?? 'auto-merge';
  const rollbackAfter = options.rollbackAfter ?? 2;
  const maxWatchRecoveries = options.maxWatchRecoveries ?? 5;
  const watchFn =
    options._watchFn ??
    ((watchPath: string, opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void) => fs.watch(watchPath, opts, cb));

  const watchers: WatchHandle[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let handle: AppHandle | null = null;
  let reloads = 0;
  let consecutiveFailures = 0;
  let stopped = false;
  let reloadInFlight = false;
  let pendingReload = false;
  let lkg: LkgEntry | null = null;

  function tryRollback(reason: 'consecutive-failures' | 'external-request', detail?: string): boolean {
    const currentHandle = handle;
    if (!currentHandle || !lkg) return false;
    try {
      currentHandle.replaceConfig(lkg.wrappedConfig, { migrate: (m) => m, validate: true });
      options.onRollback?.({ kept: { ts: lkg.ts, reloadCount: lkg.reloadCount }, consecutiveFailures, reason, detail });
      consecutiveFailures = 0;
      return true;
    } catch {
      return false;
    }
  }

  async function performReload(): Promise<void> {
    const currentHandle = handle;
    if (!currentHandle) return;

    try {
      const { exports, elapsed } = await options.loader({
        entryPoint,
        bustRequireCache: options.bustRequireCache,
      });

      if (!handle) return;

      const rawConfig = options.resolveExport(exports as Record<string, unknown>, options.exportName);
      const wrappedConfig = wrapRawConfig(rawConfig);
      const migrate = buildMigrate(migrateStrategy, wrappedConfig);

      currentHandle.replaceConfig(wrappedConfig, { migrate, validate: true });

      reloads++;
      consecutiveFailures = 0;
      lkg = { wrappedConfig, ts: Date.now(), reloadCount: reloads };
      options.onReload?.({ count: reloads, elapsed });
    } catch (err: any) {
      consecutiveFailures++;
      options.onError?.(err instanceof Error ? err : new Error(String(err)));

      if (consecutiveFailures >= rollbackAfter && lkg) {
        tryRollback('consecutive-failures');
      }
    }
  }

  async function reload(): Promise<void> {
    if (reloadInFlight) {
      pendingReload = true;
      return;
    }

    reloadInFlight = true;
    try {
      do {
        pendingReload = false;
        await performReload();
      } while (pendingReload && handle && !stopped);
    } finally {
      reloadInFlight = false;
    }
  }

  function handleFileChange(watchPath: string, event: string, filename: string | null): void {
    const changedPath = filename ? path.resolve(watchPath, filename) : null;
    if (options.shouldReload && !options.shouldReload({ watchPath, event, filename, changedPath })) {
      return;
    }

    if (debounceMs <= 0) {
      reload();
      return;
    }

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      reload();
    }, debounceMs);
  }

  function createSelfHealingWatcher(watchPath: string, opts: { recursive: boolean }, cb: (event: string, filename: string | null) => void): WatchHandle {
    let inner: WatchHandle | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const handleFailure = (err: Error): void => {
      if (closed || stopped) return;
      try {
        inner?.close();
      } catch {
        /* ignore */
      }
      inner = null;
      attempt++;
      const recoverable = maxWatchRecoveries > 0 && attempt <= maxWatchRecoveries;
      try {
        options.onWatchError?.({ path: watchPath, error: err, recoverable, attempt });
      } catch {
        /* never let the user callback break recovery */
      }
      if (!recoverable) return;
      const delay = Math.min(250 * attempt, 5000);
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        arm();
      }, delay);
    };

    const arm = (): void => {
      if (closed || stopped) return;
      try {
        const created = watchFn(watchPath, opts, (event, filename) => {
          attempt = 0;
          cb(event, filename);
        });
        const eventEmitter = created as unknown as { on?: (event: string, listener: (err: Error) => void) => void };
        if (typeof eventEmitter.on === 'function') {
          eventEmitter.on('error', (err) => {
            handleFailure(err);
          });
        }
        inner = created;
      } catch (err) {
        handleFailure(err instanceof Error ? err : new Error(String(err)));
      }
    };

    arm();

    return {
      close(): void {
        closed = true;
        if (recoveryTimer !== null) {
          clearTimeout(recoveryTimer);
          recoveryTimer = null;
        }
        try {
          inner?.close();
        } catch {
          /* ignore */
        }
        inner = null;
      },
    };
  }

  function startWatching(): void {
    stopped = false;

    watchers.push(
      createSelfHealingWatcher(entryPoint, { recursive: false }, (event, filename) => {
        handleFileChange(path.dirname(entryPoint), event, filename);
      }),
    );

    for (const wp of options.watch ?? []) {
      const resolvedWatchPath = path.resolve(wp);
      watchers.push(
        createSelfHealingWatcher(resolvedWatchPath, { recursive: true }, (event, filename) => {
          handleFileChange(resolvedWatchPath, event, filename);
        }),
      );
    }

    for (const dir of options.watchPackageDirs ?? []) {
      const resolvedWatchPath = path.resolve(dir);
      watchers.push(
        createSelfHealingWatcher(resolvedWatchPath, { recursive: true }, (event, filename) => {
          handleFileChange(resolvedWatchPath, event, filename);
        }),
      );
    }
  }

  function stopWatching(): void {
    stopped = true;
    for (const watcher of watchers) {
      watcher.close();
    }
    watchers.length = 0;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  return {
    name: 'hot',
    attach(appHandle: AppHandle): void {
      if (handle !== null) {
        stopWatching();
      }
      handle = appHandle;
      startWatching();
    },
    detach(): void {
      stopWatching();
      handle = null;
    },
    get reloadCount() {
      return reloads;
    },
    rollbackToLastGood(reason?: string): boolean {
      return tryRollback('external-request', reason);
    },
  };
}
