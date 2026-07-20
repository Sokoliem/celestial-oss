import { type AppConfig, Cmd, focus, Sub, text } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { createScreen } from '../screen.js';
import { createTestApp, type TestAppHandle } from '../test-app.js';

// ── Test app with delayed state changes ─────────────────────────────────

type AsyncMsg = { type: 'show' } | { type: 'hide' };

interface AsyncModel {
  visible: boolean;
}

const asyncApp: AppConfig<AsyncModel, AsyncMsg> = {
  init: () => [{ visible: false }, Cmd.none()],
  update: (msg, model) => {
    switch (msg.type) {
      case 'show':
        return [{ visible: true }, Cmd.none()];
      case 'hide':
        return [{ visible: false }, Cmd.none()];
      default:
        return [model, Cmd.none()];
    }
  },
  view: (model) => text(model.visible ? 'Content Loaded' : 'Loading...'),
  subscriptions: () => Sub.key('s', { type: 'show' } as AsyncMsg),
};

describe('async utilities', () => {
  let handle: TestAppHandle<AsyncModel, AsyncMsg> | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  // ── waitFor ────────────────────────────────────────────────────────

  describe('waitFor', () => {
    it('resolves when assertion passes', async () => {
      handle = createTestApp(asyncApp, { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      // Initially shows loading
      expect(screen.queryByText('Loading...')).not.toBeNull();

      // Dispatch show message
      handle.dispatch({ type: 'show' });

      await screen.waitFor(() => {
        expect(screen.getByText('Content Loaded')).toBeDefined();
      });
    });

    it('rejects on timeout', async () => {
      handle = createTestApp(asyncApp, { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      await expect(
        screen.waitFor(
          () => {
            screen.getByText('Never appears');
          },
          { timeout: 100 },
        ),
      ).rejects.toThrow(/timed out/i);
    });
  });

  // ── waitForText ────────────────────────────────────────────────────

  describe('waitForText', () => {
    it('resolves when text appears', async () => {
      handle = createTestApp(asyncApp, { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      handle.dispatch({ type: 'show' });

      const result = await screen.waitForText('Content Loaded');
      expect(result.text).toContain('Content Loaded');
    });

    it('rejects when text does not appear', async () => {
      handle = createTestApp(asyncApp, { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      await expect(screen.waitForText('Never', { timeout: 100 })).rejects.toThrow(/timed out/i);
    });
  });

  // ── waitForElementToBeRemoved ──────────────────────────────────────

  describe('waitForElementToBeRemoved', () => {
    it('resolves when element disappears', async () => {
      handle = createTestApp(asyncApp, { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      // Initially "Loading..." is visible
      expect(screen.queryByText('Loading...')).not.toBeNull();

      // Dispatch show to change the view
      handle.dispatch({ type: 'show' });

      await screen.waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

      // After removal, Loading... should be gone
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    it('rejects on timeout', async () => {
      handle = createTestApp(asyncApp, { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      // Loading... never disappears since we never dispatch 'show'
      await expect(screen.waitForElementToBeRemoved(() => screen.queryByText('Loading...'), { timeout: 100 })).rejects.toThrow(/timed out/i);
    });
  });

  describe('runtime accessibility waits', () => {
    it('waits for an announcement to appear', async () => {
      type Msg = { type: 'announce' };

      const runtimeHandle = createTestApp<{ ready: boolean }, Msg>(
        {
          init: () => [{ ready: false }, Cmd.none()],
          update: (msg, model) => {
            if (msg.type === 'announce') {
              return [{ ready: true }, Cmd.announce<Msg>('Ready')];
            }
            return [model, Cmd.none()];
          },
          view: (model) => text(model.ready ? 'Ready' : 'Waiting'),
          subscriptions: () => Sub.none(),
        },
        { cols: 40, rows: 10 },
      );

      const screen = createScreen(runtimeHandle);
      runtimeHandle.dispatch({ type: 'announce' });

      const item = await screen.waitForAnnouncement('Ready');
      expect(item.message).toBe('Ready');
      runtimeHandle.stop();
    });

    it('waits for a focus change to appear', async () => {
      type Msg = { type: 'focus'; id: string | null };

      const runtimeHandle = createTestApp<{}, Msg>(
        {
          init: () => [{}, Cmd.none()],
          update: (_msg, model) => [model, Cmd.none()],
          view: () => ({
            kind: 'column' as const,
            children: [focus('alpha', text('Alpha')), focus('beta', text('Beta'))],
          }),
          subscriptions: () => Sub.focus<Msg>((id) => ({ type: 'focus', id })),
        },
        { cols: 40, rows: 10 },
      );

      const screen = createScreen(runtimeHandle);
      runtimeHandle.pressKey('tab');

      const event = await screen.waitForFocusChange('alpha');
      expect(event.focusedId).toBe('alpha');
      runtimeHandle.stop();
    });
  });
});
