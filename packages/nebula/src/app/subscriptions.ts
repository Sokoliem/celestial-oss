import type { ConnectionManager } from '../agent-runtime.js';
import type { AgentEvent } from '../agent-types.js';
import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE } from '../clipboard.js';
import { MOUSE_DISABLE, MOUSE_ENABLE } from '../mouse.js';
import { type FrameInfo, type Sub, subKind } from '../types.js';
import { WINDOW_FOCUS_DISABLE, WINDOW_FOCUS_ENABLE } from './constants.js';
import type { RuntimeContext } from './runtime-context.js';
import { serializeTimerSubs } from './sub-map.js';
import {
  type AgentSub,
  collectAgentSubs,
  collectIdleSubs,
  collectPhaseSubs,
  collectStreamSubs,
  hasMouseSub,
  hasPasteSub,
  hasResizeSub,
  hasWindowFocusSub,
} from './subscription-queries.js';
import { collectSubscriptionCombinatorKeys, walkSubscriptionLeaves } from './subscription-walk.js';

function sortedRecord(record: Record<string, string> | undefined): Array<[string, string]> {
  return record ? Object.entries(record).sort(([left], [right]) => left.localeCompare(right)) : [];
}

function agentFingerprint(sub: AgentSub): string {
  const transport = sub.transport;
  const transportValue =
    transport.kind === 'stdio'
      ? ['stdio', transport.command, transport.args ?? [], transport.cwd ?? null, sortedRecord(transport.env)]
      : transport.kind === 'sse'
        ? ['sse', transport.url, sortedRecord(transport.headers)]
        : ['websocket', transport.url, transport.auth ?? null, transport.reconnect ?? null, transport.reconnectInterval ?? null];
  const retry = sub.retryPolicy;
  return JSON.stringify([transportValue, retry ? [retry.maxAttempts, retry.baseDelayMs, retry.maxDelayMs, retry.backoffFactor] : null]);
}

