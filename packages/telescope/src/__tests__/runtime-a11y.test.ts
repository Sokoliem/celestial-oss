import { Cmd, focus, Sub, text } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { createScreen } from '../screen.js';
import { createTestApp } from '../test-app.js';

describe('test app accessibility capture', () => {
  it('captures runtime announcements', async () => {
    type Msg = { type: 'noop' };

    const handle = createTestApp({
      init: (): [{ done: boolean }, import('@celestial/core/nebula').Cmd<Msg>] => [{ done: false }, Cmd.announce<Msg>('Ready')],
      update: (_msg: Msg, model: { done: boolean }): [{ done: boolean }, import('@celestial/core/nebula').Cmd<Msg>] => [model, Cmd.none<Msg>()],
      view: () => text('ready'),
      subscriptions: () => Sub.none<Msg>(),
    });

    await handle.waitForUpdate();

    expect(handle.announcements().map((item) => item.message)).toContain('Ready');
    handle.stop();
  });

  it('exposes runtime announcements through screen helpers', async () => {
    type Msg = { type: 'noop' };

    const handle = createTestApp({
      init: (): [{ done: boolean }, import('@celestial/core/nebula').Cmd<Msg>] => [{ done: false }, Cmd.announce<Msg>('Ready')],
      update: (_msg: Msg, model: { done: boolean }): [{ done: boolean }, import('@celestial/core/nebula').Cmd<Msg>] => [model, Cmd.none<Msg>()],
      view: () => text('ready'),
      subscriptions: () => Sub.none<Msg>(),
    });

    const screen = createScreen(handle);
    await handle.waitForUpdate();

    expect(screen.announcements().map((item: { message: string }) => item.message)).toContain('Ready');
    handle.stop();
  });

  it('captures focus change events', async () => {
    type Msg = { type: 'focus'; id: string | null };

    const handle = createTestApp({
      init: (): [{}, import('@celestial/core/nebula').Cmd<Msg>] => [{}, Cmd.none<Msg>()],
      update: (_msg: Msg, model: {}): [{}, import('@celestial/core/nebula').Cmd<Msg>] => [model, Cmd.none<Msg>()],
      view: () => ({
        kind: 'column' as const,
        children: [focus('alpha', text('Alpha')), focus('beta', text('Beta'))],
      }),
      subscriptions: () => Sub.focus<Msg>((id) => ({ type: 'focus' as const, id })),
    });

    handle.pressKey('tab');
    await handle.waitForUpdate();

    expect(handle.focusEvents().at(-1)?.focusedId).toBe('alpha');
    handle.stop();
  });

  it('exposes focus change events through screen helpers', async () => {
    type Msg = { type: 'focus'; id: string | null };

    const handle = createTestApp({
      init: (): [{}, import('@celestial/core/nebula').Cmd<Msg>] => [{}, Cmd.none<Msg>()],
      update: (_msg: Msg, model: {}): [{}, import('@celestial/core/nebula').Cmd<Msg>] => [model, Cmd.none<Msg>()],
      view: () => ({
        kind: 'column' as const,
        children: [focus('alpha', text('Alpha')), focus('beta', text('Beta'))],
      }),
      subscriptions: () => Sub.focus<Msg>((id) => ({ type: 'focus' as const, id })),
    });

    const screen = createScreen(handle);
    handle.pressKey('tab');
    await handle.waitForUpdate();

    expect(screen.focusEvents().at(-1)?.focusedId).toBe('alpha');
    handle.stop();
  });
});
