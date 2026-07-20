import { type AppConfig, Cmd, Sub, text, type VNode } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { fireMouse } from '../events.js';
import { keyToBuffer } from '../keys.js';
import { MockTerminal } from '../mock-terminal.js';
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

describe('event encoders', () => {
  it('encodes Unicode, shifted printable keys, and uppercase control chords', () => {
    expect(keyToBuffer('界')).toEqual(Buffer.from('界'));
    expect(keyToBuffer('🙂')).toEqual(Buffer.from('🙂'));
    expect(keyToBuffer('a', { shift: true })).toEqual(Buffer.from('A'));
    expect(keyToBuffer('A', { ctrl: true })).toEqual(Buffer.from([0x01]));
  });

  it('encodes xterm modifiers for navigation and function keys', () => {
    expect(keyToBuffer('up', { ctrl: true, shift: true }).toString()).toBe('\x1b[1;6A');
    expect(keyToBuffer('f1', { alt: true }).toString()).toBe('\x1b[1;3P');
    expect(keyToBuffer('f10', { shift: true }).toString()).toBe('\x1b[21;2~');
  });

  it('returns fresh buffers so callers cannot corrupt later key events', () => {
    const first = keyToBuffer('up');
    first[0] = 0;
    expect(keyToBuffer('up')).toEqual(Buffer.from('\x1b[A'));
  });

  it('rejects invalid mouse coordinates and incomplete scroll events', () => {
    const terminal = new MockTerminal();
    expect(() => fireMouse(terminal, { type: 'click', row: -1, col: 0 })).toThrow(/row must be/i);
    expect(() => fireMouse(terminal, { type: 'click', row: 0, col: Number.NaN })).toThrow(/column must be/i);
    expect(() => fireMouse(terminal, { type: 'scroll', row: 0, col: 0 })).toThrow(/require a direction/i);
  });
});
