import { type AppConfig, box, Cmd, column, component, empty, event, row, Sub, text, type VNode } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { MockTerminal } from '../mock-terminal.js';
import { mockFetch } from '../mocks.js';
import { renderToLines, renderToText } from '../render.js';
import { createTestApp, type TestAppHandle } from '../test-app.js';

// ── Simple counter app for testing ─────────────────────────────────────

type CounterMsg = { type: 'increment' } | { type: 'decrement' } | { type: 'reset' };

interface CounterModel {
  count: number;
}

const counterApp: AppConfig<CounterModel, CounterMsg> = {
  init: () => [{ count: 0 }, Cmd.none()],

  update: (msg, model) => {
    switch (msg.type) {
      case 'increment':
        return [{ count: model.count + 1 }, Cmd.none()];
      case 'decrement':
        return [{ count: model.count - 1 }, Cmd.none()];
      case 'reset':
        return [{ count: 0 }, Cmd.none()];
      default:
        return [model, Cmd.none()];
    }
  },

  view: (model) => text(`Count: ${model.count}`),

  subscriptions: () =>
    Sub.batch(
      Sub.key('up', { type: 'increment' } as CounterMsg),
      Sub.key('down', { type: 'decrement' } as CounterMsg),
      Sub.key('r', { type: 'reset' } as CounterMsg),
    ),
};

// ── MockTerminal tests ─────────────────────────────────────────────────

describe('MockTerminal', () => {
  it('captures write output', () => {
    const term = new MockTerminal();
    term.write('hello');
    term.write(' world');
    expect(term.output).toBe('hello world');
    expect(term.writes).toEqual(['hello', ' world']);
  });

  it('tracks raw mode state', () => {
    const term = new MockTerminal();
    expect(term.isRawMode).toBe(false);
    term.enterRawMode();
    expect(term.isRawMode).toBe(true);
    term.exitRawMode();
    expect(term.isRawMode).toBe(false);
  });

  it('returns configured size', () => {
    const term = new MockTerminal({ cols: 120, rows: 40 });
    expect(term.getSize()).toEqual({ cols: 120, rows: 40 });
  });

  it('rejects invalid dimensions at construction and resize boundaries', () => {
    expect(() => new MockTerminal({ cols: 0 })).toThrow(/columns must be/i);
    expect(() => new MockTerminal({ rows: 0.5 })).toThrow(/rows must be/i);
    const term = new MockTerminal();
    expect(() => term.simulateResize(Number.NaN, 10)).toThrow(/columns must be/i);
    expect(() => term.simulateResize(120, 0)).toThrow(/rows must be/i);
    expect(term.getSize()).toEqual({ cols: 80, rows: 24 });
  });

  it('delivers simulated input to registered handlers', () => {
    const term = new MockTerminal();
    const received: Buffer[] = [];
    term.onInput((data) => received.push(data));

    const buf = Buffer.from('hello');
    term.simulateInput(buf);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(buf);
  });

  it('removes input handlers via offInput', () => {
    const term = new MockTerminal();
    const received: Buffer[] = [];
    const handler = (data: Buffer) => received.push(data);

    term.onInput(handler);
    term.simulateInput(Buffer.from('a'));
    expect(received).toHaveLength(1);

    term.offInput(handler);
    term.simulateInput(Buffer.from('b'));
    expect(received).toHaveLength(1); // still 1, handler was removed
  });

  it('uses a stable handler snapshot during event delivery', () => {
    const term = new MockTerminal();
    const received: string[] = [];
    const second = () => received.push('second');
    term.onInput(() => {
      received.push('first');
      term.offInput(second);
    });
    term.onInput(second);

    term.simulateInput(Buffer.from('x'));
    expect(received).toEqual(['first', 'second']);

    term.simulateInput(Buffer.from('y'));
    expect(received).toEqual(['first', 'second', 'first']);
  });

  it('strips ANSI from plainOutput', () => {
    const term = new MockTerminal();
    term.write('\x1b[31mred\x1b[0m');
    expect(term.plainOutput).toBe('red');
  });

  it('clears output buffer', () => {
    const term = new MockTerminal();
    term.write('data');
    expect(term.output).toBe('data');
    term.clearOutput();
    expect(term.output).toBe('');
    expect(term.writes).toHaveLength(0);
  });

  it('simulates resize events', () => {
    const term = new MockTerminal({ cols: 80, rows: 24 });
    let resized = false;
    term.onResize(() => {
      resized = true;
    });

    term.simulateResize(120, 40);
    expect(resized).toBe(true);
    expect(term.getSize()).toEqual({ cols: 120, rows: 40 });
  });
});

