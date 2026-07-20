import { Cmd, type Sub, type VNode, text } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createFieldAdapter } from '../field-adapter.js';
import {
  BUILT_IN_FORM_FIELD_DESCRIPTORS,
  createFormFieldRegistry,
  defaultFormFieldRegistry,
  defineFormField,
  getDefaultFormFieldRegistry,
} from '../field-registry.js';
import { form } from '../engine.js';

interface ColorPickerModel {
  readonly hex: string;
}

type ColorPickerMsg = { readonly type: 'color:set'; readonly hex: string };

const colorPickerDescriptor = defineFormField<string, ColorPickerModel, ColorPickerMsg>({
  type: 'color-picker',
  create(config) {
    const initial = typeof config.defaultValue === 'string' ? config.defaultValue : '#000000';
    return {
      init(): [ColorPickerModel, Cmd<ColorPickerMsg>] {
        return [{ hex: initial }, Cmd.none()];
      },
      update(msg: ColorPickerMsg, model: ColorPickerModel): [ColorPickerModel, Cmd<ColorPickerMsg>] {
        if (msg.type === 'color:set') return [{ hex: msg.hex }, Cmd.none()];
        return [model, Cmd.none()];
      },
      view(model: ColorPickerModel): VNode {
        return text(model.hex);
      },
    };
  },
  getValue(model) {
    return model.hex;
  },
  setValue(_model, value) {
    return { hex: value };
  },
});

describe('FormFieldTypeRegistry', () => {
  it('exposes a fresh default registry per call', () => {
    const a = defaultFormFieldRegistry();
    const b = defaultFormFieldRegistry();
    expect(a).not.toBe(b);
    expect(a.list().map((d) => d.type).sort()).toEqual(b.list().map((d) => d.type).sort());
  });

  it('registers all built-in descriptors in the default registry', () => {
    const builtIns = new Set(BUILT_IN_FORM_FIELD_DESCRIPTORS.map((d) => d.type));
    const registry = defaultFormFieldRegistry();
    for (const type of builtIns) {
      expect(registry.resolve(type)).not.toBeNull();
    }
  });

  it('returns null for unknown types', () => {
    expect(defaultFormFieldRegistry().resolve('not-a-real-type')).toBeNull();
  });

  it('resolves consumer-registered descriptors', () => {
    const registry = createFormFieldRegistry();
    registry.register(colorPickerDescriptor);
    expect(registry.resolve('color-picker')?.type).toBe('color-picker');
  });

  it('returns an unregister function that removes the descriptor', () => {
    const registry = createFormFieldRegistry();
    const unregister = registry.register(colorPickerDescriptor);
    expect(registry.resolve('color-picker')).not.toBeNull();
    unregister();
    expect(registry.resolve('color-picker')).toBeNull();
  });

  it('does not delete a replacement descriptor when the original is unregistered', () => {
    const registry = createFormFieldRegistry();
    const unregisterFirst = registry.register(colorPickerDescriptor);
    const replacement = defineFormField<string, ColorPickerModel, ColorPickerMsg>({ ...colorPickerDescriptor });
    registry.register(replacement);
    unregisterFirst();
    expect(registry.resolve('color-picker')).toBe(replacement);
  });

  it('shares the process-wide default registry across calls', () => {
    expect(getDefaultFormFieldRegistry()).toBe(getDefaultFormFieldRegistry());
  });
});

describe('built-in Phase-2 adapters round-trip values', () => {
  it.each([
    ['tags', ['alpha', 'beta'], undefined],
    ['rating', 3, undefined],
    ['range', { low: 10, high: 90 }, undefined],
    ['segmented', 'middle', ['left', 'middle', 'right']],
    ['toggle', true, undefined],
    ['radio', 'b', ['a', 'b', 'c']],
    ['multi-select', ['x', 'z'], ['x', 'y', 'z']],
    ['color', '#abcdef', undefined],
    ['file', '/tmp/example.txt', undefined],
  ] as const)('round-trips %s', (type, value, options) => {
    const adapter = createFieldAdapter(
      { label: type, type, defaultValue: value as never, options: options as never },
    );
    const [model] = adapter.init();
    const updated = adapter.setValue(model, value as never);
    const read = adapter.getValue(updated);
    expect(read).toEqual(value);
  });
});

