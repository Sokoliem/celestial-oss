/**
 * WHY: corona must not take a runtime dependency on nebula because nebula
 * already depends on corona. This file therefore returns the structural
 * subscription shape that nebula consumes instead of importing Sub.stream().
 */

import { lookup, renderAt, resolve } from './engine.js';
import type { Frame, ResolvedSpinner } from './types.js';

/** Payload delivered by each spinner tick. */
export interface SpinnerFrame {
  /** The rendered frame text. */
  readonly text: Frame;
  /** Elapsed milliseconds since the subscription started. */
  readonly elapsed: number;
}

/** Structural stream source contract consumed by Nebula's Sub.stream runtime. */
export interface SpinnerStreamSource {
  onData(cb: (data: unknown) => void): void;
  teardown(): void;
}

/** Structural stream subscription descriptor compatible with Nebula's `Sub<M>`. */
export interface SpinnerSub<M> {
  readonly _tag: 'sub';
  readonly _phantom?: M;
  readonly _kind: {
    readonly kind: 'stream';
    readonly id: string;
    readonly setup: () => SpinnerStreamSource;
    readonly toMsg: (data: unknown) => M;
  };
}

function createSpinnerSub<M>(config: { id: string; setup: () => SpinnerStreamSource; toMsg: (data: unknown) => M }): SpinnerSub<M> {
  return {
    _tag: 'sub',
    _kind: {
      kind: 'stream',
      ...config,
    },
  };
}

/**
 * Create a Nebula subscription that drives a spinner animation.
 *
 * The subscription uses `Sub.stream` under the hood: it sets up an
 * `setInterval` timer that advances the spinner and emits frames at
 * the spinner's native cadence (or a custom override).
 *
 * @param name - Registered spinner name (e.g. 'dots', 'line')
 * @param toMsg - Map each frame payload to your app's Msg type
 * @param interval - Override the spinner's default interval (ms)
 * @returns A Nebula-compatible stream subscription that emits spinner frames
 * @throws If the spinner name is not found in the registry
 */
export function spinnerSub<M>(name: string, toMsg: (frame: SpinnerFrame) => M, interval?: number): SpinnerSub<M> {
  const def = lookup(name);
  if (!def) {
    throw new Error(`Unknown spinner: "${name}"`);
  }

  const spinner: ResolvedSpinner = resolve(def);
  const ms = interval ?? spinner.interval;

  return createSpinnerSub<M>({
    id: `corona-spinner:${name}`,
    setup: () => {
      let timer: ReturnType<typeof setInterval> | null = null;
      let elapsed = 0;

      return {
        onData: (cb: (data: unknown) => void) => {
          timer = setInterval(() => {
            elapsed += ms;
            const text = renderAt(spinner, elapsed);
            cb({ text, elapsed } satisfies SpinnerFrame);
          }, ms);
        },
        teardown: () => {
          if (timer !== null) {
            clearInterval(timer);
            timer = null;
          }
        },
      };
    },
    toMsg: (data: unknown) => toMsg(data as SpinnerFrame),
  });
}
