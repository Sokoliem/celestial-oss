import { getAttachedPlugins, type Plugin } from '../plugin.js';
import { disposeVNodeStateScope } from '../vdom/state.js';
import type { AppConfig, ReplaceConfigOptions } from './contracts.js';
import type { RuntimeContext } from './runtime-context.js';

export function installLifecycle<Model, M>(ctx: RuntimeContext<Model, M>): void {
  const reportLifecycleError = (scope: string, error: unknown): void => {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[nebula] ${scope} failed: ${String(error)}\n`);
    }
  };

  ctx.suspend = (): void => {
    if (!ctx.running || ctx.suspended) return;
    ctx.suspended = true;
    ctx.cancelScheduledRender();
    ctx.prevGrid = null;
    ctx.resetCompositorState();
    try {
      ctx.detachRuntimeHandlers();
    } catch (error: unknown) {
      reportLifecycleError('Runtime handler detach during suspend', error);
    }
    try {
      ctx.exitTerminalSession(false);
    } catch (error: unknown) {
      reportLifecycleError('Terminal cleanup during suspend', error);
    }
  };

  ctx.resume = (): void => {
    if (!ctx.running || !ctx.suspended) return;
    try {
      ctx.enterTerminalSession(false);
      ctx.attachRuntimeHandlers();
    } catch (error: unknown) {
      try {
        ctx.detachRuntimeHandlers();
      } catch (cleanupError: unknown) {
        reportLifecycleError('Runtime handler rollback during resume', cleanupError);
      }
      try {
        ctx.exitTerminalSession(false);
      } catch (cleanupError: unknown) {
        reportLifecycleError('Terminal rollback during resume', cleanupError);
      }
      reportLifecycleError('Resume', error);
      return;
    }
    ctx.suspended = false;
    ctx.cancelScheduledRender();
    ctx.prevGrid = null;
    ctx.resetCompositorState();
    ctx.reconcileSubscriptions();
    if (ctx.idleSubs.length > 0) {
      ctx.armIdleTimers();
    }
    ctx.render();
  };

  ctx.replaceConfig = (newConfig: AppConfig<any, any>, opts?: ReplaceConfigOptions): void => {
    if (!ctx.running) return;

    if (ctx.isRendering) {
      queueMicrotask(() => ctx.replaceConfig(newConfig, opts));
      return;
    }

    const validate = opts?.validate === true;
    const prevConfigVersion = ctx.configVersion;
    const nextConfigVersion = ctx.configVersion + 1;
    let nextModel: Model = ctx.model;
    if (validate) {
      if (opts?.migrate) {
        nextModel = opts.migrate(ctx.model) as Model;
      }
      newConfig.view(nextModel);
      newConfig.subscriptions(nextModel);
    } else if (opts?.migrate) {
      nextModel = opts.migrate(ctx.model) as Model;
    }

    const prevConfig = ctx.config;
    const prevModel = ctx.model;
    const prevPlugins = getAttachedPlugins(prevConfig);
    const nextPlugins = getAttachedPlugins(newConfig);
    const swapInfo = { prev: prevConfig, next: newConfig, prevVersion: prevConfigVersion, nextVersion: nextConfigVersion };
    const seenPlugins = new Set<Plugin<any, any>>();
    for (const p of prevPlugins) {
      if (p.onConfigSwap && !seenPlugins.has(p)) {
        seenPlugins.add(p);
        try {
          p.onConfigSwap(swapInfo);
        } catch (err) {
          ctx.notifyRenderError(err);
        }
      }
    }
    for (const p of nextPlugins) {
      if (p.onConfigSwap && !seenPlugins.has(p)) {
        seenPlugins.add(p);
        try {
          p.onConfigSwap(swapInfo);
        } catch (err) {
          ctx.notifyRenderError(err);
        }
      }
    }

    ctx.config = newConfig;
    ctx.model = nextModel;
    ctx.configVersion = nextConfigVersion;

    for (const t of ctx.combinatorDebounceTimers.values()) clearTimeout(t);
    ctx.combinatorDebounceTimers.clear();
    ctx.combinatorThrottleTimestamps.clear();
    ctx.combinatorDistinctLast.clear();
    ctx.clearDebouncedCmdTimers();
    ctx.throttledCmdTimestamps.clear();
    ctx.clearIdleTimers();
    ctx.idleSubs = [];
    ctx.prevTimerKey = '';

    ctx.cancelScheduledRender();
    ctx.prevGrid = null;
    ctx.resetCompositorState();
    try {
      ctx.reconcileSubscriptions();
      ctx.render();
    } catch (err: unknown) {
      if (validate) {
        try {
          ctx.config = prevConfig;
          ctx.model = prevModel;
          ctx.configVersion = prevConfigVersion;
          ctx.cancelScheduledRender();
          ctx.prevGrid = null;
          ctx.resetCompositorState();
          ctx.reconcileSubscriptions();
          ctx.render();
        } catch {
          // Previous config also broken — nothing more we can do here.
        }
        ctx.notifyRenderError(err);
        throw err instanceof Error ? err : new Error(String(err));
      }
      ctx.notifyRenderError(err);
    }
  };

  ctx.shutdown = (): void => {
    if (!ctx.running && !ctx.terminalSessionActive) return;
    ctx.running = false;
    ctx.suspended = false;
    const reportCleanupError = (scope: string, error: unknown): void => {
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`[nebula] ${scope} cleanup failed: ${error}\n`);
      }
    };

    try {
      ctx.appAbortController.abort();
    } catch (error: unknown) {
      reportCleanupError('Abort', error);
    }

    while (ctx.pendingClipboardRequests.length > 0) {
      ctx.pendingClipboardRequests.shift()?.({ ok: false, error: new Error('Clipboard request interrupted by shutdown') });
    }

    ctx.cancelScheduledRender();
    ctx.clearDebouncedCmdTimers();
    for (const timer of ctx.combinatorDebounceTimers.values()) clearTimeout(timer);
    ctx.combinatorDebounceTimers.clear();
    ctx.combinatorThrottleTimestamps.clear();
    ctx.combinatorDistinctLast.clear();
    ctx.throttledCmdTimestamps.clear();
    ctx.clearIdleTimers();
    ctx.idleSubs = [];

    try {
      ctx.connectionManager.stopAll();
    } catch (error: unknown) {
      reportCleanupError('Agent', error);
    }
    ctx.activeAgentIds.clear();
    ctx.agentFingerprints.clear();
    try {
      ctx.lensBridge?.close();
    } catch (error: unknown) {
      reportCleanupError('Lens bridge', error);
    }

    for (const id of [...ctx.activePhaseIds]) {
      try {
        ctx.detachActivePhase(id, true);
      } catch (error: unknown) {
        reportCleanupError(`Phase "${id}"`, error);
      }
    }
    ctx.phaseUnsubscribers.clear();
    ctx.phaseRegistries.clear();
    ctx.activePhaseEntries.clear();
    ctx.phaseMachineRefs.clear();
    ctx.phaseHandlers.clear();
    ctx.activePhaseIds.clear();

    for (const [, source] of ctx.activeStreamSources) {
      try {
        source.teardown();
      } catch (error: unknown) {
        if (typeof process !== 'undefined' && process.stderr) {
          process.stderr.write(`[nebula] Stream teardown failed during shutdown: ${error}\n`);
        }
      }
    }
    ctx.activeStreamSources.clear();
    ctx.activeStreamIds.clear();
    ctx.streamHandlers.clear();
    ctx.streamRestartKeys.clear();

    for (const t of ctx.timers) clearInterval(t);
    ctx.timers.length = 0;
    ctx.latestTimerSubs = [];

    if (ctx.animFrameTimer !== null) {
      clearInterval(ctx.animFrameTimer);
      ctx.animFrameTimer = null;
    }

    try {
      ctx.renderWatchdog?.dispose();
    } catch (error: unknown) {
      reportCleanupError('Render watchdog', error);
    }
    disposeVNodeStateScope(ctx.vnodeStateScope);
    try {
      ctx.detachRuntimeHandlers();
    } catch (error: unknown) {
      reportCleanupError('Runtime handler', error);
    }
    try {
      ctx.exitTerminalSession(true);
    } catch (error: unknown) {
      reportCleanupError('Terminal session', error);
    }
    try {
      ctx.uninstallSuspendResumeHandlers();
    } catch (error: unknown) {
      reportCleanupError('Signal handler', error);
    }

    if (ctx.crashGuard) {
      try {
        ctx.crashGuard.uninstall();
      } catch (error: unknown) {
        reportCleanupError('Crash guard', error);
      }
      ctx.crashGuard = null;
    }
  };
}
