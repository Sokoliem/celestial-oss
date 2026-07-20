import type { StreamSource } from './types.js';
import { Cmd, Sub } from './types.js';

// ─── Bus ────────────────────────────────────────────────────────────────────

/**
 * A typed cross-component message bus.
 *
 * Components that share a `Bus` instance can communicate without
 * direct coupling: one side calls `emit()` (returns a `Cmd`), the
 * other subscribes via `on()` (returns a `Sub`).
 *
 * Type safety is enforced through the `Events` record — every event
 * key maps to a specific payload type.
 */
export interface Bus<Events extends Record<string, unknown>> {
  /** Broadcast an event to all current subscribers. Returns a Cmd that resolves immediately. */
  emit<K extends keyof Events & string>(event: K, data: Events[K]): Cmd<any>;
  /** Subscribe to an event key. Returns a Sub that delivers messages via `toMsg`. */
  on<M, K extends keyof Events & string>(event: K, toMsg: (data: Events[K]) => M): Sub<M>;
}

/**
 * Create an independent typed message bus.
 *
 * Multiple buses are fully isolated — subscribers on one bus
 * never receive events emitted on another.
 */
export function createBus<Events extends Record<string, unknown>>(): Bus<Events> {
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  let subIdCounter = 0;

  return {
    emit<K extends keyof Events & string>(event: K, data: Events[K]): Cmd<any> {
      return Cmd.perform(
        async () => {
          const set = listeners.get(event);
          if (set) {
            for (const cb of set) {
              cb(data);
            }
          }
        },
        () => undefined,
      );
    },

    on<M, K extends keyof Events & string>(event: K, toMsg: (data: Events[K]) => M): Sub<M> {
      const id = `bus:${event}:${++subIdCounter}`;

      return Sub.stream<M>({
        id,
        setup(): StreamSource {
          let callback: ((data: unknown) => void) | null = null;

          const handler = (data: unknown) => {
            if (callback) {
              callback(data);
            }
          };

          // Register listener
          let set = listeners.get(event);
          if (!set) {
            set = new Set();
            listeners.set(event, set);
          }
          set.add(handler);

          return {
            onData(cb: (data: unknown) => void) {
              callback = cb;
            },
            teardown() {
              callback = null;
              const s = listeners.get(event);
              if (s) {
                s.delete(handler);
                if (s.size === 0) {
                  listeners.delete(event);
                }
              }
            },
          };
        },
        toMsg: toMsg as (data: unknown) => M,
      });
    },
  };
}
