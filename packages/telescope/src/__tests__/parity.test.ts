import { type AppConfig, Cmd, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { assertMouseKeyboardParity, type ParityAction } from '../parity.js';
import { createTestApp } from '../test-app.js';

interface Model {
  activated: boolean;
  toggled: boolean;
}

type Msg = { type: 'activate' } | { type: 'toggle' };

function makeBalancedApp(): AppConfig<Model, Msg> {
  return {
    init: () => [{ activated: false, toggled: false }, Cmd.none()],
    update: (msg, model) => {
      switch (msg.type) {
        case 'activate':
          return [{ ...model, activated: true }, Cmd.none()];
        case 'toggle':
          return [{ ...model, toggled: !model.toggled }, Cmd.none()];
      }
    },
    view: () => {
      const node = text('button');
      setVNodeMeta(node, { testId: 'btn', a11y: { role: 'button', label: 'Activate' } });
      return node;
    },
    // Both keyboard bindings are present.
    subscriptions: () => Sub.batch(Sub.key('enter', { type: 'activate' } as Msg), Sub.key('space', { type: 'toggle' } as Msg)),
  };
}

function makeKeyboardOnlyApp(): AppConfig<Model, Msg> {
  return {
    init: () => [{ activated: false, toggled: false }, Cmd.none()],
    update: (msg, model) => {
      if (msg.type === 'activate') return [{ ...model, activated: true }, Cmd.none()];
      return [model, Cmd.none()];
    },
    view: () => text('keyboard-only'),
    subscriptions: () => Sub.batch(Sub.key('enter', { type: 'activate' } as Msg)),
  };
}

describe('assertMouseKeyboardParity', () => {
  it('passes when both mouse and keyboard paths produce the same model mutation', () => {
    const action: ParityAction<Model, Msg> = {
      name: 'activate',
      // Both paths go through dispatch — the test verifies the model lands in the same place.
      byMouse: (app) => app.dispatch({ type: 'activate' }),
      byKey: (app) => app.pressKey('enter'),
      predicate: (model) => model.activated === true,
    };

    expect(() => assertMouseKeyboardParity(() => createTestApp(makeBalancedApp(), { cols: 40, rows: 10 }), [action])).not.toThrow();
  });

  it('reports a mouse path failure when only the keyboard path mutates the model', () => {
    const action: ParityAction<Model, Msg> = {
      name: 'activate',
      // Mouse path is a no-op (we forgot to wire the hit target).
      byMouse: () => {
        /* intentionally does nothing */
      },
      byKey: (app) => app.pressKey('enter'),
      predicate: (model) => model.activated === true,
    };

    expect(() => assertMouseKeyboardParity(() => createTestApp(makeKeyboardOnlyApp(), { cols: 40, rows: 10 }), [action])).toThrow(/mouse path does not/);
  });

  it('reports a keyboard path failure when only the mouse path mutates the model', () => {
    const action: ParityAction<Model, Msg> = {
      name: 'activate',
      byMouse: (app) => app.dispatch({ type: 'activate' }),
      // Keyboard path uses a key that nothing subscribes to.
      byKey: (app) => app.pressKey('q'),
      predicate: (model) => model.activated === true,
    };

    expect(() => assertMouseKeyboardParity(() => createTestApp(makeKeyboardOnlyApp(), { cols: 40, rows: 10 }), [action])).toThrow(/keyboard path does not/);
  });

  it('aggregates failures across multiple actions', () => {
    const actions: ParityAction<Model, Msg>[] = [
      {
        name: 'activate',
        byMouse: (app) => app.dispatch({ type: 'activate' }),
        byKey: (app) => app.pressKey('q'),
        predicate: (model) => model.activated === true,
      },
      {
        name: 'toggle',
        byMouse: () => {
          /* nothing */
        },
        byKey: (app) => app.pressKey('q'),
        predicate: (model) => model.toggled === true,
      },
    ];

    expect(() => assertMouseKeyboardParity(() => createTestApp(makeKeyboardOnlyApp(), { cols: 40, rows: 10 }), actions)).toThrow(/activate.*toggle/s);
  });

  it('passes with an empty actions list', () => {
    expect(() => assertMouseKeyboardParity(() => createTestApp(makeBalancedApp(), { cols: 40, rows: 10 }), [])).not.toThrow();
  });
});