// ── createTestApp tests ────────────────────────────────────────────────

describe('createTestApp', () => {
  let handle: TestAppHandle<CounterModel, CounterMsg> | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  it('renders initial view', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    const frame = handle.lastFrame();
    expect(frame).toContain('Count: 0');
  });

  it('exposes initial model', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    expect(handle.model).toEqual({ count: 0 });
  });

  it('pressKey triggers subscriptions', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    handle.pressKey('up');
    expect(handle.model).toEqual({ count: 1 });
    expect(handle.lastFrame()).toContain('Count: 1');
  });

  it('pressKey handles multiple presses', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    handle.pressKey('up');
    handle.pressKey('up');
    handle.pressKey('up');
    expect(handle.model).toEqual({ count: 3 });
  });

  it('pressKey handles different keys', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    handle.pressKey('up');
    handle.pressKey('up');
    handle.pressKey('down');
    expect(handle.model).toEqual({ count: 1 });
  });

  it('dispatch sends messages to update', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    handle.dispatch({ type: 'increment' });
    expect(handle.model).toEqual({ count: 1 });
    expect(handle.lastFrame()).toContain('Count: 1');
  });

  it('dispatch handles multiple messages', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    handle.dispatch({ type: 'increment' });
    handle.dispatch({ type: 'increment' });
    handle.dispatch({ type: 'decrement' });
    expect(handle.model).toEqual({ count: 1 });
  });

  it('restores fetch mocks when app startup fails', () => {
    const originalFetch = globalThis.fetch;
    const brokenApp: AppConfig<null, CounterMsg> = {
      init: () => {
        throw new Error('startup failed');
      },
      update: (_message, model) => [model, Cmd.none()],
      view: () => text('unreachable'),
      subscriptions: () => Sub.none(),
    };

    expect(() => createTestApp(brokenApp, { fetchMocks: [mockFetch('https://example.test', { body: 'ok' })] })).toThrow('startup failed');
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('lastFrameRaw includes ANSI sequences', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    const raw = handle.lastFrameRaw();
    // Raw output should contain cursor positioning sequences
    expect(raw).toContain('\x1b[');
  });

  it('waitForUpdate waits for the runtime hit map before the next mouse interaction', async () => {
    type DynamicMsg = { type: 'show' } | { type: 'element'; handlerTag: string };
    interface DynamicModel {
      visible: boolean;
      clicked: boolean;
    }

    const dynamicApp: AppConfig<DynamicModel, DynamicMsg> = {
      init: () => [{ visible: false, clicked: false }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'show') return [{ ...model, visible: true }, Cmd.none()];
        return [msg.handlerTag === 'dynamic-click' ? { ...model, clicked: true } : model, Cmd.none()];
      },
      view: (model) =>
        model.visible ? event('dynamic-target', box(text('Target'), undefined, { width: 10, height: 2 }), { onClick: 'dynamic-click' }) : text('Waiting'),
      subscriptions: () =>
        Sub.batch(
          Sub.key<DynamicMsg>('s', { type: 'show' }),
          Sub.elementMouse<DynamicMsg>((mouse) => ({ type: 'element', handlerTag: mouse.handlerTag })),
        ),
    };

    const dynamicHandle = createTestApp(dynamicApp, { cols: 40, rows: 10 });
    dynamicHandle.pressKey('s');
    await dynamicHandle.waitForUpdate();
    dynamicHandle.click(1, 1);

    expect(dynamicHandle.model.clicked).toBe(true);
    dynamicHandle.stop();
  });

  it('click forwards held modifiers through semantic element mouse events', () => {
    type ModifierMsg = { type: 'element'; shift: boolean; ctrl: boolean };
    const modifierApp: AppConfig<{ shift: boolean; ctrl: boolean }, ModifierMsg> = {
      init: () => [{ shift: false, ctrl: false }, Cmd.none()],
      update: (msg) => [{ shift: msg.shift, ctrl: msg.ctrl }, Cmd.none()],
      view: () => event('modifier-target', box(text('Target'), undefined, { width: 10, height: 2 }), { onClick: 'modifier-click' }),
      subscriptions: () =>
        Sub.elementMouse<ModifierMsg>((mouse) => ({
          type: 'element',
          shift: mouse.shift,
          ctrl: mouse.ctrl,
        })),
    };
    const modifierHandle = createTestApp(modifierApp, { cols: 40, rows: 10 });

    modifierHandle.click(1, 1, 'left', { shift: true, ctrl: true });

    expect(modifierHandle.model).toEqual({ shift: true, ctrl: true });
    modifierHandle.stop();
  });

  it('stop() cleanly shuts down', () => {
    handle = createTestApp(counterApp, { cols: 40, rows: 10 });
    handle.stop();

    // After stop, the terminal should no longer be in raw mode
    expect(handle.terminal.isRawMode).toBe(false);

    // Verify cursor is shown and alt screen is exited in the output
    const output = handle.terminal.output;
    expect(output).toContain('\x1b[?25h'); // cursor show
    expect(output).toContain('\x1b[?1049l'); // alt screen exit

    handle = null; // prevent double-stop in afterEach
  });
});

