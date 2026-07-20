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
    expect(getAction(registry, 'increment')).toBe(increment);
    expect(getAction(registry, 'missing')).toBeUndefined();
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
