import { type ActionDescriptor, Cmd, createActionRegistry, extractNodeText, text } from '@celestial/core/nebula';
import { createTestApp } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { actionCommands, actionKeyBindings, createActionResolutionSnapshot, formatActionShortcut, unbindableActionShortcuts } from '../actions.js';
import { helpView, keyMap } from '../keyboard.js';

type Model = { readonly canSave: boolean };
type Msg = { readonly type: 'noop'; readonly actionId?: string };

function registry(overrides: readonly ActionDescriptor<Model, Msg>[] = []) {
  return createActionRegistry<Model, Msg>([
    { id: 'file.save', title: 'Save file', category: 'File', shortcuts: ['ctrl+s'], when: (model: Model) => (model.canSave ? true : 'disabled'), run: () => ({ type: 'noop' }) },
    { id: 'file.open', title: 'Open file', category: 'File', shortcuts: ['ctrl+o'], run: () => ({ type: 'noop' }) },
    ...overrides,
  ]);
}

const toMsg = (actionId: string): Msg => ({ type: 'noop', actionId });

describe('actionCommands', () => {
  it('derives palette entries from the registry, with formatted shortcuts', () => {
    const commands = actionCommands(registry(), { canSave: true }, { toMsg });
    const save = commands.find((command) => command.id === 'file.save');

    expect(save?.label).toBe('Save file');
    expect(save?.category).toBe('File');
    expect(save?.shortcut).toBe('Ctrl+S');
    expect(save?.keywords).toContain('file.save');
  });

  it('shares only nominal exact-registry availability snapshots', () => {
    let calls = 0;
    const shared = registry([
      {
        id: 'single-evaluation',
        title: 'Single evaluation',
        when: () => {
          calls += 1;
          return true;
        },
        run: () => null,
      },
    ]);
    const resolution = createActionResolutionSnapshot(shared, { canSave: true });
    const commands = actionCommands(shared, { canSave: true }, { toMsg, resolution });
    const bindings = actionKeyBindings(shared, { canSave: true }, { toMsg, resolution });
    expect(calls).toBe(1);
    expect(commands.some((command) => command.id === 'single-evaluation')).toBe(true);
    expect(bindings.some((binding) => binding.msg.actionId === 'single-evaluation')).toBe(false);

    const ghost = {
      actions: [
        {
          descriptor: {
            id: 'ghost',
            title: 'Ghost\u001b[31m',
            run: () => null,
          },
          availability: 'enabled',
        },
      ],
    };
    expect(() => actionCommands(shared, { canSave: true }, { toMsg, resolution: ghost as never })).toThrow(/exact registry/i);
    const otherResolution = createActionResolutionSnapshot(registry(), { canSave: true });
    expect(() => actionKeyBindings(shared, { canSave: true }, { toMsg, resolution: otherResolution })).toThrow(/exact registry/i);
  });

  it('marks a disabled action rather than hiding it', () => {
    const commands = actionCommands(registry(), { canSave: false }, { toMsg, includeDisabled: true });
    expect(commands.find((command) => command.id === 'file.save')?.label).toContain('(disabled)');
    expect(commands.find((command) => command.id === 'file.save')?.disabled).toBe(true);
  });

  it('evaluates action availability once per command projection', () => {
    let calls = 0;
    const source = registry([
      {
        id: 'alternating',
        title: 'Alternating',
        shortcuts: ['a'],
        when: () => {
          calls += 1;
          return calls % 2 === 1;
        },
        run: () => ({ type: 'noop' }),
      },
    ]);

    expect(actionCommands(source, { canSave: true }, { toMsg }).some((command) => command.id === 'alternating')).toBe(true);
    expect(calls).toBe(1);
  });

  it('snapshots strict options and rejects unsafe disabled labels', () => {
    for (const unsafe of ['\u001b[31m', '\u202e', '\ud800']) {
      expect(() =>
        actionCommands(
          registry(),
          { canSave: false },
          {
            toMsg,
            includeDisabled: true,
            disabledLabelSuffix: unsafe,
          },
        ),
      ).toThrow(/single-line printable/i);
    }
    expect(() =>
      actionCommands(
        registry(),
        { canSave: false },
        {
          toMsg,
          includeDisabled: 'yes' as never,
        },
      ),
    ).toThrow(/includeDisabled.*boolean/i);

    let toMsgReads = 0;
    const hostile = Object.defineProperty({}, 'toMsg', {
      enumerable: true,
      get: () => {
        toMsgReads += 1;
        return toMsg;
      },
    });
    expect(() => actionCommands(registry(), { canSave: true }, hostile as never)).toThrow(/toMsg.*own data property/i);
    expect(toMsgReads).toBe(0);
  });
});

