import { describe, expect, it, vi } from 'vitest';
import { type ActionDescriptor, applyAction, createActionRegistry, getAction, getAvailableActions, invokeAction, resolveAction } from '../actions.js';
import { Cmd, cmdKind } from '../types.js';

interface Model {
  readonly count: number;
  readonly selectedId?: string;
}

type AppMsg = { readonly type: 'increment' } | { readonly type: 'delete'; readonly id: string } | { readonly type: 'toast'; readonly message: string };

describe('actions', () => {
  it('creates a registry and retrieves actions by id', () => {
    const increment: ActionDescriptor<Model, AppMsg> = {
      id: 'increment',
      title: 'Increment',
      run: () => ({ type: 'increment' }),
    };

    const registry = createActionRegistry([increment]);

    expect(registry.actions).toHaveLength(1);
    expect(getAction(registry, 'increment')).toEqual(increment);
    expect(getAction(registry, 'increment')).not.toBe(increment);
    expect(getAction(registry, 'missing')).toBeUndefined();
  });

  it('snapshots descriptors into an immutable registry and never exposes a mutable map', () => {
    const shortcuts = ['ctrl+i'];
    const descriptor: ActionDescriptor<Model, AppMsg> = {
      id: 'increment',
      title: 'Increment',
      shortcuts,
      run: () => ({ type: 'increment' }),
    };
    const source = [descriptor];
    const registry = createActionRegistry(source);

    source.length = 0;
    shortcuts[0] = 'ctrl+x';
    (descriptor as { title: string }).title = 'Owned\u001b[31m';

    const registered = getAction(registry, 'increment');
    expect(registered).toMatchObject({
      id: 'increment',
      title: 'Increment',
      shortcuts: ['ctrl+i'],
    });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.actions)).toBe(true);
    expect(Object.isFrozen(registry.byId)).toBe(true);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered?.shortcuts)).toBe(true);
    expect('set' in registry.byId).toBe(false);
    expect(() => (registry.byId as Map<string, ActionDescriptor<Model, AppMsg>>).set('ghost', descriptor)).toThrow();
  });

  it('rejects accessors and sparse registry inputs without invoking attacker code', () => {
    let idReads = 0;
    const accessor = Object.defineProperties(
      {},
      {
        id: {
          enumerable: true,
          get: () => {
            idReads += 1;
            return 'accessor';
          },
        },
        title: { enumerable: true, value: 'Accessor' },
        run: { enumerable: true, value: () => null },
      },
    );
    expect(() => createActionRegistry([accessor as ActionDescriptor<Model, AppMsg>])).toThrow(/id.*own data property/i);
    expect(idReads).toBe(0);

    const sparse = new Array<ActionDescriptor<Model, AppMsg>>(1);
    expect(() => createActionRegistry(sparse)).toThrow(/dense/i);
  });

  it('rejects separators, bidi controls, and lone surrogates in action text', () => {
    for (const unsafe of ['\u2028', '\u2029', '\u202e', '\u2066', '\ud800']) {
      expect(() =>
        createActionRegistry<Model, AppMsg>([
          {
            id: `unsafe${unsafe}`,
            title: 'Unsafe',
            run: () => null,
          },
        ]),
      ).toThrow(/terminal controls/i);
      expect(() =>
        createActionRegistry<Model, AppMsg>([
          {
            id: 'unsafe',
            title: `Unsafe${unsafe}`,
            description: `Description${unsafe}`,
            category: `Category${unsafe}`,
            shortcuts: [`ctrl+x${unsafe}`],
            run: () => null,
          },
        ]),
      ).toThrow(/terminal controls/i);
    }
  });

  it('bounds every action descriptor text field before registry publication', () => {
    const maximum = {
      id: 256,
      title: 256,
      description: 4_096,
      category: 256,
      shortcut: 4_096,
    } as const;
    const run = () => null;
    const accepted = createActionRegistry<Model, AppMsg>([
      {
        id: 'i'.repeat(maximum.id),
        title: 't'.repeat(maximum.title),
        description: 'd'.repeat(maximum.description),
        category: 'c'.repeat(maximum.category),
        shortcuts: ['s'.repeat(maximum.shortcut)],
        run,
      },
    ]);

    expect(accepted.actions[0]).toMatchObject({
      id: 'i'.repeat(maximum.id),
      title: 't'.repeat(maximum.title),
      description: 'd'.repeat(maximum.description),
      category: 'c'.repeat(maximum.category),
      shortcuts: ['s'.repeat(maximum.shortcut)],
    });

    for (const descriptor of [
      { id: 'i'.repeat(maximum.id + 1), title: 'Title', run },
      { id: 'id', title: 't'.repeat(maximum.title + 1), run },
      { id: 'id', title: 'Title', description: 'd'.repeat(maximum.description + 1), run },
      { id: 'id', title: 'Title', category: 'c'.repeat(maximum.category + 1), run },
      { id: 'id', title: 'Title', shortcuts: ['s'.repeat(maximum.shortcut + 1)], run },
    ] as const) {
      expect(() => createActionRegistry<Model, AppMsg>([descriptor])).toThrow(/at most/i);
    }
  });

  it('rejects huge action text before trimming it', () => {
    const hugeId = 'x'.repeat(8 * 1_024 * 1_024);
    const trimSpy = vi.spyOn(String.prototype, 'trim');
    let rejection: unknown;
    let trimCalls = -1;

    try {
      try {
        createActionRegistry<Model, AppMsg>([{ id: hugeId, title: 'Huge', run: () => null }]);
      } catch (error) {
        rejection = error;
      }
      trimCalls = trimSpy.mock.calls.length;
    } finally {
      trimSpy.mockRestore();
    }

    expect(rejection).toBeInstanceOf(TypeError);
    expect((rejection as Error).message).toMatch(/at most 256/i);
    expect(trimCalls).toBe(0);
  });

  it('rejects duplicate action ids', () => {
    expect(() =>
      createActionRegistry<Model, AppMsg>([
        { id: 'duplicate', title: 'First', run: () => ({ type: 'increment' }) },
        { id: 'duplicate', title: 'Second', run: () => ({ type: 'increment' }) },
      ]),
    ).toThrow('Duplicate action id: duplicate');
  });

  it('resolves enabled and disabled actions while omitting hidden actions', () => {
    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'enabled',
        title: 'Enabled',
        run: () => ({ type: 'increment' }),
      },
      {
        id: 'disabled',
        title: 'Disabled',
        when: () => 'disabled',
        run: () => ({ type: 'increment' }),
      },
      {
        id: 'hidden',
        title: 'Hidden',
        when: () => false,
        run: () => ({ type: 'increment' }),
      },
    ]);

    const resolved = getAvailableActions(registry, { count: 0 });

    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({ availability: 'enabled' });
    expect(resolved[0]?.descriptor.id).toBe('enabled');
    expect(resolved[1]).toMatchObject({ availability: 'disabled' });
    expect(resolved[1]?.descriptor.id).toBe('disabled');
    expect(resolveAction(registry, 'hidden', { count: 0 })).toBeUndefined();
  });

  it('rejects every non-contract availability result', () => {
    for (const invalid of [undefined, 'enabled', 1, {}, Promise.resolve(true)]) {
      const registry = createActionRegistry<Model, AppMsg>([
        {
          id: 'invalid-availability',
          title: 'Invalid availability',
          when: (() => invalid) as never,
          run: () => null,
        },
      ]);
      expect(() => getAvailableActions(registry, { count: 0 })).toThrow(/must return true, false, or "disabled"/i);
      expect(() => resolveAction(registry, 'invalid-availability', { count: 0 })).toThrow(/must return true, false, or "disabled"/i);
    }
  });

  it('does not invoke hidden or disabled actions', () => {
    const disabledRun = vi.fn(() => ({ type: 'increment' as const }));
    const hiddenRun = vi.fn(() => ({ type: 'increment' as const }));

    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'disabled',
        title: 'Disabled',
        when: () => 'disabled',
        run: disabledRun,
      },
      {
        id: 'hidden',
        title: 'Hidden',
        when: () => false,
        run: hiddenRun,
      },
    ]);

    expect(invokeAction(registry, 'disabled', { count: 0 })).toBeNull();
    expect(invokeAction(registry, 'hidden', { count: 0 })).toBeNull();
    expect(disabledRun).not.toHaveBeenCalled();
    expect(hiddenRun).not.toHaveBeenCalled();
  });

  it('wraps a single message result in an array', () => {
    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'increment',
        title: 'Increment',
        run: () => ({ type: 'increment' }),
      },
    ]);

    expect(invokeAction(registry, 'increment', { count: 1 })).toEqual([{ type: 'increment' }]);
  });

  it('preserves multiple emitted messages and returns a defensive copy', () => {
    const emitted: readonly AppMsg[] = [
      { type: 'delete', id: 'alpha' },
      { type: 'toast', message: 'Deleted alpha' },
    ];

    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'delete-selected',
        title: 'Delete Selected',
        when: (model) => (model.selectedId ? true : 'disabled'),
        run: (model) => [
          { type: 'delete', id: model.selectedId ?? 'missing' },
          { type: 'toast', message: `Deleted ${model.selectedId ?? 'missing'}` },
        ],
      },
      {
        id: 'prebuilt',
        title: 'Prebuilt',
        run: () => emitted,
      },
    ]);

    const result = invokeAction(registry, 'prebuilt', { count: 0 });
    expect(result).toEqual(emitted);
    expect(result).not.toBe(emitted);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects accessor, sparse, and oversized action-result arrays without reading them', () => {
    let messageReads = 0;
    const accessorResult: AppMsg[] = [];
    Object.defineProperty(accessorResult, '0', {
      enumerable: true,
      get: () => {
        messageReads += 1;
        return { type: 'increment' };
      },
    });
    accessorResult.length = 1;
    const sparseResult = new Array<AppMsg>(1);
    const oversizedResult = new Array<AppMsg>(100_001);
    const source = createActionRegistry<Model, AppMsg>([
      {
        id: 'accessor-result',
        title: 'Accessor result',
        run: () => accessorResult,
      },
      {
        id: 'sparse-result',
        title: 'Sparse result',
        run: () => sparseResult,
      },
      {
        id: 'oversized-result',
        title: 'Oversized result',
        run: () => oversizedResult,
      },
    ]);

    expect(() => invokeAction(source, 'accessor-result', { count: 0 })).toThrow(/index 0.*own data property/i);
    expect(messageReads).toBe(0);
    expect(() => invokeAction(source, 'sparse-result', { count: 0 })).toThrow(/dense/i);
    expect(() => invokeAction(source, 'oversized-result', { count: 0 })).toThrow(/no greater than 100000/i);
  });

  it('returns null when an action emits no messages or is missing', () => {
    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'noop',
        title: 'No-op',
        run: () => null,
      },
    ]);

    expect(invokeAction(registry, 'noop', { count: 0 })).toBeNull();
    expect(invokeAction(registry, 'missing', { count: 0 })).toBeNull();
  });

  it('applies emitted action messages through update in order', () => {
    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'delete-selected',
        title: 'Delete Selected',
        when: (model) => (model.selectedId ? true : 'disabled'),
        run: (model) => [
          { type: 'delete', id: model.selectedId ?? 'missing' },
          { type: 'toast', message: `Deleted ${model.selectedId ?? 'missing'}` },
        ],
      },
    ]);

    const update = vi.fn((msg: AppMsg, model: Model): [Model, Cmd<AppMsg>] => {
      switch (msg.type) {
        case 'delete':
          return [{ ...model, selectedId: undefined }, Cmd.none()];
        case 'toast':
          return [{ ...model, count: model.count + 1 }, Cmd.none()];
        case 'increment':
          return [{ ...model, count: model.count + 1 }, Cmd.none()];
      }
    });

    const [updatedModel, command] = applyAction(registry, 'delete-selected', { count: 0, selectedId: 'alpha' }, update);

    expect(updatedModel).toEqual({ count: 1, selectedId: undefined });
    expect(update.mock.calls).toHaveLength(2);
    expect(update.mock.calls[0]?.[0]).toEqual({ type: 'delete', id: 'alpha' });
    expect(update.mock.calls[1]?.[0]).toEqual({ type: 'toast', message: 'Deleted alpha' });
    expect(cmdKind(command).kind).toBe('none');
  });

  it('batches non-empty commands emitted while applying an action', () => {
    const registry = createActionRegistry<Model, AppMsg>([
      {
        id: 'double-increment',
        title: 'Double Increment',
        run: () => [{ type: 'increment' }, { type: 'increment' }],
      },
    ]);

    const update = (_msg: AppMsg, model: Model): [Model, Cmd<AppMsg>] => [
      { ...model, count: model.count + 1 },
      Cmd.delay(10, { type: 'toast', message: 'done' }),
    ];

    const [updatedModel, command] = applyAction(registry, 'double-increment', { count: 0 }, update);
    const kind = cmdKind(command);

    expect(updatedModel).toEqual({ count: 2 });
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.cmds).toHaveLength(2);
    }
  });
});