export function installSubscriptions<Model, M>(ctx: RuntimeContext<Model, M>): void {
  const agentConnections = ctx.connectionManager as unknown as ConnectionManager<AgentEvent>;
  ctx.hasPasteSub = (sub) => hasPasteSub(ctx, sub);
  ctx.hasMouseSub = (sub) => hasMouseSub(ctx, sub);
  ctx.hasResizeSub = (sub) => hasResizeSub(ctx, sub);
  ctx.hasWindowFocusSub = (sub) => hasWindowFocusSub(ctx, sub);

  function collectTimerSubs(sub: Sub<M>): Array<{ ms: number; fire: () => void }> {
    const result: Array<{ ms: number; fire: () => void }> = [];
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'timer') {
        result.push({
          ms: kind.ms,
          fire: () => {
            try {
              emit(kind.toMsg());
            } catch (error: unknown) {
              ctx.notifyRenderError(error);
            }
          },
        });
      }
    });
    return result;
  }

  function reconcileAgentSubs(subs: Sub<M>): void {
    const current = new Map(collectAgentSubs(ctx, subs).map((sub) => [sub.id, sub]));
    const currentIds = new Set(current.keys());

    for (const id of [...ctx.activeAgentIds]) {
      if (!currentIds.has(id)) {
        agentConnections.stop(id);
        ctx.activeAgentIds.delete(id);
        ctx.agentFingerprints.delete(id);
      }
    }

    for (const agentSub of current.values()) {
      const fingerprint = agentFingerprint(agentSub);
      if (ctx.activeAgentIds.has(agentSub.id) && ctx.agentFingerprints.get(agentSub.id) !== fingerprint) {
        agentConnections.stop(agentSub.id);
        ctx.activeAgentIds.delete(agentSub.id);
      }
      if (!ctx.activeAgentIds.has(agentSub.id)) {
        try {
          agentConnections.start(agentSub.id, agentSub.transport, (event) => event, agentSub.handle, agentSub.retryPolicy);
          ctx.activeAgentIds.add(agentSub.id);
          ctx.agentFingerprints.set(agentSub.id, fingerprint);
        } catch (error: unknown) {
          ctx.agentFingerprints.delete(agentSub.id);
          ctx.notifyRenderError(error);
        }
      } else {
        agentConnections.update(agentSub.id, (event) => event, agentSub.handle);
      }
    }
  }

  ctx.detachActivePhase = (id: string, removeRegistryEntry: boolean): void => {
    const unsub = ctx.phaseUnsubscribers.get(id);
    if (unsub) {
      try {
        unsub();
      } catch (error: unknown) {
        ctx.notifyRenderError(error);
      }
    }
    ctx.phaseUnsubscribers.delete(id);

    const registry = ctx.phaseRegistries.get(id);
    const activeEntry = ctx.activePhaseEntries.get(id);
    const currentEntry = registry?.get(id);

    if (removeRegistryEntry) {
      if (registry && currentEntry) {
        try {
          registry.unregister(id);
        } catch (error: unknown) {
          ctx.notifyRenderError(error);
        }
      }
      if (activeEntry && activeEntry !== currentEntry && activeEntry.running) {
        try {
          activeEntry.stop();
        } catch (error: unknown) {
          ctx.notifyRenderError(error);
        }
      }
      ctx.phaseRegistries.delete(id);
    } else if (activeEntry?.running) {
      try {
        activeEntry.stop();
      } catch (error: unknown) {
        ctx.notifyRenderError(error);
      }
    }

    ctx.activePhaseEntries.delete(id);
    ctx.phaseMachineRefs.delete(id);
    ctx.phaseHandlers.delete(id);
    ctx.activePhaseIds.delete(id);
  };

  function reconcilePhaseSubs(subs: Sub<M>): void {
    const current = new Map(collectPhaseSubs(ctx, subs).map((sub) => [sub.id, sub]));
    const currentIds = new Set(current.keys());
    const toRemove: string[] = [];
    for (const id of ctx.activePhaseIds) {
      if (!currentIds.has(id)) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      ctx.detachActivePhase(id, true);
    }

    for (const phaseSub of current.values()) {
      ctx.phaseHandlers.set(phaseSub.id, phaseSub.handle);
      const lastRef = ctx.phaseMachineRefs.get(phaseSub.id);
      const activeEntry = ctx.activePhaseEntries.get(phaseSub.id);
      const currentEntry = phaseSub.registry.get(phaseSub.id);
      const registryChanged = ctx.phaseRegistries.get(phaseSub.id) !== phaseSub.registry;
      if (ctx.activePhaseIds.has(phaseSub.id) && (lastRef !== phaseSub.machineRef || registryChanged || activeEntry !== currentEntry)) {
        ctx.detachActivePhase(phaseSub.id, false);
        ctx.phaseHandlers.set(phaseSub.id, phaseSub.handle);
      }
      if (!ctx.activePhaseIds.has(phaseSub.id)) {
        const entry = phaseSub.registry.get(phaseSub.id);
        if (!entry) continue;

        try {
          let prevState: unknown = null;
          const unsub = entry.onTransition((state: unknown) => {
            if (ctx.activePhaseEntries.get(phaseSub.id) !== entry) return;
            const handler = ctx.phaseHandlers.get(phaseSub.id);
            if (!handler) return;
            if (handler(state, prevState)) prevState = state;
          });

          ctx.phaseUnsubscribers.set(phaseSub.id, unsub);
          ctx.phaseRegistries.set(phaseSub.id, phaseSub.registry);
          ctx.activePhaseEntries.set(phaseSub.id, entry);
          ctx.phaseMachineRefs.set(phaseSub.id, phaseSub.machineRef);
          ctx.activePhaseIds.add(phaseSub.id);

          if (!entry.running) entry.start();
        } catch (error: unknown) {
          ctx.detachActivePhase(phaseSub.id, false);
          ctx.notifyRenderError(error);
        }
      }
    }
  }

  function stopStream(id: string): void {
    const source = ctx.activeStreamSources.get(id);
    ctx.activeStreamSources.delete(id);
    ctx.activeStreamIds.delete(id);
    ctx.streamHandlers.delete(id);
    ctx.streamRestartKeys.delete(id);
    if (!source) return;
    try {
      source.teardown();
    } catch (error: unknown) {
      ctx.notifyRenderError(error);
    }
  }

  function reconcileStreamSubs(subs: Sub<M>): void {
    const current = new Map(collectStreamSubs(ctx, subs).map((sub) => [sub.id, sub]));
    const currentIds = new Set(current.keys());

    for (const id of [...ctx.activeStreamIds]) {
      if (!currentIds.has(id)) {
        stopStream(id);
      }
    }

    for (const streamSub of current.values()) {
      ctx.streamHandlers.set(streamSub.id, streamSub.handle);
      if (ctx.activeStreamIds.has(streamSub.id) && !Object.is(ctx.streamRestartKeys.get(streamSub.id), streamSub.restartKey)) {
        stopStream(streamSub.id);
        ctx.streamHandlers.set(streamSub.id, streamSub.handle);
      }
      if (!ctx.activeStreamIds.has(streamSub.id)) {
        try {
          const source = streamSub.setup();
          if (typeof source?.onData !== 'function' || typeof source.teardown !== 'function') {
            throw new TypeError(`Sub.stream("${streamSub.id}") setup must return { onData, teardown }`);
          }
          ctx.activeStreamSources.set(streamSub.id, source);
          ctx.activeStreamIds.add(streamSub.id);
          ctx.streamRestartKeys.set(streamSub.id, streamSub.restartKey);
          source.onData((data: unknown) => {
            if (!ctx.running || ctx.activeStreamSources.get(streamSub.id) !== source) return;
            ctx.streamHandlers.get(streamSub.id)?.(data);
          });
        } catch (error: unknown) {
          stopStream(streamSub.id);
          ctx.notifyRenderError(error);
        }
      }
    }
  }

  ctx.reconcileSubscriptions = (): void => {
    const subs = ctx.safeGetSubs();
    const combinatorKeys = collectSubscriptionCombinatorKeys(subs, 'subscriptions');
    for (const [key, timer] of ctx.combinatorDebounceTimers) {
      if (!combinatorKeys.has(key)) {
        clearTimeout(timer);
        ctx.combinatorDebounceTimers.delete(key);
      }
    }
    for (const key of ctx.combinatorThrottleTimestamps.keys()) {
      if (!combinatorKeys.has(key)) ctx.combinatorThrottleTimestamps.delete(key);
    }
    for (const key of ctx.combinatorDistinctLast.keys()) {
      if (!combinatorKeys.has(key)) ctx.combinatorDistinctLast.delete(key);
    }
    ctx.idleSubs = collectIdleSubs(ctx, subs);
    ctx.latestTimerSubs = collectTimerSubs(subs);
    const timerKey = serializeTimerSubs(subs);

    if (timerKey !== ctx.prevTimerKey) {
      for (const t of ctx.timers) clearInterval(t);
      ctx.timers.length = 0;
      ctx.clearIdleTimers();
      if (ctx.animFrameTimer !== null) {
        clearInterval(ctx.animFrameTimer);
        ctx.animFrameTimer = null;
      }

      ctx.timerInstallIndex = 0;
      ctx.collectSubs(subs);
      if (!ctx.suspended && ctx.terminalSessionActive) {
        ctx.armIdleTimers();
      }
      ctx.prevTimerKey = timerKey;
    }

    reconcileAgentSubs(subs);
    reconcilePhaseSubs(subs);
    reconcileStreamSubs(subs);

    if (ctx.suspended || !ctx.terminalSessionActive) {
      return;
    }

    const needsPaste = ctx.hasPasteSub(subs);
    if (needsPaste && !ctx.pasteActive) {
      ctx.terminal.write(BRACKETED_PASTE_ENABLE);
      ctx.pasteActive = true;
    } else if (!needsPaste && ctx.pasteActive) {
      ctx.terminal.write(BRACKETED_PASTE_DISABLE);
      ctx.pasteActive = false;
    }

    const needsMouse = ctx.hasMouseSub(subs);
    if (needsMouse && !ctx.mouseActive) {
      if (process.env.CELESTIAL_DEBUG_INPUT) {
        process.stderr.write('[mouse-mode] enable source=reconcile\n');
      }
      ctx.terminal.write(MOUSE_ENABLE);
      ctx.mouseActive = true;
    } else if (!needsMouse && ctx.mouseActive) {
      if (process.env.CELESTIAL_DEBUG_INPUT) {
        process.stderr.write('[mouse-mode] disable source=reconcile\n');
      }
      ctx.terminal.write(MOUSE_DISABLE);
      ctx.mouseActive = false;
    }

    const needsWindowFocus = ctx.hasWindowFocusSub(subs);
    if (needsWindowFocus && !ctx.windowFocusActive) {
      ctx.terminal.write(WINDOW_FOCUS_ENABLE);
      ctx.windowFocusActive = true;
    } else if (!needsWindowFocus && ctx.windowFocusActive) {
      ctx.terminal.write(WINDOW_FOCUS_DISABLE);
      ctx.windowFocusActive = false;
    }
  };

  ctx.collectSubs = (sub: Sub<M>): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'none':
      case 'key':
      case 'keyWithModifiers':
      case 'idle':
      case 'resize':
      case 'mouse':
      case 'elementMouse':
      case 'focus':
      case 'windowFocus':
      case 'layout':
      case 'paste':
      case 'agent':
      case 'stream':
        break;
      case 'batch':
        for (const s of kind.subs) ctx.collectSubs(s);
        break;
      case 'timer':
        if (typeof kind.toMsg !== 'function') {
          throw new Error(
            `nebula: Sub.timer() expects a callback (() => Msg), but received ${typeof kind.toMsg}. ` + `Use Sub.timer(ms, () => msg) or Sub.timer(ms, msg).`,
          );
        }
        {
          const index = ctx.timerInstallIndex++;
          ctx.timers.push(
            setInterval(() => {
              if (!ctx.running || ctx.suspended) return;
              const latest = ctx.latestTimerSubs[index];
              latest?.fire();
            }, kind.ms),
          );
        }
        break;
      case 'animationFrame':
        if (ctx.animFrameTimer === null) {
          ctx.animFrameLastTime = Date.now();
          ctx.animFrameTimer = setInterval(() => {
            const now = Date.now();
            const delta = now - ctx.animFrameLastTime;
            ctx.animFrameLastTime = now;
            ctx.dispatchAnimationFrame({ frame: ctx.animFrameCount++, timestamp: now, delta });
          }, 16);
        }
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.collectSubs(ctx.combinatorInnerSub(kind));
        break;
      case 'map':
        ctx.collectSubs(kind.sub as Sub<M>);
        break;
      case 'phase':
        break;
    }
  };

  ctx.dispatchAnimationFrame = (info: FrameInfo): void => {
    if (!ctx.running || ctx.suspended) return;
    const subs = ctx.safeGetSubs();
    walkSubscriptionLeaves(ctx, subs, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'animationFrame') emit(kind.toMsg(info));
    });
  };
}
