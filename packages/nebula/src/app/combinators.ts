import type { Sub, subKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';

export function installCombinators<Model, M>(ctx: RuntimeContext<Model, M>): void {
  /**
   * Extract the inner sub from a combinator SubKind.
   * All combinator kinds (debounce, throttle, filter, distinct) have a `sub` field.
   */
  ctx.combinatorInnerSub = (kind: ReturnType<typeof subKind<M>>): Sub<M> => {
    return (kind as { sub: Sub<unknown> }).sub as Sub<M>;
  };

  ctx.wrapSubDispatch = (kind, key, dispatch) => {
    const deliver = (message: M): void => {
      try {
        dispatch(message);
      } catch (error: unknown) {
        ctx.notifyRenderError(error);
      }
    };
    switch (kind.kind) {
      case 'filter': {
        const predicate = kind.predicate as (msg: M) => boolean;
        return (message: M) => {
          try {
            if (predicate(message)) deliver(message);
          } catch (error: unknown) {
            ctx.notifyRenderError(error);
          }
        };
      }
      case 'distinct': {
        const equals = (kind.equals as ((left: M, right: M) => boolean) | undefined) ?? ((left: M, right: M) => left === right);
        return (message: M) => {
          const last = ctx.combinatorDistinctLast.get(key);
          try {
            if (!last || !equals(last.value as M, message)) {
              ctx.combinatorDistinctLast.set(key, { value: message });
              deliver(message);
            }
          } catch (error: unknown) {
            ctx.notifyRenderError(error);
          }
        };
      }
      case 'debounce':
        return (message: M) => {
          const existing = ctx.combinatorDebounceTimers.get(key);
          if (existing) clearTimeout(existing);
          ctx.combinatorDebounceTimers.set(
            key,
            setTimeout(() => {
              ctx.combinatorDebounceTimers.delete(key);
              if (ctx.running && !ctx.suspended) deliver(message);
            }, kind.ms),
          );
        };
      case 'throttle':
        return (message: M) => {
          const last = ctx.combinatorThrottleTimestamps.get(key) ?? Number.NEGATIVE_INFINITY;
          const now = Date.now();
          if (now - last >= kind.ms) {
            ctx.combinatorThrottleTimestamps.set(key, now);
            deliver(message);
          }
        };
      default:
        return deliver;
    }
  };

  ctx.clearDebouncedCmdTimers = (): void => {
    for (const entry of ctx.debouncedCmdTimers.values()) {
      entry.cancel();
    }
    ctx.debouncedCmdTimers.clear();
  };

  ctx.clearIdleTimers = (): void => {
    for (const timer of ctx.idleTimers.values()) {
      clearTimeout(timer);
    }
    ctx.idleTimers.clear();
  };

  ctx.armIdleTimers = (): void => {
    ctx.clearIdleTimers();
    ctx.idleSubs.forEach((idleSub, index) => {
      const timer = setTimeout(() => {
        ctx.idleTimers.delete(index);
        const latest = ctx.idleSubs[index];
        if (latest && ctx.running && !ctx.suspended) {
          latest.fire();
        }
      }, idleSub.ms);
      ctx.idleTimers.set(index, timer);
    });
  };

  ctx.resetIdleTimers = (): void => {
    if (ctx.idleSubs.length === 0 || ctx.suspended || !ctx.terminalSessionActive) {
      return;
    }
    ctx.armIdleTimers();
  };

  ctx.parseWindowFocusEvent = (input: string): { focused: boolean; start: number; end: number } | null => {
    const focusIn = input.indexOf('\x1b[I');
    const focusOut = input.indexOf('\x1b[O');

    if (focusIn === -1 && focusOut === -1) {
      return null;
    }

    if (focusIn !== -1 && (focusOut === -1 || focusIn < focusOut)) {
      return { focused: true, start: focusIn, end: focusIn + 3 };
    }

    return { focused: false, start: focusOut, end: focusOut + 3 };
  };
}
