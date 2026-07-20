/**
 * Mouse / keyboard parity assertion — the enforcement vehicle for the
 * polish principle "every interactive element ships both a `Sub.key`
 * binding and a `nexus`-registered hit target."
 *
 * For each `ParityAction` the caller declares, this helper builds two
 * fresh test apps: one driven by the mouse path, one driven by the
 * keyboard path. After each path mutates the model, the supplied
 * `predicate(model)` must be true. If only one path produces the
 * mutation, the assertion fails — that's the parity gap.
 *
 * Designed for primitive-level tests (e.g. `surface.test.ts`,
 * `slash-palette.test.ts`) that want to keep the contract honest.
 */

import type { TestAppHandle } from './test-app.js';

export interface ParityAction<Model, M> {
  /** Human-readable label for the action; used in error messages. */
  name: string;
  /** Drive the action via mouse on a fresh app. Should mutate the model. */
  byMouse(app: TestAppHandle<Model, M>): void;
  /** Drive the action via keyboard on a fresh app. Should mutate the model. */
  byKey(app: TestAppHandle<Model, M>): void;
  /**
   * Predicate over the post-action model. Must return true when the
   * action's intended state mutation has occurred. Both the mouse and
   * keyboard paths are expected to satisfy this predicate.
   */
  predicate(model: Model): boolean;
}

/**
 * Run mouse and keyboard paths for each action against a fresh app
 * (built via `buildApp`) and assert both produce the predicate-true
 * post-action model.
 *
 * Throws an aggregated error listing every action whose mouse/keyboard
 * paths diverged.
 *
 * Apps are stopped at the end; if any action throws, all in-flight apps
 * are still cleaned up.
 */
export function assertMouseKeyboardParity<Model, M>(buildApp: () => TestAppHandle<Model, M>, actions: readonly ParityAction<Model, M>[]): void {
  const failures: string[] = [];
  const liveApps: TestAppHandle<Model, M>[] = [];

  try {
    for (const action of actions) {
      const mouseApp = buildApp();
      liveApps.push(mouseApp);
      try {
        action.byMouse(mouseApp);
      } catch (err) {
        failures.push(`[${action.name}] mouse path threw: ${(err as Error).message}`);
        continue;
      }
      const mouseOk = action.predicate(mouseApp.model);

      const keyApp = buildApp();
      liveApps.push(keyApp);
      try {
        action.byKey(keyApp);
      } catch (err) {
        failures.push(`[${action.name}] keyboard path threw: ${(err as Error).message}`);
        continue;
      }
      const keyOk = action.predicate(keyApp.model);

      if (!mouseOk && !keyOk) {
        failures.push(`[${action.name}] neither path satisfied predicate`);
      } else if (!mouseOk) {
        failures.push(`[${action.name}] keyboard path works but mouse path does not — missing nexus hit target`);
      } else if (!keyOk) {
        failures.push(`[${action.name}] mouse path works but keyboard path does not — missing Sub.key binding`);
      }
    }
  } finally {
    for (const app of liveApps) {
      try {
        app.stop();
      } catch {
        // Ignore teardown errors when an action already threw.
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(['mouse/keyboard parity violations:', ...failures].join('\n  '));
  }
}
