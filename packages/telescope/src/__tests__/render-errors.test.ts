import { Cmd, Sub, text, type VNode } from '@celestial/core';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test-app.js';

type Model = { readonly explode: boolean };
type Msg = { readonly type: 'explode' };

/**
 * An app that throws from view() once a message flips the flag. Nebula catches
 * view/update throws and keeps running, so without the harness forwarding
 * onRenderError there is no way for a test to observe that this happened.
 */
function explodingApp(where: 'view' | 'update') {
  return {
    init: (): [Model, ReturnType<typeof Cmd.none>] => [{ explode: false }, Cmd.none()],
    update(msg: Msg, model: Model): [Model, ReturnType<typeof Cmd.none>] {
      if (msg.type === 'explode') {
        if (where === 'update') throw new Error('boom-from-update');
        return [{ explode: true }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: Model): VNode {
      if (model.explode && where === 'view') throw new Error('boom-from-view');
      return text('stable');
    },
    subscriptions: (): ReturnType<typeof Sub.none> => Sub.none(),
  };
}

describe('createTestApp render error observability', () => {
  it('collects a view() throw instead of swallowing it', async () => {
    const handle = createTestApp(explodingApp('view'), { cols: 20, rows: 5, renderErrors: 'collect' });
    try {
      handle.dispatch({ type: 'explode' });
      await handle.waitForUpdate();

      const errors = handle.renderErrors();
      expect(errors).toHaveLength(1);
      expect(String((errors[0] as Error).message)).toContain('boom-from-view');
    } finally {
      handle.stop();
    }
  });

  it('collects an update() throw instead of swallowing it', async () => {
    const handle = createTestApp(explodingApp('update'), { cols: 20, rows: 5, renderErrors: 'collect' });
    try {
      handle.dispatch({ type: 'explode' });
      await handle.waitForUpdate();

      expect(handle.renderErrors()).toHaveLength(1);
      expect(String((handle.renderErrors()[0] as Error).message)).toContain('boom-from-update');
    } finally {
      handle.stop();
    }
  });

  it('reports no errors for a healthy app and supports clearing', async () => {
    const handle = createTestApp(explodingApp('view'), { cols: 20, rows: 5, renderErrors: 'collect' });
    try {
      await handle.waitForUpdate();
      expect(handle.renderErrors()).toEqual([]);

      handle.dispatch({ type: 'explode' });
      await handle.waitForUpdate();
      expect(handle.renderErrors().length).toBeGreaterThan(0);

      handle.clearRenderErrors();
      expect(handle.renderErrors()).toEqual([]);
    } finally {
      handle.stop();
    }
  });

  it('forwards errors to a caller-supplied onRenderError', async () => {
    const seen: unknown[] = [];
    const handle = createTestApp(explodingApp('view'), {
      cols: 20,
      rows: 5,
      renderErrors: 'collect',
      onRenderError: (error) => seen.push(error),
    });
    try {
      handle.dispatch({ type: 'explode' });
      await handle.waitForUpdate();

      expect(seen).toHaveLength(1);
      // The caller's handler runs in addition to collection, not instead of it.
      expect(handle.renderErrors()).toHaveLength(1);
    } finally {
      handle.stop();
    }
  });
});
