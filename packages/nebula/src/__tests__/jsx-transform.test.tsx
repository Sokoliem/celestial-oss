/** @jsxRuntime automatic */
/** @jsxImportSource @celestial/nebula */
import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd } from '../types/cmd.js';
import { Sub } from '../types.js';

function createMockTerminal(): TerminalBackend {
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

// A function component written in real TSX, compiled by the automatic
// transform against @celestial/nebula/jsx-runtime.
function Greeting({ name }: { name: string }) {
  return (
    <box border="rounded" padding={1}>
      <text bold>Hello, {name}!</text>
      <row gap={2}>
        <button label="[+] Add" onClick="increment" />
        <button label="[-] Subtract" onClick="decrement" />
      </row>
    </box>
  );
}

describe('JSX automatic transform (real compilation)', () => {
  it('compiles intrinsic elements to the same VNode tree as the elements API', () => {
    const tree = <Greeting name="Celestial" />;
    expect(tree.kind).toBe('box');

    const buttons: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const v = node as { kind?: string; id?: string; children?: unknown[]; child?: unknown };
      if (v.kind === 'event' && typeof v.id === 'string') buttons.push(v.id);
      if (Array.isArray(v.children)) v.children.forEach(walk);
      if (v.child) walk(v.child);
    };
    walk(tree);
    expect(buttons).toContain('btn:increment');
    expect(buttons).toContain('btn:decrement');
  });

  it('rejects unknown intrinsics at type-check time (compile-time contract)', () => {
    // IntrinsicElements has no catch-all index signature, so this file would
    // fail `tsc --noEmit` if an unknown tag were used. Runtime double-check:
    expect(() => {
      // @ts-expect-error — not a known intrinsic
      const _el = <buttton label="typo" />;
      return _el;
    }).toThrow(/Unknown JSX intrinsic element/);
  });

  it('renders a TSX view through the real app runtime', async () => {
    type Model = { count: number };
    type Msg = { type: 'increment' };

    const write = vi.fn();
    const terminal = { ...createMockTerminal(), write };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ count: 0 }, Cmd.none()],
      update: (_message, model) => [{ count: model.count + 1 }, Cmd.none()],
      view: (model) => (
        <box flexDirection="column">
          <text>Count: {model.count}</text>
        </box>
      ),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, { terminal });
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    // The painter writes cursor-addressed cells; strip ANSI to read the text.
    const painted = write.mock.calls
      .map((call) => String(call[0]))
      .join('')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');
    // Blank cells are not painted, so spaces collapse: "Count: 0" → "Count:0".
    expect(painted).toContain('Count:0');
    handle.stop();
  });
});
