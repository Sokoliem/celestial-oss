/**
 * Tests that dispatch() works correctly when the VNode tree contains
 * focus() wrappers. This was a known bug where the sentinel subscription
 * was consumed by internal reconcileSubscriptions() calls before
 * matchKeySub could find it.
 */

import { type AppConfig, box, Cmd, column, focus, Sub, text } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestAppHandle } from '../test-app.js';

// ── App with focus() in the view tree ────────────────────────────────────

type Msg = { type: 'increment' } | { type: 'decrement' } | { type: 'setName'; name: string };

interface Model {
  count: number;
  name: string;
}

const focusApp: AppConfig<Model, Msg> = {
  init: () => [{ count: 0, name: 'default' }, Cmd.none()],

  update: (msg, model) => {
    switch (msg.type) {
      case 'increment':
        return [{ ...model, count: model.count + 1 }, Cmd.none()];
      case 'decrement':
        return [{ ...model, count: model.count - 1 }, Cmd.none()];
      case 'setName':
        return [{ ...model, name: msg.name }, Cmd.none()];
      default:
        return [model, Cmd.none()];
    }
  },

  // View tree with focus() wrappers — this is what caused dispatch to break
  view: (model) => column(focus('panel-a', box(text(`Count: ${model.count}`))), focus('panel-b', box(text(`Name: ${model.name}`)))),

  subscriptions: () => Sub.batch(Sub.key('up', { type: 'increment' } as Msg), Sub.key('down', { type: 'decrement' } as Msg)),
};

// ── Tests ────────────────────────────────────────────────────────────────

describe('dispatch with focus() trees', () => {
  let handle: TestAppHandle<Model, Msg> | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  it('dispatch() delivers messages when view has focus() wrappers', () => {
    handle = createTestApp(focusApp, { cols: 40, rows: 10 });
    expect(handle.model.count).toBe(0);

    handle.dispatch({ type: 'increment' });
    expect(handle.model.count).toBe(1);
  });

  it('dispatch() works multiple times consecutively', () => {
    handle = createTestApp(focusApp, { cols: 40, rows: 10 });

    handle.dispatch({ type: 'increment' });
    handle.dispatch({ type: 'increment' });
    handle.dispatch({ type: 'increment' });
    expect(handle.model.count).toBe(3);
  });

  it('dispatch() works with messages that have payloads', () => {
    handle = createTestApp(focusApp, { cols: 40, rows: 10 });

    handle.dispatch({ type: 'setName', name: 'updated' });
    expect(handle.model.name).toBe('updated');
  });

  it('dispatch() and pressKey() can be interleaved', () => {
    handle = createTestApp(focusApp, { cols: 40, rows: 10 });

    handle.pressKey('up');
    expect(handle.model.count).toBe(1);

    handle.dispatch({ type: 'increment' });
    expect(handle.model.count).toBe(2);

    handle.pressKey('down');
    expect(handle.model.count).toBe(1);

    handle.dispatch({ type: 'setName', name: 'mixed' });
    expect(handle.model.name).toBe('mixed');
  });

  it('dispatch() updates the rendered output', () => {
    handle = createTestApp(focusApp, { cols: 40, rows: 10 });

    handle.dispatch({ type: 'increment' });
    expect(handle.lastFrame()).toContain('Count: 1');

    handle.dispatch({ type: 'setName', name: 'hello' });
    expect(handle.lastFrame()).toContain('Name: hello');
  });

  it('view with multiple focus() nodes renders correctly after dispatch', () => {
    handle = createTestApp(focusApp, { cols: 40, rows: 10 });

    handle.dispatch({ type: 'increment' });
    handle.dispatch({ type: 'increment' });
    const frame = handle.lastFrame();
    expect(frame).toContain('Count: 2');
    expect(frame).toContain('Name: default');
  });
});
