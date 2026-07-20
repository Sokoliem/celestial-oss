import { text, type VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { evaluateVisibility, predicateToVisibleWhen } from '../visibility.js';
import { schemaForm } from '../schema-form.js';
import { createFieldTypeRegistry } from '../schema-registry.js';
import { getFieldArrayValue, getValueAtPath, setFieldArrayValue, setValueAtPath } from '../field-array.js';

describe('evaluateVisibility', () => {
  it('returns true for equals on the matching value', () => {
    expect(evaluateVisibility({ field: 'mode', equals: 'advanced' }, { mode: 'advanced' })).toBe(true);
    expect(evaluateVisibility({ field: 'mode', equals: 'advanced' }, { mode: 'basic' })).toBe(false);
  });

  it('handles `notEquals`, `in`, `notIn`, and `exists`', () => {
    expect(evaluateVisibility({ field: 'mode', notEquals: 'basic' }, { mode: 'advanced' })).toBe(true);
    expect(evaluateVisibility({ field: 'mode', in: ['advanced', 'expert'] }, { mode: 'advanced' })).toBe(true);
    expect(evaluateVisibility({ field: 'mode', notIn: ['basic'] }, { mode: 'advanced' })).toBe(true);
    expect(evaluateVisibility({ field: 'mode', exists: true }, { mode: 'x' })).toBe(true);
    expect(evaluateVisibility({ field: 'mode', exists: false }, {})).toBe(true);
  });

  it('composes via all/any/not', () => {
    expect(
      evaluateVisibility(
        { all: [{ field: 'a', equals: 1 }, { field: 'b', equals: 2 }] },
        { a: 1, b: 2 },
      ),
    ).toBe(true);
    expect(
      evaluateVisibility(
        { any: [{ field: 'a', equals: 1 }, { field: 'b', equals: 2 }] },
        { a: 0, b: 2 },
      ),
    ).toBe(true);
    expect(evaluateVisibility({ not: { field: 'a', equals: 1 } }, { a: 2 })).toBe(true);
  });
});

describe('predicateToVisibleWhen', () => {
  it('returns a function that matches the declarative semantics', () => {
    const visibleWhen = predicateToVisibleWhen({ field: 'mode', equals: 'advanced' });
    expect(visibleWhen({ mode: 'advanced' })).toBe(true);
    expect(visibleWhen({ mode: 'basic' })).toBe(false);
  });
});

describe('schema-form custom field renderer is immutable', () => {
  it('does not mutate the model.value field when the renderer fires onChange', () => {
    const captured: unknown[] = [];
    const registry = createFieldTypeRegistry();
    registry.register({
      typeKey: 'inspector',
      version: '1.0.0',
      renderInput: (_field, value, onChange) => {
        captured.push(value);
        onChange('mutated-via-callback');
        return text('inspector') as VNode;
      },
    });

    const sut = schemaForm({
      schema: {
        fields: [
          {
            kind: 'custom',
            name: 'subject',
            typeKey: 'inspector',
            options: null,
          },
        ],
      },
      value: { subject: 'initial' },
      onChange: () => {},
      fieldTypeRegistry: registry,
    });

    const [model] = sut.init();
    // Render the view — the renderer should observe `value` reflecting the
    // immutable model, never the post-callback value.
    sut.view(model);
    expect(captured[0]).toBe('initial');
    // The view must not have mutated the field model in-place. Mutating in
    // place would mean `getValues()` reports the callback's value even
    // though no msg was dispatched.
    expect(sut.getValues(model)).toEqual({ subject: 'initial' });
  });
});

describe('field-array path aliases', () => {
  it('getValueAtPath and getFieldArrayValue are the same function (back-compat alias)', () => {
    expect(getValueAtPath).toBe(getFieldArrayValue);
  });

  it('setValueAtPath and setFieldArrayValue are the same function (back-compat alias)', () => {
    expect(setValueAtPath).toBe(setFieldArrayValue);
  });

  it('still round-trips through the alias names', () => {
    const target = { items: [{ label: 'a' }, { label: 'b' }] };
    expect(getValueAtPath(target, 'items[1].label')).toBe('b');
    const next = setValueAtPath(target, 'items[1].label', 'B');
    expect((next as typeof target).items[1]!.label).toBe('B');
  });
});
