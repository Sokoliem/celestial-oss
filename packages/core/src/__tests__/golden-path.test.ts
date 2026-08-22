import { describe, expect, it, vi } from 'vitest';
import {
  type AppConfig,
  app,
  Cmd,
  color,
  column,
  createDevTools,
  createStore,
  event,
  style,
  Sub,
  text,
  withPlugins,
} from '../index.js';
import type { TerminalBackend } from '../index.js';

function createMockTerminal(): TerminalBackend & { write: ReturnType<typeof vi.fn> } {
  return {
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: vi.fn(),
    onInput: vi.fn(),
    offInput: vi.fn(),
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
}

type Model = { count: number };
type GoldenMsg = { type: 'inc' } | { type: 'loaded'; value: string } | { type: 'noop' };

function goldenApp(): AppConfig<Model, GoldenMsg> {
  return {
    init: () => [{ count: 0 }, Cmd.none()],
    update: (msg, model) => {
      switch (msg.type) {
        case 'inc':
          return [{ count: model.count + 1 }, Cmd.none()];
        case 'loaded':
          return [{ count: model.count }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view: (model) =>
      column(
        text(`Count: ${model.count}`, style({ color: color.brightCyan, bold: true })),
        event('add', text('[ + ]'), { onClick: 'inc' }),
      ),
    subscriptions: () =>
      Sub.batch<GoldenMsg>(
        Sub.key('+', { type: 'inc' }),
        Sub.elementMouse((e): GoldenMsg => (e.handlerTag === 'inc' ? { type: 'inc' } : { type: 'noop' })),
      ),
  };
}

describe('@celestial/core golden path', () => {
  it('runs a complete app through the facade barrel: init, key, dispatch, painted view', async () => {
    const terminal = createMockTerminal();
    const handle = app(goldenApp(), { terminal });
    const painted = () =>
      terminal.write.mock.calls
        .map((call) => String(call[0]))
        .join('')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');

    await vi.waitFor(() => expect(painted()).toContain('Count: 0'));
    terminal.write.mockClear();
    handle.dispatch({ type: 'inc' });
    // The diff renderer writes only changed cells; after clearing, the new digit appears alone.
    await vi.waitFor(() => expect(painted()).toContain('1'));
    handle.stop();
  });

  it('executes Cmd.async and Cmd.throttle through the facade', async () => {
    const terminal = createMockTerminal();
    const seen: GoldenMsg[] = [];
    const config: AppConfig<Model, GoldenMsg> = {
      ...goldenApp(),
      init: () => [
        { count: 0 },
        Cmd.batch(
          Cmd.async(async () => 'ready', {
            onSuccess: (value): GoldenMsg => ({ type: 'loaded', value }),
            onError: (): GoldenMsg => ({ type: 'noop' }),
          }),
          // Same throttle key twice in one batch: exactly one dispatch survives.
          Cmd.throttle(60_000, Cmd.msg<GoldenMsg>({ type: 'inc' }), 'k'),
          Cmd.throttle(60_000, Cmd.msg<GoldenMsg>({ type: 'inc' }), 'k'),
        ),
      ],
      update: (msg, model) => {
        seen.push(msg);
        return goldenApp().update(msg, model);
      },
    };
    const handle = app(config, { terminal });
    await vi.waitFor(() => expect(seen).toContainEqual({ type: 'loaded', value: 'ready' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.filter((msg) => msg.type === 'inc')).toHaveLength(1);
    handle.stop();
  });

  it('wires the DevTools plugin through the facade barrel', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, GoldenMsg>({ enabled: true, initialMode: 'messages' });
    const handle = app(withPlugins(goldenApp(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    handle.dispatch({ type: 'inc' });
    await vi.waitFor(() => expect(devtools.state.messages.map((m) => m.type)).toContain('inc'));
    expect(handle.getLayoutPlan()).not.toBeNull();
    expect(handle.getHitRegions().map((r) => r.id)).toContain('add');
    handle.stop();
  });

  it('exposes createStore through the facade', () => {
    const store = createStore({ ready: false }, (state, msg: { type: 'go' }) => (msg.type === 'go' ? { ready: true } : state));
    store.dispatch({ type: 'go' });
    expect(store.getState().ready).toBe(true);
  });
});

describe('@celestial/core subpath barrels', () => {
  it('jsx barrel exposes the TSX components and pragma', async () => {
    const jsxModule = await import('../jsx.js');
    for (const name of ['Box', 'Text', 'Row', 'Column', 'Button', 'TextInput', 'Divider', 'Badge', 'Card', 'Scroll', 'Focus', 'ProgressBar', 'Spinner', 'Fragment', 'h', 'jsx', 'jsxs']) {
      expect(jsxModule, `missing ${name}`).toHaveProperty(name);
    }
    const node = jsxModule.Button({ label: 'Add', onClick: 'inc' });
    expect(node.kind).toBe('event');
    if (node.kind === 'event') expect(node.id).toBe('btn:inc');
  });

  it('implementation subpaths re-export their packages', async () => {
    const [atlas, corona, aurora, nebula, gravity, nexus] = await Promise.all([
      import('../atlas.js'),
      import('../corona.js'),
      import('../aurora.js'),
      import('../nebula.js'),
      import('../gravity.js'),
      import('../nexus.js'),
    ]);
    expect(atlas.getCapabilities).toBeTypeOf('function');
    expect(corona.style).toBeTypeOf('function');
    expect(aurora.tween).toBeTypeOf('function');
    expect(nebula.createDevTools).toBeTypeOf('function');
    expect(nebula.withPlugins).toBeTypeOf('function');
    expect(gravity.grid).toBeTypeOf('function');
    expect(nexus.HitMap).toBeTypeOf('function');
  });
});
