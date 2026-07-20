/**
 * Pre-configured terminal presets for common testing scenarios.
 */

import type { AppConfig } from '@celestial/core/nebula';
import { createScreen, type Screen } from './screen.js';
import { createTestApp, type TestAppHandle, type TestAppOptions } from './test-app.js';
import type { TerminalPreset } from './types.js';

/** Standard terminal sizes for testing */
export const terminals: Record<string, TerminalPreset> = {
  /** Standard terminal: 80 columns x 24 rows */
  standard: { cols: 80, rows: 24 },
  /** Compact terminal: 40 columns x 10 rows */
  compact: { cols: 40, rows: 10 },
  /** Wide terminal: 200 columns x 50 rows */
  wide: { cols: 200, rows: 50 },
  /** Tall terminal: 80 columns x 60 rows */
  tall: { cols: 80, rows: 60 },
};

export interface TelescopeFixture<Model, M> {
  readonly model: Model;
  dispatch(msg: M): void;
  handle: TestAppHandle<Model, M>;
  screen: Screen;
  queries: Screen;
  stop(): void;
}

export function createFixture<Model, M>(descriptor: AppConfig<Model, M>, options?: TestAppOptions): TelescopeFixture<Model, M> {
  const handle = createTestApp(descriptor, options);
  const screen = createScreen(handle);

  return {
    get model() {
      return handle.model;
    },
    dispatch(msg: M) {
      handle.dispatch(msg);
    },
    handle,
    screen,
    queries: screen,
    stop() {
      handle.stop();
    },
  };
}
