import { getAttachedPlugins, type Plugin } from '../plugin.js';
import type { AppConfig, ReplaceConfigOptions } from './contracts.js';
import type { RuntimeContext } from './runtime-context.js';

export function installLifecycle<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.suspend = (): void => {
    if (!ctx.running || ctx.suspended) return;
    ctx.suspended = true;
    ctx.cancelScheduledRender();
    ctx.prevGrid = null;
    ctx.resetCompositorState();
    ctx.detachRuntimeHandlers();
    ctx.exitTerminalSession(false);
  };

  ctx.resume = (): void => {
    if (!ctx.running || !ctx.suspended) return;
    ctx.suspended = false;
    ctx.enterTerminalSession(false);
    ctx.attachRuntimeHandlers();
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
    ctx.clearIdleTimers();
    ctx.idleSubs = [];
    ctx.prevTimerKey = '';
    ctx.combinatorIdCounter = 0;

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
    ctx.appAbortController.abort();
    ctx.running = false;
    ctx.suspended = false;

    while (ctx.pendingClipboardRequests.length > 0) {
      ctx.pendingClipboardRequests.shift()?.({ ok: false, error: new Error('Clipboard request interrupted by shutdown') });
    }

    ctx.cancelScheduledRender();
    ctx.clearDebouncedCmdTimers();
    ctx.clearIdleTimers();
    ctx.idleSubs = [];

    ctx.connectionManager.stopAll();
    ctx.activeAgentIds.clear();
    ctx.lensBridge?.close();

    for (const id of ctx.activePhaseIds) {
      ctx.detachActivePhase(id, true);
    }
    ctx.phaseUnsubscribers.clear();
    ctx.phaseRegistries.clear();
    ctx.activePhaseEntries.clear();
    ctx.phaseMachineRefs.clear();
    ctx.activePhaseIds.clear();

    for (const [, source] of ctx.activeStreamSources) {
      source.teardown();
    }
    ctx.activeStreamSources.clear();
    ctx.activeStreamIds.clear();

    for (const t of ctx.timers) clearInterval(t);
    ctx.timers.length = 0;

    if (ctx.animFrameTimer !== null) {
      clearInterval(ctx.animFrameTimer);
      ctx.animFrameTimer = null;
    }

    ctx.renderWatchdog?.dispose();
    ctx.detachRuntimeHandlers();
    ctx.exitTerminalSession(true);
    ctx.uninstallSuspendResumeHandlers();

    if (ctx.crashGuard) {
      ctx.crashGuard.uninstall();
      ctx.crashGuard = null;
    }
  };
}
