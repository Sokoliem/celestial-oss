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

  /**
   * Walk a sub tree through combinator wrappers, installing dispatch overrides.
   * The `recurse` callback is called with the unwrapped inner sub.
   * Combinator behavior is applied by temporarily swapping `dispatchFn`.
   */
  ctx.walkCombinator = (kind: ReturnType<typeof subKind<M>>, recurse: (inner: Sub<M>) => void): void => {
    const inner = ctx.combinatorInnerSub(kind);
    const prevFn = ctx.dispatchFn;

    switch (kind.kind) {
      case 'filter': {
        const predicate = kind.predicate as (msg: M) => boolean;
        ctx.dispatchFn = (msg: M) => {
          if (predicate(msg)) prevFn(msg);
        };
        break;
      }
      case 'distinct': {
        const eq = (kind.equals as ((a: M, b: M) => boolean) | undefined) ?? ((a: M, b: M) => a === b);
        const id = ctx.combinatorIdCounter++;
        ctx.dispatchFn = (msg: M) => {
          const last = ctx.combinatorDistinctLast.get(id);
          if (!last || !eq(last.value as M, msg)) {
            ctx.combinatorDistinctLast.set(id, { value: msg });
            prevFn(msg);
          }
        };
        break;
      }
      case 'debounce': {
        const id = ctx.combinatorIdCounter++;
        ctx.dispatchFn = (msg: M) => {
          const existing = ctx.combinatorDebounceTimers.get(id);
          if (existing) clearTimeout(existing);
          ctx.combinatorDebounceTimers.set(
            id,
            setTimeout(() => {
              ctx.combinatorDebounceTimers.delete(id);
              prevFn(msg);
            }, kind.ms),
          );
        };
        break;
      }
      case 'throttle': {
        const id = ctx.combinatorIdCounter++;
        ctx.dispatchFn = (msg: M) => {
          const last = ctx.combinatorThrottleTimestamps.get(id) ?? 0;
          const now = Date.now();
          if (now - last >= kind.ms) {
            ctx.combinatorThrottleTimestamps.set(id, now);
            prevFn(msg);
          }
        };
        break;
      }
    }

    recurse(inner);
    ctx.dispatchFn = prevFn;
  };

  ctx.clearDebouncedCmdTimers = (): void => {
    for (const entry of ctx.debouncedCmdTimers.values()) {
      clearTimeout(entry.timer);
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
          ctx.dispatch(latest.msg);
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