describe('actionKeyBindings', () => {
  it('binds a single chord and keeps a disabled binding inert', () => {
    const bindings = actionKeyBindings(registry(), { canSave: false }, { toMsg });
    const save = bindings.find((binding) => binding.description.startsWith('Save file'));

    expect(save?.key).toBe('s');
    expect(save?.modifiers?.ctrl).toBe(true);
    // Registered but guarded off, so the help screen can still list it.
    expect(save?.when?.()).toBe(false);
  });

  it('projects the canonical action category into both executable bindings and generated help', () => {
    const source = registry();
    const bindings = actionKeyBindings(source, { canSave: true }, { toMsg });
    const commands = actionCommands(source, { canSave: true }, { toMsg });
    const saveBinding = bindings.find((binding) => binding.msg.actionId === 'file.save');

    expect(saveBinding?.category).toBe('File');
    expect(commands.find((command) => command.id === 'file.save')?.category).toBe(saveBinding?.category);
    expect(extractNodeText(helpView(bindings))).toContain('File:');
  });

  it('normalizes shifted alphabetic shortcuts to the emitted terminal key', () => {
    const shifted = registry([{ id: 'file.saveAs', title: 'Save as', shortcuts: ['shift+a'], run: () => ({ type: 'noop' }) }]);
    const bindings = actionKeyBindings(shifted, { canSave: true }, { toMsg });
    const app = createTestApp<{ readonly received: readonly string[] }, Msg>({
      init: () => [{ received: [] }, Cmd.none()],
      update: (message, model) => [{ received: [...model.received, message.actionId ?? 'missing'] }, Cmd.none()],
      view: (model) => text(model.received.join(',')),
      subscriptions: () => keyMap(bindings),
    });

    app.pressKey('a', { shift: true });

    expect(app.model.received).toEqual(['file.saveAs']);
    app.stop();
  });

  it('keeps undiscoverable actions executable without exposing them as commands', () => {
    const internal = registry([{ id: 'internal', title: 'Internal', discoverable: false, shortcuts: ['ctrl+u'], run: () => ({ type: 'noop' }) }]);

    expect(actionCommands(internal, { canSave: true }, { toMsg }).some((command) => command.id === 'internal')).toBe(false);
    expect(actionKeyBindings(internal, { canSave: true }, { toMsg }).some((binding) => binding.msg.actionId === 'internal')).toBe(true);
  });

  it('fails closed for scoped actions until the caller marks that scope active', () => {
    const scoped = registry([{ id: 'screen.next', title: 'Next screen item', scope: 'screen', shortcuts: ['n'], run: () => ({ type: 'noop' }) }]);

    expect(actionCommands(scoped, { canSave: true }, { toMsg }).some((command) => command.id === 'screen.next')).toBe(false);
    expect(actionKeyBindings(scoped, { canSave: true }, { toMsg }).some((binding) => binding.msg.actionId === 'screen.next')).toBe(false);

    const isScopeActive = (scope: 'app' | 'screen' | 'focused' | 'workspace') => scope === 'screen';
    expect(actionCommands(scoped, { canSave: true }, { toMsg, isScopeActive }).some((command) => command.id === 'screen.next')).toBe(true);
    expect(actionKeyBindings(scoped, { canSave: true }, { toMsg, isScopeActive }).some((binding) => binding.msg.actionId === 'screen.next')).toBe(true);
  });

  it('requires literal scope booleans and evaluates each scoped action once per public projection', () => {
    const scoped = registry([
      {
        id: 'screen.once',
        title: 'Scoped once',
        scope: 'screen',
        shortcuts: ['n'],
        run: () => ({ type: 'noop' }),
      },
    ]);
    const projections = [
      (isScopeActive: never) =>
        actionCommands(scoped, { canSave: true }, { toMsg, isScopeActive }),
      (isScopeActive: never) =>
        actionKeyBindings(scoped, { canSave: true }, { toMsg, isScopeActive }),
      (isScopeActive: never) =>
        unbindableActionShortcuts(scoped, { canSave: true }, { isScopeActive }),
    ];

    for (const project of projections) {
      expect(() => project((() => 'yes') as never)).toThrow(/scope resolver.*boolean/i);
      let calls = 0;
      project(
        (() => {
          calls += 1;
          return true;
        }) as never);
      expect(calls).toBe(1);
    }
  });

  it('rejects unsafe disabled descriptions and forged option callbacks', () => {
    for (const unsafe of ['\u001b[31m', '\u202e', '\ud800']) {
      expect(() =>
        actionKeyBindings(
          registry(),
          { canSave: false },
          {
            toMsg,
            disabledDescriptionSuffix: unsafe,
          },
        ),
      ).toThrow(/single-line printable/i);
    }
    expect(() =>
      actionKeyBindings(
        registry(),
        { canSave: true },
        {
          toMsg,
          isScopeActive: true as never,
        },
      ),
    ).toThrow(/isScopeActive.*function/i);
  });
});

