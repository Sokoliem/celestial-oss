import type { SubKind } from '../types/sub.js';
import { type Sub, subKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';

export type SubscriptionLeafVisitor = (kind: SubKind<unknown>, emit: (message: unknown) => void, path: string) => void;

export function collectSubscriptionCombinatorKeys<M>(sub: Sub<M>, namespace: string): Set<string> {
  const keys = new Set<string>();

  function walk(current: Sub<unknown>, path: string): void {
    const kind = subKind(current);
    switch (kind.kind) {
      case 'batch':
        kind.subs.forEach((child, index) => walk(child, `${path}.batch${index}`));
        break;
      case 'map':
        walk(kind.sub, `${path}.map`);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        keys.add(`${namespace}:${path}.${kind.kind}`);
        walk(kind.sub, `${path}.${kind.kind}`);
        break;
      default:
        break;
    }
  }

  walk(sub as unknown as Sub<unknown>, 'root');
  return keys;
}

/**
 * Walk a subscription tree without flattening maps or value-sensitive
 * combinators. This preserves their declaration order for every event source,
 * including timers, streams, agents, and animation frames.
 */
export function walkSubscriptionLeaves<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>, namespace: string, visit: SubscriptionLeafVisitor): void {
  function walk(current: Sub<unknown>, emit: (message: unknown) => void, path: string): void {
    const kind = subKind(current);
    switch (kind.kind) {
      case 'batch':
        kind.subs.forEach((child, index) => walk(child, emit, `${path}.batch${index}`));
        return;
      case 'map':
        walk(kind.sub, (message) => emit(kind.fn(message)), `${path}.map`);
        return;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct': {
        const wrapped = ctx.wrapSubDispatch(kind as ReturnType<typeof subKind<M>>, `${namespace}:${path}.${kind.kind}`, emit as (message: M) => void);
        walk(kind.sub, wrapped as (message: unknown) => void, `${path}.${kind.kind}`);
        return;
      }
      default:
        try {
          visit(kind, emit, path);
        } catch (error: unknown) {
          ctx.notifyRenderError(error);
        }
    }
  }

  walk(sub as unknown as Sub<unknown>, (message) => ctx.dispatch(message as M), 'root');
}
