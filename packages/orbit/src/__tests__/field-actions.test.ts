import { afterEach, describe, expect, it, vi } from 'vitest';
import { form } from '../engine.js';
import { buildFieldContextMenu, runFieldAction } from '../field-actions.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildFieldContextMenu', () => {
  it('emits all four actions by default', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    expect(items.map((i) => i.action)).toEqual(['clear', 'reset', 'copy', 'paste']);
  });

  it('honours the actions allowlist', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name', { actions: ['copy', 'paste'] });
    expect(items.map((i) => i.action)).toEqual(['copy', 'paste']);
  });

  it('disables clear when the field is already empty', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: '' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    expect(items.find((i) => i.action === 'clear')?.disabled).toBe(true);
  });

  it('disables reset when the field is pristine', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    expect(items.find((i) => i.action === 'reset')?.disabled).toBe(true);
  });

  it('enables reset after the field is dirtied', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    const items = buildFieldContextMenu(model, 'name');
    expect(items.find((i) => i.action === 'reset')?.disabled).toBe(false);
  });

  it('reset msg restores the value via set-field', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    const items = buildFieldContextMenu(model, 'name');
    const reset = items.find((i) => i.action === 'reset');
    expect(reset?.msg).toEqual({ type: 'form:set-field', field: 'name', value: 'Alice' });
  });
});

describe('runFieldAction', () => {
  it('returns the engine msg for clear / reset', async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    const items = buildFieldContextMenu(model, 'name');
    const resetMsg = await runFieldAction(items.find((i) => i.action === 'reset')!, model, 'name');
    expect(resetMsg).toEqual({ type: 'form:set-field', field: 'name', value: 'Alice' });
  });

  it('writes the field value to the clipboard on copy', async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const writer = vi.fn();
    const items = buildFieldContextMenu(model, 'name');
    const result = await runFieldAction(items.find((i) => i.action === 'copy')!, model, 'name', { writeClipboard: writer });
    expect(result).toBeNull();
    expect(writer).toHaveBeenCalledWith('Alice');
  });

  it('pastes from the clipboard into the field via set-field', async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    const reader = vi.fn(async () => 'pasted');
    const result = await runFieldAction(items.find((i) => i.action === 'paste')!, model, 'name', { readClipboard: reader });
    expect(result).toEqual({ type: 'form:set-field', field: 'name', value: 'pasted' });
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('returns null when no clipboard reader is available', async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    vi.stubGlobal('navigator', { clipboard: undefined });
    const result = await runFieldAction(items.find((i) => i.action === 'paste')!, model, 'name');
    expect(result).toBeNull();
  });

  it('stringifies non-string values for copy', async () => {
    const sut = form({ fields: { count: { label: 'Count', defaultValue: 42, type: 'number' } } });
    const [model] = sut.init();
    const writer = vi.fn();
    const items = buildFieldContextMenu(model, 'count');
    await runFieldAction(items.find((i) => i.action === 'copy')!, model, 'count', { writeClipboard: writer });
    expect(writer).toHaveBeenCalledWith('42');
  });
});