describe('unbindableActionShortcuts', () => {
  it('reports a multi-chord sequence that would otherwise be skipped silently', () => {
    // A single KeyBinding cannot express `ctrl+k ctrl+s`; actionKeyBindings
    // drops it with no signal, so an action can declare a shortcut that simply
    // never fires. This is the reporting path that makes that visible.
    const withChord = registry([{ id: 'file.saveAll', title: 'Save all', shortcuts: ['ctrl+k ctrl+s'], run: () => ({ kind: 'none' }) }]);

    const bindings = actionKeyBindings(withChord, { canSave: true }, { toMsg });
    expect(bindings.find((binding) => binding.description.startsWith('Save all'))).toBeUndefined();

    const unbindable = unbindableActionShortcuts(withChord, { canSave: true });
    expect(unbindable).toEqual([{ actionId: 'file.saveAll', shortcut: 'ctrl+k ctrl+s', reason: 'multi-chord-sequence' }]);
  });

  it('is empty when every shortcut is bindable', () => {
    expect(unbindableActionShortcuts(registry(), { canSave: true })).toEqual([]);
  });

  it('reports malformed shortcuts instead of broadening them to plain keys', () => {
    const malformed = registry([
      { id: 'bad.modifier', title: 'Bad modifier', shortcuts: ['cmd+s'], run: () => ({ type: 'noop' }) },
      { id: 'bad.key', title: 'Missing key', shortcuts: ['ctrl+'], run: () => ({ type: 'noop' }) },
      { id: 'bad.plus', title: 'Ambiguous plus', shortcuts: ['ctrl++'], run: () => ({ type: 'noop' }) },
    ]);

    expect(actionKeyBindings(malformed, { canSave: true }, { toMsg }).filter((binding) => binding.msg.actionId?.startsWith('bad.'))).toEqual([]);
    expect(unbindableActionShortcuts(malformed, { canSave: true })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: 'bad.modifier', shortcut: 'cmd+s', reason: 'unknown-modifier' }),
        expect.objectContaining({ actionId: 'bad.key', shortcut: 'ctrl+', reason: 'missing-key' }),
        expect.objectContaining({ actionId: 'bad.plus', shortcut: 'ctrl++', reason: 'missing-key' }),
      ]),
    );
  });

  it('reports latent malformed shortcuts and collisions independent of current visibility', () => {
    const invalid = registry([
      { id: 'hidden.bad', title: 'Hidden bad', shortcuts: ['hyper+x'], when: () => false, run: () => ({ type: 'noop' }) },
      { id: 'first.conflict', title: 'First conflict', shortcuts: ['ctrl+d'], run: () => ({ type: 'noop' }) },
      { id: 'second.conflict', title: 'Second conflict', shortcuts: ['CTRL+D'], run: () => ({ type: 'noop' }) },
    ]);

    expect(unbindableActionShortcuts(invalid, { canSave: true })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: 'hidden.bad', reason: 'unknown-modifier' }),
        expect.objectContaining({ actionId: 'second.conflict', reason: 'conflicting-shortcut', conflictsWithActionId: 'first.conflict' }),
      ]),
    );
    const commands = actionCommands(invalid, { canSave: true }, { toMsg });
    expect(commands.find((command) => command.id === 'first.conflict')?.shortcut).toBe('Ctrl+D');
    expect(commands.find((command) => command.id === 'second.conflict')?.shortcut).toBeUndefined();
  });

  it('lets the first executable action claim a chord when an earlier action is disabled', () => {
    const shared = registry([
      { id: 'disabled.first', title: 'Disabled first', shortcuts: ['ctrl+d'], when: () => 'disabled', run: () => ({ type: 'noop' }) },
      { id: 'enabled.second', title: 'Enabled second', shortcuts: ['ctrl+d'], run: () => ({ type: 'noop' }) },
    ]);

    expect(unbindableActionShortcuts(shared, { canSave: true }).some((entry) => entry.reason === 'conflicting-shortcut')).toBe(false);
    const bindings = actionKeyBindings(shared, { canSave: true }, { toMsg });
    expect(bindings.find((binding) => binding.msg.actionId === 'disabled.first')?.when?.()).toBe(false);
    expect(bindings.find((binding) => binding.msg.actionId === 'enabled.second')?.when).toBeUndefined();

    const commands = actionCommands(shared, { canSave: true }, { toMsg, includeDisabled: true });
    expect(commands.find((command) => command.id === 'disabled.first')?.shortcut).toBeUndefined();
    expect(commands.find((command) => command.id === 'enabled.second')?.shortcut).toBe('Ctrl+D');
  });

  it('reports modifier combinations the current terminal decoder cannot preserve', () => {
    const unsupported = registry([
      { id: 'shift.number', title: 'Shift number', shortcuts: ['shift+1'], run: () => ({ type: 'noop' }) },
      { id: 'ctrl.shift', title: 'Control shift', shortcuts: ['ctrl+shift+s'], run: () => ({ type: 'noop' }) },
    ]);

    expect(unbindableActionShortcuts(unsupported, { canSave: true })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: 'shift.number', reason: 'unsupported-modifier-combination' }),
        expect.objectContaining({ actionId: 'ctrl.shift', reason: 'unsupported-modifier-combination' }),
      ]),
    );
    expect(actionCommands(unsupported, { canSave: true }, { toMsg }).find((command) => command.id === 'ctrl.shift')?.shortcut).toBeUndefined();
  });

  it('rejects terminal control aliases and escape-prefix ambiguities', () => {
    const unsupported = registry([
      { id: 'ctrl.h', title: 'Control H', shortcuts: ['ctrl+h'], run: () => ({ type: 'noop' }) },
      { id: 'ctrl.i', title: 'Control I', shortcuts: ['ctrl+i'], run: () => ({ type: 'noop' }) },
      { id: 'ctrl.j', title: 'Control J', shortcuts: ['ctrl+j'], run: () => ({ type: 'noop' }) },
      { id: 'ctrl.m', title: 'Control M', shortcuts: ['ctrl+m'], run: () => ({ type: 'noop' }) },
      { id: 'alt.bracket', title: 'Alt bracket', shortcuts: ['alt+['], run: () => ({ type: 'noop' }) },
      { id: 'alt.closeBracket', title: 'Alt close bracket', shortcuts: ['alt+]'], run: () => ({ type: 'noop' }) },
      { id: 'alt.shift.o', title: 'Alt shift O', shortcuts: ['alt+shift+o'], run: () => ({ type: 'noop' }) },
    ]);

    const ids = new Set(unbindableActionShortcuts(unsupported, { canSave: true }).map((entry) => entry.actionId));
    for (const id of ['ctrl.h', 'ctrl.i', 'ctrl.j', 'ctrl.m', 'alt.bracket', 'alt.closeBracket', 'alt.shift.o']) {
      expect(ids.has(id)).toBe(true);
      expect(actionKeyBindings(unsupported, { canSave: true }, { toMsg }).some((binding) => binding.msg.actionId === id)).toBe(false);
      expect(actionCommands(unsupported, { canSave: true }, { toMsg }).find((command) => command.id === id)?.shortcut).toBeUndefined();
    }

    for (const shortcut of ['\u0000', '\u007f']) {
      expect(() => registry([{ id: 'raw.control', title: 'Raw control', shortcuts: [shortcut], run: () => ({ type: 'noop' }) }])).toThrow(/terminal controls/i);
    }
  });

  it('checks collisions only among actions in the active scope projection', () => {
    const scoped = registry([
      { id: 'screen.a', title: 'Screen A', scope: 'screen', shortcuts: ['ctrl+d'], run: () => ({ type: 'noop' }) },
      { id: 'screen.b', title: 'Screen B', scope: 'screen', shortcuts: ['ctrl+d'], run: () => ({ type: 'noop' }) },
    ]);
    const onlyA = (_scope: 'app' | 'screen' | 'focused' | 'workspace', action: { descriptor: { id: string } }) => action.descriptor.id === 'screen.a';
    const both = () => true;

    expect(unbindableActionShortcuts(scoped, { canSave: true }, { isScopeActive: onlyA }).some((entry) => entry.reason === 'conflicting-shortcut')).toBe(false);
    expect(unbindableActionShortcuts(scoped, { canSave: true }, { isScopeActive: both })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: 'screen.b', reason: 'conflicting-shortcut', conflictsWithActionId: 'screen.a' }),
      ]),
    );
  });
});

