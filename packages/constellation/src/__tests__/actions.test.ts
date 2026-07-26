import { type ActionDescriptor, Cmd, createActionRegistry, text } from '@celestial/core/nebula';
import { createTestApp } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { actionCommands, actionKeyBindings, formatActionShortcut, unbindableActionShortcuts } from '../actions.js';
import { keyMap } from '../keyboard.js';

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

  it('marks a disabled action rather than hiding it', () => {
    const commands = actionCommands(registry(), { canSave: false }, { toMsg, includeDisabled: true });
    expect(commands.find((command) => command.id === 'file.save')?.label).toContain('(disabled)');
    expect(commands.find((command) => command.id === 'file.save')?.disabled).toBe(true);
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
      { id: 'raw.control', title: 'Raw control', shortcuts: ['\u0000'], run: () => ({ type: 'noop' }) },
      { id: 'raw.delete', title: 'Raw delete', shortcuts: ['\u007f'], run: () => ({ type: 'noop' }) },
    ]);

    const ids = new Set(unbindableActionShortcuts(unsupported, { canSave: true }).map((entry) => entry.actionId));
    for (const id of ['ctrl.h', 'ctrl.i', 'ctrl.j', 'ctrl.m', 'alt.bracket', 'alt.closeBracket', 'alt.shift.o', 'raw.control', 'raw.delete']) {
      expect(ids.has(id)).toBe(true);
      expect(actionKeyBindings(unsupported, { canSave: true }, { toMsg }).some((binding) => binding.msg.actionId === id)).toBe(false);
      expect(actionCommands(unsupported, { canSave: true }, { toMsg }).find((command) => command.id === id)?.shortcut).toBeUndefined();
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
});
