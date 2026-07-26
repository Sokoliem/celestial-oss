import { createActionRegistry } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { actionCommands, actionKeyBindings, formatActionShortcut, unbindableActionShortcuts } from '../actions.js';

type Model = { readonly canSave: boolean };
type Msg = { readonly type: 'noop' };

function registry(overrides: Array<Record<string, unknown>> = []) {
  return createActionRegistry<Model, Msg>([
    { id: 'file.save', title: 'Save file', category: 'File', shortcuts: ['ctrl+s'], when: (model: Model) => (model.canSave ? true : 'disabled'), run: () => ({ kind: 'none' } as never) },
    { id: 'file.open', title: 'Open file', category: 'File', shortcuts: ['ctrl+o'], run: () => ({ kind: 'none' } as never) },
    ...(overrides as never[]),
  ]);
}

const toMsg = (): Msg => ({ type: 'noop' });

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
});

describe('formatActionShortcut', () => {
  it('formats modifiers and multi-chord sequences for display', () => {
    expect(formatActionShortcut('ctrl+s')).toBe('Ctrl+S');
    expect(formatActionShortcut('ctrl+k ctrl+s')).toBe('Ctrl+K Ctrl+S');
    expect(formatActionShortcut('enter')).toBe('Enter');
  });

  it('returns an empty string for an empty shortcut instead of a stray separator', () => {
    expect(formatActionShortcut('   ')).toBe('');
  });
});
