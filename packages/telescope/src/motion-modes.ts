/**
 * Motion-mode test harness — render a component twice (once with motion
 * on, once with `reduceMotion: true`) and run the same test fixture
 * against both. Used to enforce the polish-principle contract: every
 * primitive must look correct *with motion off* — not just *with motion
 * on*.
 *
 * Design — the harness takes a *factory* of `AppConfig`, not a
 * pre-built one. The factory receives `reduceMotion: boolean` and is
 * responsible for wiring the value into its theme overrides (e.g.
 * `theme: { motion: { reduceMotion } }`). This keeps the harness
 * agnostic of how each consumer's primitive accepts theme; constellation
 * primitives use a per-component `theme?: ThemeInput` Config field.
 */

import type { AppConfig } from '@celestial/core/nebula';
import { createTestApp, type TestAppHandle, type TestAppOptions } from './test-app.js';

export interface MotionModeRunner<Model, M> {
  /** Test app with `reduceMotion = false` (default — motion enabled). */
  motionOn: TestAppHandle<Model, M>;
  /** Test app with `reduceMotion = true` (motion suppressed). */
  motionOff: TestAppHandle<Model, M>;
  /** Stop both apps. Idempotent. */
  stop(): void;
}

/**
 * Build two `TestAppHandle`s — one with `reduceMotion = false`, one
 * with `reduceMotion = true` — from a factory that wires the flag
 * through to its `AppConfig`.
 *
 * Typical usage:
 * ```ts
 * const runner = renderInBothMotionModes((reduceMotion) => myApp({
 *   theme: { motion: { reduceMotion } },
 * }));
 *
 * runner.motionOn.pressKey('Escape');
 * runner.motionOff.pressKey('Escape');
 *
 * expect(runner.motionOn.lastFrame()).toBe(runner.motionOff.lastFrame());
 *
 * runner.stop();
 * ```
 */
export function renderInBothMotionModes<Model, M>(
  configFactory: (reduceMotion: boolean) => AppConfig<Model, M>,
  options?: TestAppOptions,
): MotionModeRunner<Model, M> {
  const motionOn = createTestApp(configFactory(false), options);
  const motionOff = createTestApp(configFactory(true), options);
  let stopped = false;

  return {
    motionOn,
    motionOff,
    stop(): void {
      if (stopped) return;
      stopped = true;
      motionOn.stop();
      motionOff.stop();
    },
  };
}

export interface FinalFrameMatchOptions extends TestAppOptions {
  /**
   * How many `waitForUpdate` cycles to settle the motion-on app before
   * comparing frames. Defaults to 8 — typical surface motion (200ms at
   * 16ms/frame ≈ 13 frames) settles within this window for the
   * primitives we ship; bump up for longer-duration animations.
   */
  settleTicks?: number;
}

/**
 * Assert that the *final* rendered frame matches between `reduceMotion
 * = false` (after settling) and `reduceMotion = true` (immediate). This
 * is the "motion is decorative; content survives" contract — a primitive
 * that renders different content with motion off vs motion on is not
 * compliant.
 *
 * Throws when the two final frames differ.
 *
 * Async because settling motion-on requires waiting on `waitForUpdate`.
 */
export async function assertFinalFramesMatchAcrossMotionModes<Model, M>(
  configFactory: (reduceMotion: boolean) => AppConfig<Model, M>,
  options?: FinalFrameMatchOptions,
): Promise<void> {
  const settleTicks = options?.settleTicks ?? 8;
  const runner = renderInBothMotionModes(configFactory, options);
  try {
    for (let i = 0; i < settleTicks; i++) {
      // eslint-disable-next-line no-await-in-loop -- settling is sequential by design
      await runner.motionOn.waitForUpdate();
    }
    const onFrame = runner.motionOn.lastFrame();
    const offFrame = runner.motionOff.lastFrame();
    if (onFrame !== offFrame) {
      throw new Error(
        ['final frames differ between motion modes after settling', '--- motion ON (final) ---', onFrame, '--- motion OFF (immediate) ---', offFrame].join(
          '\n',
        ),
      );
    }
  } finally {
    runner.stop();
  }
}
