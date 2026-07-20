import { type AppConfig, Cmd, Sub, text, type VNode } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { createScreen } from '../screen.js';
import { createTestApp, type TestAppHandle } from '../test-app.js';

// ── Test app ────────────────────────────────────────────────────────────

type Msg = { type: 'noop' };

function simpleApp(view: () => VNode): AppConfig<null, Msg> {
  return {
    init: () => [null, Cmd.none()],
    update: (_msg, model) => [model, Cmd.none()],
    view,
    subscriptions: () => Sub.none(),
  };
}

describe('events', () => {
  let handle: TestAppHandle<null, Msg> | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  // ── fireMouse ──────────────────────────────────────────────────────

  describe('fireMouse', () => {
    it('sends mouse click event', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      // Should not throw — event is delivered to terminal
      expect(() => screen.fireMouse({ type: 'click', row: 0, col: 0 })).not.toThrow();
    });

    it('sends mouse scroll event', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.fireMouse({ type: 'scroll', row: 5, col: 10, direction: 'up' })).not.toThrow();
    });

    it('sends mouse move event', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.fireMouse({ type: 'move', row: 3, col: 5 })).not.toThrow();
    });
  });

  // ── fireResize ─────────────────────────────────────────────────────

  describe('fireResize', () => {
    it('changes terminal dimensions', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      screen.fireResize(120, 40);
      expect(handle.terminal.getSize()).toEqual({ cols: 120, rows: 40 });
    });
  });

  // ── firePaste ──────────────────────────────────────────────────────

  describe('firePaste', () => {
    it('sends bracketed paste sequence', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      // Should not throw — sends paste escape sequences to terminal
      expect(() => screen.firePaste('pasted text')).not.toThrow();
    });

    it('handles multi-line paste', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.firePaste('line1\nline2\nline3')).not.toThrow();
    });
  });
});
