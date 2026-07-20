import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../app.js';
import { Cmd, type MouseEventData, type Msg, Sub } from '../types.js';
import type { VNode } from '../vdom.js';

// Test the app config structure and type system without launching a real terminal

type TestMsg = Msg<'increment'> | Msg<'decrement'> | Msg<'reset'> | Msg<'quit'>;

interface TestModel {
  count: number;
}

describe('app config', () => {
  const testConfig: AppConfig<TestModel, TestMsg> = {
    init: () => [{ count: 0 }, Cmd.none()],
    update: (msg, model) => {
      switch (msg.type) {
        case 'increment':
          return [{ count: model.count + 1 }, Cmd.none()];
        case 'decrement':
          return [{ count: model.count - 1 }, Cmd.none()];
        case 'reset':
          return [{ count: 0 }, Cmd.none()];
        case 'quit':
          return [model, Cmd.quit()];
      }
    },
    view: (model): VNode => ({
      kind: 'text',
      content: `count: ${model.count}`,
    }),
    subscriptions: () =>
      Sub.batch<TestMsg>(
        Sub.key<TestMsg>('+', { type: 'increment' }),
        Sub.key<TestMsg>('-', { type: 'decrement' }),
        Sub.key<TestMsg>('r', { type: 'reset' }),
        Sub.key<TestMsg>('q', { type: 'quit' }),
      ),
  };

  it('should initialize with correct model', () => {
    const [model, cmd] = testConfig.init();
    expect(model).toEqual({ count: 0 });
    expect(cmd._kind.kind).toBe('none');
  });

  it('should update model on increment', () => {
    const [model] = testConfig.update({ type: 'increment' }, { count: 5 });
    expect(model.count).toBe(6);
  });

  it('should update model on decrement', () => {
    const [model] = testConfig.update({ type: 'decrement' }, { count: 5 });
    expect(model.count).toBe(4);
  });

  it('should reset model', () => {
    const [model] = testConfig.update({ type: 'reset' }, { count: 42 });
    expect(model.count).toBe(0);
  });

  it('should return quit command', () => {
    const [, cmd] = testConfig.update({ type: 'quit' }, { count: 0 });
    expect(cmd._kind.kind).toBe('quit');
  });

  it('should produce a view', () => {
    const vnode = testConfig.view({ count: 7 });
    expect(vnode.kind).toBe('text');
    expect((vnode as { content: string }).content).toBe('count: 7');
  });

  it('should produce subscriptions', () => {
    const sub = testConfig.subscriptions({ count: 0 });
    expect(sub._kind.kind).toBe('batch');
  });
});

describe('update cycle simulation', () => {
  it('should correctly chain multiple updates', () => {
    const init: TestModel = { count: 0 };
    const update = (msg: TestMsg, model: TestModel): TestModel => {
      switch (msg.type) {
        case 'increment':
          return { count: model.count + 1 };
        case 'decrement':
          return { count: model.count - 1 };
        case 'reset':
          return { count: 0 };
        case 'quit':
          return model;
      }
    };

    let model = init;
    model = update({ type: 'increment' }, model);
    model = update({ type: 'increment' }, model);
    model = update({ type: 'increment' }, model);
    model = update({ type: 'decrement' }, model);
    expect(model.count).toBe(2);
  });

  it('should handle Cmd.perform with async tasks', async () => {
    const task = vi.fn().mockResolvedValue(42);
    const toMsg = vi.fn((result: number) => ({ type: 'data' as const, value: result }));

    const cmd = Cmd.perform(task, toMsg);
    expect(cmd._kind.kind).toBe('perform');

    // Simulate runtime execution
    const kind = cmd._kind;
    if (kind.kind === 'perform') {
      const result = await kind.task(new AbortController().signal);
      const msg = kind.toMsg(result);
      expect(msg).toEqual({ type: 'data', value: 42 });
    }
  });

  it('should handle Cmd.batch correctly', () => {
    const cmd = Cmd.batch(Cmd.none(), Cmd.quit(), Cmd.none());
    expect(cmd._kind.kind).toBe('batch');
    if (cmd._kind.kind === 'batch') {
      expect(cmd._kind.cmds.length).toBe(3);
      expect(cmd._kind.cmds[1]!._kind.kind).toBe('quit');
    }
  });
});

describe('Sub.mouse', () => {
  it('should create a mouse subscription', () => {
    const sub = Sub.mouse<TestMsg>((_event) => ({ type: 'increment' }));
    expect(sub._tag).toBe('sub');
    expect(sub._kind.kind).toBe('mouse');
  });

  it('should invoke toMsg with event data', () => {
    const sub = Sub.mouse<TestMsg>((_event) => ({ type: 'increment' }));
    if (sub._kind.kind === 'mouse') {
      const event: MouseEventData = {
        type: 'press',
        button: 0,
        x: 5,
        y: 10,
        ctrl: false,
        alt: false,
        shift: false,
      };
      const msg = sub._kind.toMsg(event);
      expect(msg).toEqual({ type: 'increment' });
    }
  });

  it('should work in Sub.batch', () => {
    const sub = Sub.batch<TestMsg>(
      Sub.key('+', { type: 'increment' }),
      Sub.mouse((_event) => ({ type: 'increment' })),
    );
    expect(sub._kind.kind).toBe('batch');
  });
});