describe('formatActionShortcut', () => {
  it('formats modifiers and multi-chord sequences for display', () => {
    expect(formatActionShortcut('ctrl+s')).toBe('Ctrl+S');
    expect(formatActionShortcut('ctrl+k ctrl+s')).toBe('Ctrl+K Ctrl+S');
    expect(formatActionShortcut('enter')).toBe('Enter');
    expect(formatActionShortcut('plus')).toBe('+');
  });

  it('returns an empty string for an empty shortcut instead of a stray separator', () => {
    expect(formatActionShortcut('   ')).toBe('');
  });

  it('rejects malformed shortcut syntax with an explicit diagnostic', () => {
    expect(() => formatActionShortcut('cmd+s')).toThrow(/unknown modifier/i);
    expect(() => formatActionShortcut('ctrl+')).toThrow(/missing key/i);
  });

  it('rejects unsafe or unbounded display shortcuts without echoing controls', () => {
    for (const unsafe of ['\u001b[31m', '\u202e', '\ud800']) {
      let thrown: unknown;
      try {
        formatActionShortcut(unsafe);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TypeError);
      expect((thrown as Error).message).not.toContain(unsafe);
    }
    expect(() => formatActionShortcut('x'.repeat(4_097))).toThrow(/at most 4096/i);
  });
});
