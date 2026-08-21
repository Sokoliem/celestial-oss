import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { createDevTools } from '../devtools/inspector.js';
import { box, event, text } from '../elements.js';
import { withPlugins } from '../plugin.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';

type Model = { count: number };
type Msg = { type: 'increment' };

type MockTerminal = TerminalBackend & {
  write: ReturnType<typeof vi.fn>;
  onInput: ReturnType<typeof vi.fn>;
};

function createMockTerminal(): MockTerminal {
  return {
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: vi.fn(),
    onInput: vi.fn(),
    offInput: vi.fn(),
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 60, rows: 20 }),
  };
}

function baseConfig(overrides?: Partial<AppConfig<Model, Msg>>): AppConfig<Model, Msg> {
  return {
    init: () => [{ count: 0 }, Cmd.none()],
    update: (message, model) => (message.type === 'increment' ? [{ count: model.count + 1 }, Cmd.none()] : [model, Cmd.none()]),
    view: (model) => event('inc', text(`Count: ${model.count}`), { onClick: 'increment' }),
    subscriptions: () => Sub.none(),
    ...overrides,
  };
}

function inputListener(terminal: MockTerminal): (data: string) => void {
  const call = terminal.onInput.mock.calls[0];
  if (!call) throw new Error('terminal.onInput was never registered');
  return call[0] as (data: string) => void;
}

function painted(terminal: MockTerminal): string {
  return terminal.write.mock.calls
    .map((call) => String(call[0]))
    .join('')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');
}

describe('In-Terminal DevTools', () => {
  it('records every message flowing through the runtime update loop', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>();
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    handle.dispatch({ type: 'increment' });
    handle.dispatch({ type: 'increment' });
    await vi.waitFor(() => expect(devtools.state.messages).toHaveLength(2));
    expect(devtools.state.messages[0]?.type).toBe('increment');
    handle.stop();
  });

  it('cycles modes via the real F12 keybinding through the input pipeline', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: true });
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    expect(devtools.state.mode).toBe('none');
    inputListener(terminal)('\x1b[24~'); // F12
    await vi.waitFor(() => expect(devtools.state.mode).toBe('messages'));
    inputListener(terminal)('\x1b[24~');
    await vi.waitFor(() => expect(devtools.state.mode).toBe('layout'));
    handle.stop();
  });

  it('cycles modes via Ctrl+D (legacy control-byte encoding)', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: true });
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    inputListener(terminal)('\x04'); // Ctrl+D
    await vi.waitFor(() => expect(devtools.state.mode).toBe('messages'));
    handle.stop();
  });

  it('does not leak the internal cycle message into the app update', async () => {
    const terminal = createMockTerminal();
    const seen: Msg[] = [];
    const devtools = createDevTools<Model, Msg>({ enabled: true });
    const config = baseConfig({
      update: (message, model) => {
        seen.push(message);
        return [model, Cmd.none()];
      },
    });
    const handle = app(withPlugins(config, [devtools.plugin]), { terminal });
    devtools.attach(handle);

    inputListener(terminal)('\x1b[24~');
    await vi.waitFor(() => expect(devtools.state.mode).toBe('messages'));
    expect(seen).toEqual([]);
    handle.stop();
  });

  it('paints the HUD overlay as a passive layer when enabled', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: true, initialMode: 'messages' });
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    await vi.waitFor(() => expect(painted(terminal)).toContain('[Celestial DevTools]'));
    handle.stop();
  });

  it('layout mode shows the committed frame from the attached handle', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: true, initialMode: 'layout' });
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    await vi.waitFor(() => expect(handle.getLayoutPlan()).not.toBeNull());
    await vi.waitFor(() => expect(painted(terminal)).toContain('Viewport: 60x20'));
    handle.stop();
  });

  it('hitbox mode lists real hit regions from the committed frame', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: true, initialMode: 'hitboxes' });
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    await vi.waitFor(() => expect(handle.getHitRegions().length).toBeGreaterThan(0));
    expect(handle.getHitRegions().map((r) => r.id)).toContain('inc');
    await vi.waitFor(() => expect(painted(terminal)).toContain('inc'));
    handle.stop();
  });

  it('leaves the view untouched when disabled', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: false });
    const handle = app(withPlugins(baseConfig(), [devtools.plugin]), { terminal });
    devtools.attach(handle);

    await vi.waitFor(() => expect(terminal.write).toHaveBeenCalled());
    expect(painted(terminal)).not.toContain('DevTools');
    handle.stop();
  });

  it('keeps working when the view returns layered content', async () => {
    const terminal = createMockTerminal();
    const devtools = createDevTools<Model, Msg>({ enabled: true, initialMode: 'messages' });
    const config = baseConfig({
      view: (model) => box(text(`Count: ${model.count}`)),
    });
    const handle = app(withPlugins(config, [devtools.plugin]), { terminal });
    devtools.attach(handle);
    handle.dispatch({ type: 'increment' });

    await vi.waitFor(() => expect(devtools.state.messages).toHaveLength(1));
    await vi.waitFor(() => expect(painted(terminal)).toContain('[Celestial DevTools]'));
    handle.stop();
  });
});