describe('createFieldAdapter with custom registry', () => {
  it('uses a registered custom type', () => {
    const registry = createFormFieldRegistry([colorPickerDescriptor]);
    const adapter = createFieldAdapter<string>({ label: 'Accent', type: 'color-picker', defaultValue: '#abcdef' }, registry);
    expect(adapter.type).toBe('color-picker');
    const [model] = adapter.init();
    expect(adapter.getValue(model)).toBe('#abcdef');
    const next = adapter.setValue(model, '#123456');
    expect(adapter.getValue(next)).toBe('#123456');
  });

  it('falls back to built-in descriptors for unknown types in a custom registry', () => {
    const registry = createFormFieldRegistry([colorPickerDescriptor]);
    const adapter = createFieldAdapter({ label: 'Name', type: 'text', defaultValue: 'hello' }, registry);
    expect(adapter.type).toBe('text');
    const [model] = adapter.init();
    expect(adapter.getValue(model)).toBe('hello');
  });

  it('round-trips values through every built-in descriptor', () => {
    const samples: Record<string, unknown> = {
      text: 'abc',
      password: 'secret',
      number: 42,
      boolean: true,
      select: 'green',
      textarea: 'line1\nline2',
      slider: 33,
      autocomplete: 'New York',
      color: '#0066ff',
    };
    for (const [type, value] of Object.entries(samples)) {
      const options = type === 'select' || type === 'autocomplete' ? ['red', 'green', 'blue', 'New York'] : undefined;
      const adapter = createFieldAdapter({ label: type, type, defaultValue: value, options } as never);
      const [model] = adapter.init();
      const next = adapter.setValue(model, value as never);
      expect(adapter.getValue(next)).toEqual(value);
    }
  });
});

describe('form() consumes the per-form registry', () => {
  it('exposes the configured registry via getFieldTypeRegistry()', () => {
    const registry = createFormFieldRegistry([colorPickerDescriptor]);
    const descriptor = form({
      fields: { accent: { label: 'Accent', type: 'color-picker', defaultValue: '#fff' } },
      fieldTypeRegistry: registry,
    });
    expect(descriptor.getFieldTypeRegistry()).toBe(registry);
  });

  it('defaults to the shared default registry when none is configured', () => {
    const descriptor = form({ fields: { name: { label: 'Name', defaultValue: '' } } });
    expect(descriptor.getFieldTypeRegistry()).toBe(getDefaultFormFieldRegistry());
  });
});

// Sanity: descriptor authoring helper is just identity.
describe('defineFormField', () => {
  it('returns the same object it received', () => {
    expect(defineFormField(colorPickerDescriptor)).toBe(colorPickerDescriptor);
  });
});

// Subscriptions are optional on descriptors; createFieldAdapter must not emit
// a `subscriptions` callable when the descriptor omits it. (Forms downstream
// branch on truthy.)
describe('createFieldAdapter subscriptions optionality', () => {
  it('omits subscriptions when the descriptor does not declare any', () => {
    const registry = createFormFieldRegistry([colorPickerDescriptor]);
    const adapter = createFieldAdapter({ label: 'Accent', type: 'color-picker', defaultValue: '#000000' }, registry);
    expect(adapter.subscriptions).toBeUndefined();
  });

  it('passes through subscriptions when the descriptor declares them', () => {
    const noopSubs = (): Sub<ColorPickerMsg> => ({ kind: 'none' }) as unknown as Sub<ColorPickerMsg>;
    const withSubs = defineFormField<string, ColorPickerModel, ColorPickerMsg>({
      ...colorPickerDescriptor,
      type: 'color-with-subs',
      create(config) {
        const base = colorPickerDescriptor.create(config, []);
        return { ...base, subscriptions: noopSubs };
      },
    });
    const registry = createFormFieldRegistry([withSubs]);
    const adapter = createFieldAdapter({ label: 'Accent', type: 'color-with-subs', defaultValue: '#000' }, registry);
    expect(typeof adapter.subscriptions).toBe('function');
  });
});
