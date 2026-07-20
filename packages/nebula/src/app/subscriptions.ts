import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE } from '../clipboard.js';
import { MOUSE_DISABLE, MOUSE_ENABLE } from '../mouse.js';
import { type FrameInfo, type Sub, subKind } from '../types.js';
import { WINDOW_FOCUS_DISABLE, WINDOW_FOCUS_ENABLE } from './constants.js';
import type { RuntimeContext } from './runtime-context.js';
import { applySubMap, serializeTimerSubs } from './sub-map.js';
import {
  collectAgentSubs,
  collectIdleSubs,
  collectPhaseSubs,
  collectStreamSubs,
  hasMouseSub,
  hasPasteSub,
  hasResizeSub,
  hasWindowFocusSub,
} from './subscription-queries.js';

export function installSubscriptions<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.hasPasteSub = (sub) => hasPasteSub(ctx, sub);
  ctx.hasMouseSub = (sub) => hasMouseSub(ctx, sub);
  ctx.hasResizeSub = (sub) => hasResizeSub(ctx, sub);
  ctx.hasWindowFocusSub = (sub) => hasWindowFocusSub(ctx, sub);

  function reconcileAgentSubs(subs: Sub<M>): void {
    const current = collectAgentSubs(ctx, subs);
    const currentIds = new Set(current.map((s) => s.id));

    for (const id of ctx.activeAgentIds) {
      if (!currentIds.has(id)) {
        ctx.connectionManager.stop(id);
        ctx.activeAgentIds.delete(id);
      }
    }

    for (const agentSub of current) {
      if (!ctx.activeAgentIds.has(agentSub.id)) {
        ctx.connectionManager.start(agentSub.id, agentSub.transport, agentSub.toMsg, ctx.dispatch, agentSub.retryPolicy);
        ctx.activeAgentIds.add(agentSub.id);
      }
    }
  }

  ctx.detachActivePhase = (id: string, removeRegistryEntry: boolean): void => {
    const unsub = ctx.phaseUnsubscribers.get(id);
    if (unsub) unsub();
    ctx.phaseUnsubscribers.delete(id);

    const registry = ctx.phaseRegistries.get(id);
    const activeEntry = ctx.activePhaseEntries.get(id);
    const currentEntry = registry?.get(id);

    if (removeRegistryEntry) {
      if (registry && currentEntry) {
        registry.unregister(id);
      }
      if (activeEntry && activeEntry !== currentEntry && activeEntry.running) {
        activeEntry.stop();
      }
      ctx.phaseRegistries.delete(id);
    } else if (activeEntry?.running) {
      activeEntry.stop();
    }

    ctx.activePhaseEntries.delete(id);
    ctx.phaseMachineRefs.delete(id);
    ctx.activePhaseIds.delete(id);
  };

  function reconcilePhaseSubs(subs: Sub<M>): void {
    const current = collectPhaseSubs(ctx, subs);
    const currentIds = new Set(current.map((s) => s.id));
    const toRemove: string[] = [];
    for (const id of ctx.activePhaseIds) {
      if (!currentIds.has(id)) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      ctx.detachActivePhase(id, true);
    }

    for (const phaseSub of current) {
      const lastRef = ctx.phaseMachineRefs.get(phaseSub.id);
      if (ctx.activePhaseIds.has(phaseSub.id) && lastRef !== phaseSub.machineRef) {
        ctx.detachActivePhase(phaseSub.id, false);
      }
      if (!ctx.activePhaseIds.has(phaseSub.id)) {
        const entry = phaseSub.registry.get(phaseSub.id);
        if (!entry) continue;

        let prevState: unknown = null;
        const unsub = entry.onTransition((state: unknown) => {
          if (phaseSub.filter && !phaseSub.filter(state)) return;
          const msg = phaseSub.toMsg(state, prevState);
          prevState = state;
          ctx.dispatch(msg);
        });

        if (!entry.running) {
          entry.start();
        }

        ctx.phaseUnsubscribers.set(phaseSub.id, unsub);
        ctx.phaseRegistries.set(phaseSub.id, phaseSub.registry);
        ctx.activePhaseEntries.set(phaseSub.id, entry);
        ctx.phaseMachineRefs.set(phaseSub.id, phaseSub.machineRef);
        ctx.activePhaseIds.add(phaseSub.id);
      }
    }
  }

  function reconcileStreamSubs(subs: Sub<M>): void {
    const current = collectStreamSubs(ctx, subs);
    const currentIds = new Set(current.map((s) => s.id));

    for (const id of ctx.activeStreamIds) {
      if (!currentIds.has(id)) {
        const source = ctx.activeStreamSources.get(id);
        if (source) source.teardown();
        ctx.activeStreamSources.delete(id);
        ctx.activeStreamIds.delete(id);
      }
    }

    for (const streamSub of current) {
      if (!ctx.activeStreamIds.has(streamSub.id)) {
        const source = streamSub.setup();
        source.onData((data: unknown) => {
          ctx.dispatch(streamSub.toMsg(data));
        });
        ctx.activeStreamSources.set(streamSub.id, source);
        ctx.activeStreamIds.add(streamSub.id);
      }
    }
  }

  ctx.reconcileSubscriptions = (): void => {
    const subs = ctx.safeGetSubs();
    ctx.idleSubs = collectIdleSubs(ctx, subs);
    const timerKey = serializeTimerSubs(subs);

    if (timerKey !== ctx.prevTimerKey) {
      for (const t of ctx.timers) clearInterval(t);
      ctx.timers.length = 0;
      ctx.clearIdleTimers();
      if (ctx.animFrameTimer !== null) {
        clearInterval(ctx.animFrameTimer);
        ctx.animFrameTimer = null;
      }

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
        ctx.timers.push(setInterval(() => ctx.dispatch(kind.toMsg()), kind.ms));
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
        ctx.collectSubs(applySubMap(kind.sub, kind.fn));
        break;
      case 'phase':
        break;
    }
  };

  ctx.dispatchAnimationFrame = (info: FrameInfo): void => {
    if (!ctx.running) return;
    const subs = ctx.safeGetSubs();
    const msgs = collectAnimFrameMsgs(subs, info);
    for (const msg of msgs) {
      if (!ctx.running) return;
      ctx.dispatch(msg);
    }
  };

  function collectAnimFrameMsgs(sub: Sub<M>, info: FrameInfo): M[] {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'animationFrame':
        return [kind.toMsg(info)];
      case 'batch':
        return kind.subs.flatMap((s) => collectAnimFrameMsgs(s, info));
      case 'map':
        return collectAnimFrameMsgs(applySubMap(kind.sub, kind.fn) as Sub<M>, info);
      case 'filter': {
        const predicate = kind.predicate as (msg: M) => boolean;
        return collectAnimFrameMsgs(ctx.combinatorInnerSub(kind), info).filter(predicate);
      }
      case 'distinct': {
        const eq = (kind.equals as ((a: M, b: M) => boolean) | undefined) ?? ((a: M, b: M) => a === b);
        const msgs = collectAnimFrameMsgs(ctx.combinatorInnerSub(kind), info);
        return msgs.filter((msg, i) => i === 0 || !eq(msgs[i - 1]!, msg));
      }
      case 'debounce':
      case 'throttle':
        return collectAnimFrameMsgs(ctx.combinatorInnerSub(kind), info);
      default:
        return [];
    }
  }
}