// ── renderToText / renderToLines tests ─────────────────────────────────

describe('renderToText', () => {
  it('renders a text VNode to a string', () => {
    const vnode: VNode = text('Hello, World!');
    const result = renderToText(vnode);
    expect(result).toBe('Hello, World!');
  });

  it('renders a column of text nodes', () => {
    const vnode: VNode = column(text('Line 1'), text('Line 2'), text('Line 3'));
    const result = renderToText(vnode);
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });

  it('renders a row of text nodes', () => {
    const vnode: VNode = row(text('A'), text('B'), text('C'));
    const result = renderToText(vnode);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });

  it('handles empty VNode', () => {
    const vnode: VNode = empty();
    const result = renderToLines(vnode);
    expect(result).toEqual([]);
  });

  it('respects custom width and height', () => {
    const vnode: VNode = text('Hello');
    const lines = renderToLines(vnode, { width: 10, height: 3 });
    // Should be within the specified dimensions
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });

  it('renders wide graphemes once without phantom continuation spaces', () => {
    expect(renderToText(text('界🙂Z'))).toBe('界🙂Z');
  });

  it('provides explicit terminal dimensions to responsive components', () => {
    const vnode = component((context) => text((context?.terminal.cols ?? 80) < 20 ? 'compact' : 'wide'));

    expect(renderToText(vnode, { width: 10, height: 1 })).toBe('compact');
    expect(renderToText(vnode, { width: 30, height: 1 })).toBe('wide');
    expect(renderToText(vnode)).toBe('wide');
  });

  it('rejects invalid and unreasonably large render surfaces', () => {
    expect(() => renderToText(text('x'), { width: Number.NaN })).toThrow(/width must be/i);
    expect(() => renderToText(text('x'), { height: Number.POSITIVE_INFINITY })).toThrow(/height must be/i);
    expect(() => renderToText(text('x'), { width: -1 })).toThrow(/width must be/i);
    expect(() => renderToText(text('x'), { width: 10_000, height: 10_000 })).toThrow(/safety limit/i);
  });
});
