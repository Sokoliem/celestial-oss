import { describe, expect, it, vi } from 'vitest';
import { form } from '../engine.js';
import type { DraftDescriptor, DraftStorage, FormValues } from '../types.js';

interface SampleFields {
  readonly name: { readonly label: string; readonly defaultValue: string };
  readonly age: { readonly label: string; readonly defaultValue: number };
  readonly tags: { readonly label: string; readonly defaultValue: readonly string[] };
}

describe('FormDescriptor.getDirtyFields', () => {
  it('returns no fields when nothing has changed', () => {
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice' },
        age: { label: 'Age', defaultValue: 30 },
      },
    });
    const [model] = sut.init();
    expect(sut.getDirtyFields(model)).toEqual([]);
  });

  it('reports a single dirty field after a change', () => {
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice' },
        age: { label: 'Age', defaultValue: 30 },
      },
    });
    const [model] = sut.init();
    const [next] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    expect(sut.getDirtyFields(next)).toEqual(['name']);
  });

  it('drops the dirty flag when the value reverts to initial', () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
    });
    const [model] = sut.init();
    const [changed] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    const [reverted] = sut.update({ type: 'form:field-change', field: 'name', value: 'Alice' }, changed);
    expect(sut.getDirtyFields(reverted)).toEqual([]);
  });
});

describe('FormDescriptor.getChangedValues', () => {
  it('returns only fields whose values differ from the initial', () => {
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice' },
        age: { label: 'Age', defaultValue: 30 },
      },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    expect(sut.getChangedValues(model)).toEqual({ name: 'Bob' });
  });

  it('uses an explicit baseline when supplied', () => {
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice' },
      },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    expect(sut.getChangedValues(model, { name: 'Bob' })).toEqual({});
  });

  it('treats deep-equal arrays/objects as unchanged', () => {
    const sut = form({
      fields: { tags: { label: 'Tags', defaultValue: ['a', 'b'] } } satisfies SampleFields[keyof SampleFields] extends never ? never : Record<string, { readonly label: string; readonly defaultValue: readonly string[] }>,
    });
    const [model] = sut.init();
    const [equivalent] = sut.update({ type: 'form:field-change', field: 'tags', value: ['a', 'b'] }, model);
    expect(sut.getChangedValues(equivalent)).toEqual({});
  });
});

describe('FormDescriptor.resetField', () => {
  it('reverts a single field to its initial value and clears touched/dirty/errors', () => {
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice', validate: [(value) => (value === '' ? { valid: false, message: 'required' } : { valid: true })] },
      },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    expect(model.fields.name.value).toBe('Bob');
    const after = sut.resetField(model, 'name');
    expect(after.fields.name.value).toBe('Alice');
    expect(after.fields.name.dirty).toBe(false);
    expect(after.fields.name.touched).toBe(false);
    expect(after.fields.name.errors).toEqual([]);
  });

  it('returns the model unchanged when the field name is unknown', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const result = sut.resetField(model, 'does-not-exist' as never);
    expect(result).toBe(model);
  });
});

describe('FormDescriptor.setInitialValues', () => {
  it('rebases initial values so subsequent changes diff against the new baseline', () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
    });
    const [model] = sut.init();
    const rebased = sut.setInitialValues(model, { name: 'Server-loaded' });
    expect(rebased.fields.name.value).toBe('Server-loaded');
    expect(rebased.fields.name.dirty).toBe(false);
    expect(sut.getChangedValues(rebased)).toEqual({});

    const [changed] = sut.update({ type: 'form:field-change', field: 'name', value: 'New' }, rebased);
    expect(sut.getChangedValues(changed)).toEqual({ name: 'New' });
  });

  it('recomputes dirty for unspecified fields against the new baseline', () => {
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice' },
        age: { label: 'Age', defaultValue: 30 },
      },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'age', value: 31 }, model);
    expect(sut.getDirtyFields(model)).toEqual(['age']);

    const rebased = sut.setInitialValues(model, { age: 31 });
    expect(sut.getDirtyFields(rebased)).toEqual([]);
  });
});

describe('FormDescriptor.drafts', () => {
  function createMemoryDraftStorage(): DraftStorage & { readonly store: Map<string, { values: FormValues<never>; meta?: { readonly label?: string } }> } {
    const store = new Map<string, { values: FormValues<never>; meta?: { readonly label?: string }; updatedAt: number }>();
    return {
      store: store as never,
      list(): readonly DraftDescriptor[] {
        return Array.from(store.entries()).map(([name, entry]) => ({ name, updatedAt: entry.updatedAt, label: entry.meta?.label }));
      },
      load(name: string): unknown {
        return store.get(name)?.values ?? null;
      },
      save(name: string, values: unknown, meta?: { readonly label?: string }): void {
        store.set(name, { values: values as never, meta, updatedAt: store.get(name)?.updatedAt ?? Date.now() });
      },
      delete(name: string): void {
        store.delete(name);
      },
      rename(oldName: string, newName: string): void {
        const entry = store.get(oldName);
        if (!entry) return;
        store.delete(oldName);
        store.set(newName, entry);
      },
    } as never;
  }

  it('round-trips list/load/save/delete/rename through the storage adapter', async () => {
    const storage = createMemoryDraftStorage();
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      autosave: { drafts: storage },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);

    await sut.drafts.save('draft-1', model, { label: 'In progress' });
    const entries = await sut.drafts.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('draft-1');
    expect(entries[0]?.label).toBe('In progress');

    const loaded = await sut.drafts.load('draft-1');
    expect(loaded).toEqual({ name: 'Bob' });

    await sut.drafts.rename('draft-1', 'final-draft');
    const renamed = await sut.drafts.list();
    expect(renamed[0]?.name).toBe('final-draft');

    await sut.drafts.delete('final-draft');
    expect(await sut.drafts.list()).toEqual([]);
  });

  it('returns no-op defaults when no storage adapter is configured', async () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
    });
    const [model] = sut.init();
    expect(await sut.drafts.list()).toEqual([]);
    expect(await sut.drafts.load('anything')).toBe(null);
    await expect(sut.drafts.save('x', model)).resolves.toBeUndefined();
    await expect(sut.drafts.delete('x')).resolves.toBeUndefined();
    await expect(sut.drafts.rename('a', 'b')).resolves.toBeUndefined();
  });

  it('serialises the form values via the engine before saving', async () => {
    const storage = createMemoryDraftStorage();
    const saveSpy = vi.spyOn(storage, 'save');
    const sut = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Alice' },
        age: { label: 'Age', defaultValue: 30 },
      },
      autosave: { drafts: storage },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'age', value: 42 }, model);
    await sut.drafts.save('snapshot', model);
    expect(saveSpy).toHaveBeenCalledWith('snapshot', { name: 'Alice', age: 42 }, undefined);
  });
});
