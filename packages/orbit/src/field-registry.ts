import {
  autocomplete,
  checkbox,
  colorPicker,
  datePicker,
  multiSelect,
  numberInput,
  radioGroup,
  rangeSlider,
  rating,
  segmentedControl,
  select,
  slider,
  tagInput,
  textarea,
  textInput,
  toggle,
} from '@celestial/ui';
import type { Cmd, Sub, VNode } from '@celestial/nebula';
import { segmentGraphemes } from '@celestial/rosetta';
import type { NormalizedOption } from './field-adapter.js';
import type { FieldConfig } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Component-descriptor surface that a form field type must produce.
 * Mirrors `ComponentDescriptor<M, Msg>` without depending on it directly
 * (avoids build-order edges to constellation in the type layer).
 */
export interface FormFieldComponent<M, Msg> {
  init(): [M, Cmd<Msg>];
  update(msg: Msg, model: M): [M, Cmd<Msg>];
  view(model: M): VNode;
  subscriptions?(model: M): Sub<Msg>;
}

/**
 * Descriptor for a single form field type.
 *
 * Each descriptor knows how to (1) construct the underlying component for a
 * `FieldConfig`, (2) read its typed value out of the component model, and
 * (3) inject a value back in. Together this lets the v1 form engine treat
 * field rendering as a plugin point rather than a closed enum.
 */
export interface FormFieldTypeDescriptor<T = unknown, M = unknown, Msg = unknown> {
  /** Unique identifier for this field type (matches `FieldConfig['type']`). */
  readonly type: string;
  /** Build a component for a given field config. */
  create(config: FieldConfig<T>, options: NormalizedOption[]): FormFieldComponent<M, Msg>;
  /** Extract the typed value from the component's model. */
  getValue(model: M, options: NormalizedOption[]): T;
  /** Inject a value into the component's model. */
  setValue(model: M, value: T, options: NormalizedOption[]): M;
}

/**
 * Registry of form field types.
 *
 * Mirrors `FieldTypeRegistry` from the v2 schema layer so consumers can
 * extend the v1 form engine with custom kinds — the same way claude-wrapper's
 * `ModalFieldAdapter` does, but without forking the orbit adapter contract.
 */
export interface FormFieldTypeRegistry {
  /** Register a descriptor. Returns an unregister function. */
  register(descriptor: FormFieldTypeDescriptor): () => void;
  /** Look up a descriptor by type key. Returns null when unknown. */
  resolve(type: string): FormFieldTypeDescriptor | null;
  /** Enumerate all registered descriptors. */
  list(): readonly FormFieldTypeDescriptor[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Identity helper for descriptor authoring — lets call sites get type
 * inference without restating generics.
 */
export function defineFormField<T = unknown, M = unknown, Msg = unknown>(
  descriptor: FormFieldTypeDescriptor<T, M, Msg>,
): FormFieldTypeDescriptor<T, M, Msg> {
  return descriptor;
}

/**
 * Create an empty (or pre-populated) registry. Later `register` calls
 * override earlier registrations for the same type key.
 */
export function createFormFieldRegistry(initial: readonly FormFieldTypeDescriptor[] = []): FormFieldTypeRegistry {
  const descriptors = new Map<string, FormFieldTypeDescriptor>();
  for (const descriptor of initial) {
    descriptors.set(descriptor.type, descriptor);
  }

  return {
    register(descriptor: FormFieldTypeDescriptor): () => void {
      descriptors.set(descriptor.type, descriptor);
      return () => {
        if (descriptors.get(descriptor.type) === descriptor) {
          descriptors.delete(descriptor.type);
        }
      };
    },
    resolve(type: string): FormFieldTypeDescriptor | null {
      return descriptors.get(type) ?? null;
    },
    list(): readonly FormFieldTypeDescriptor[] {
      return [...descriptors.values()];
    },
  };
}

// ─── Built-in descriptors ───────────────────────────────────────────────────

function asString(value: unknown): string {
  return value == null ? '' : String(value);
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const textDescriptor = defineFormField<string>({
  type: 'text',
  create(config) {
    return textInput({
      value: asString(config.defaultValue),
      placeholder: config.placeholder,
    });
  },
  getValue(model) {
    return (model as { value?: string }).value ?? '';
  },
  setValue(model, value) {
    const next = asString(value);
    const m = model as { cursor?: number };
    return { ...(model as object), value: next, cursor: Math.min(m.cursor ?? 0, segmentGraphemes(next).length) } as typeof model;
  },
});

const passwordDescriptor = defineFormField<string>({
  type: 'password',
  create(config) {
    return textInput({
      value: asString(config.defaultValue),
      placeholder: config.placeholder,
      mask: '*',
    });
  },
  getValue(model) {
    return (model as { value?: string }).value ?? '';
  },
  setValue(model, value) {
    const next = asString(value);
    const m = model as { cursor?: number };
    return { ...(model as object), value: next, cursor: Math.min(m.cursor ?? 0, segmentGraphemes(next).length) } as typeof model;
  },
});

const numberDescriptor = defineFormField<number>({
  type: 'number',
  create(config) {
    return numberInput({
      value: asNumber(config.defaultValue),
      label: config.label,
      placeholder: config.placeholder,
    });
  },
  getValue(model) {
    return (model as { value?: number }).value ?? 0;
  },
  setValue(model, value) {
    return { ...(model as object), value: asNumber(value) } as typeof model;
  },
});

const booleanDescriptor = defineFormField<boolean>({
  type: 'boolean',
  create(config) {
    return checkbox({
      label: config.label,
      checked: Boolean(config.defaultValue ?? false),
    });
  },
  getValue(model) {
    return Boolean((model as { checked?: boolean }).checked);
  },
  setValue(model, value) {
    return { ...(model as object), checked: Boolean(value) } as typeof model;
  },
});

const selectDescriptor = defineFormField<string>({
  type: 'select',
  create(config, options) {
    return select({
      options,
      selected: options.findIndex((option) => option.value === asString(config.defaultValue)),
      placeholder: config.placeholder,
    });
  },
  getValue(model, options) {
    const selected = (model as { selected?: number | null }).selected;
    if (selected == null || selected < 0 || selected >= options.length) return '';
    return options[selected]?.value ?? '';
  },
  setValue(model, value, options) {
    const str = asString(value);
    const idx = options.findIndex((option) => option.value === str);
    return { ...(model as object), selected: idx >= 0 ? idx : null } as typeof model;
  },
});

const textareaDescriptor = defineFormField<string>({
  type: 'textarea',
  create(config) {
    return textarea({
      value: asString(config.defaultValue),
      placeholder: config.placeholder,
    });
  },
  getValue(model) {
    const lines = (model as { lines?: readonly string[] }).lines;
    if (!Array.isArray(lines)) return '';
    return lines.join('\n');
  },
  setValue(model, value) {
    const next = asString(value);
    const lines = next.length > 0 ? next.split('\n') : [''];
    return { ...(model as object), lines, cursorRow: 0, cursorCol: 0 } as typeof model;
  },
});

const sliderDescriptor = defineFormField<number>({
  type: 'slider',
  create(config) {
    return slider({
      value: asNumber(config.defaultValue),
      label: config.label,
    });
  },
  getValue(model) {
    return (model as { value?: number }).value ?? 0;
  },
  setValue(model, value) {
    return { ...(model as object), value: asNumber(value) } as typeof model;
  },
});

const dateDescriptor = defineFormField<{ year: number; month: number; day: number } | null>({
  type: 'date',
  create() {
    return datePicker({});
  },
  getValue(model) {
    const selected = (model as { selected?: { year: number; month: number; day: number } | null }).selected;
    return selected ?? null;
  },
  setValue(model, value) {
    if (value == null) {
      return { ...(model as object), selected: null } as typeof model;
    }
    return {
      ...(model as object),
      selected: value,
      viewYear: value.year,
      viewMonth: value.month,
      cursorDay: value.day,
    } as typeof model;
  },
});

const autocompleteDescriptor = defineFormField<string>({
  type: 'autocomplete',
  create(config, options) {
    return autocomplete({
      source: (query: string) =>
        options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())).map((option) => option.label),
      placeholder: config.placeholder,
    });
  },
  getValue(model) {
    return (model as { query?: string }).query ?? '';
  },
  setValue(model, value) {
    return { ...(model as object), query: asString(value) } as typeof model;
  },
});

function normalizeHex(value: unknown): string {
  if (typeof value !== 'string') return '#000000';
  const trimmed = value.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

const colorDescriptor = defineFormField<string>({
  type: 'color',
  create(config) {
    return colorPicker({ value: normalizeHex(config.defaultValue) });
  },
  getValue(model) {
    const m = model as { hexInput?: string };
    return typeof m.hexInput === 'string' ? m.hexInput : '#000000';
  },
  setValue(model, value) {
    return { ...(model as object), hexInput: normalizeHex(value) } as typeof model;
  },
});

// ─── Additional field types (Phase 2 — adapter parity with constellation) ──

const tagsDescriptor = defineFormField<readonly string[]>({
  type: 'tags',
  create(config) {
    const initial = Array.isArray(config.defaultValue) ? (config.defaultValue as readonly unknown[]).map((entry) => String(entry)) : [];
    return tagInput({ tags: [...initial], placeholder: config.placeholder });
  },
  getValue(model) {
    const tags = (model as { tags?: readonly unknown[] }).tags;
    if (!Array.isArray(tags)) return [];
    return tags.map((entry) => String(entry));
  },
  setValue(model, value) {
    const next = Array.isArray(value) ? value.map((entry) => String(entry)) : [];
    return { ...(model as object), tags: next, inputBuffer: '', cursorPos: 0, highlightedTag: -1 } as typeof model;
  },
});

const ratingDescriptor = defineFormField<number>({
  type: 'rating',
  create(config) {
    return rating({ value: asNumber(config.defaultValue), interactive: true });
  },
  getValue(model) {
    return (model as { value?: number }).value ?? 0;
  },
  setValue(model, value) {
    const m = model as { max?: number };
    const next = asNumber(value);
    const max = typeof m.max === 'number' ? m.max : 5;
    return { ...(model as object), value: Math.max(0, Math.min(max, next)) } as typeof model;
  },
});

interface RangeValue {
  readonly low: number;
  readonly high: number;
}

function isRangeValue(value: unknown): value is RangeValue {
  return Boolean(value) && typeof value === 'object' && typeof (value as RangeValue).low === 'number' && typeof (value as RangeValue).high === 'number';
}

const rangeDescriptor = defineFormField<RangeValue>({
  type: 'range',
  create(config) {
    const initial = isRangeValue(config.defaultValue) ? config.defaultValue : { low: 0, high: 100 };
    return rangeSlider({ low: initial.low, high: initial.high });
  },
  getValue(model) {
    const m = model as { low?: number; high?: number };
    return { low: m.low ?? 0, high: m.high ?? 0 };
  },
  setValue(model, value) {
    const range = isRangeValue(value) ? value : { low: 0, high: 0 };
    return { ...(model as object), low: range.low, high: range.high } as typeof model;
  },
});

const segmentedDescriptor = defineFormField<string>({
  type: 'segmented',
  create(config, options) {
    const labels = options.map((option) => option.label);
    const defaultStr = asString(config.defaultValue);
    const selected = Math.max(
      0,
      options.findIndex((option) => option.value === defaultStr),
    );
    return segmentedControl({ options: labels, selected });
  },
  getValue(model, options) {
    const m = model as { selected?: number };
    if (typeof m.selected !== 'number' || m.selected < 0 || m.selected >= options.length) return '';
    return options[m.selected]?.value ?? '';
  },
  setValue(model, value, options) {
    const idx = options.findIndex((option) => option.value === asString(value));
    return { ...(model as object), selected: idx >= 0 ? idx : 0, highlighted: idx >= 0 ? idx : 0 } as typeof model;
  },
});

const toggleDescriptor = defineFormField<boolean>({
  type: 'toggle',
  create(config) {
    return toggle({ label: config.label, checked: Boolean(config.defaultValue ?? false) });
  },
  getValue(model) {
    return Boolean((model as { checked?: boolean }).checked);
  },
  setValue(model, value) {
    return { ...(model as object), checked: Boolean(value) } as typeof model;
  },
});

const radioDescriptor = defineFormField<string>({
  type: 'radio',
  create(config, options) {
    const defaultStr = asString(config.defaultValue);
    const selected = options.findIndex((option) => option.value === defaultStr);
    return radioGroup({
      options: options.map((option) => ({ label: option.label, value: option.value })),
      selected: selected >= 0 ? selected : 0,
    });
  },
  getValue(model, options) {
    const m = model as { selected?: number };
    if (typeof m.selected !== 'number' || m.selected < 0 || m.selected >= options.length) return '';
    return options[m.selected]?.value ?? '';
  },
  setValue(model, value, options) {
    const idx = options.findIndex((option) => option.value === asString(value));
    return { ...(model as object), selected: idx >= 0 ? idx : 0, highlighted: idx >= 0 ? idx : 0 } as typeof model;
  },
});

const multiSelectDescriptor = defineFormField<readonly string[]>({
  type: 'multi-select',
  create(config, options) {
    const defaults = Array.isArray(config.defaultValue) ? new Set((config.defaultValue as readonly unknown[]).map((entry) => String(entry))) : new Set<string>();
    const selectedIndexes: number[] = [];
    options.forEach((option, index) => {
      if (defaults.has(option.value)) selectedIndexes.push(index);
    });
    return multiSelect({
      options: options.map((option) => ({ label: option.label, value: option.value })),
      placeholder: config.placeholder,
      selected: selectedIndexes,
    });
  },
  getValue(model, options) {
    const selectedSet = (model as { selected?: Set<number> }).selected;
    if (!(selectedSet instanceof Set)) return [];
    const values: string[] = [];
    for (const index of selectedSet) {
      const option = options[index];
      if (option) values.push(option.value);
    }
    return values;
  },
  setValue(model, value, options) {
    const requested = new Set(Array.isArray(value) ? value.map((entry) => String(entry)) : []);
    const next = new Set<number>();
    options.forEach((option, index) => {
      if (requested.has(option.value)) next.add(index);
    });
    return { ...(model as object), selected: next } as typeof model;
  },
});

const fileDescriptor = defineFormField<string>({
  type: 'file',
  // File-picker integration is deferred to a future phase. For now keep the
  // type registered so consumers can use it for path entry without falling
  // back to "text" silently — same lifecycle pattern color used pre-Phase-2.
  create(config) {
    return textInput({
      value: asString(config.defaultValue),
      placeholder: config.placeholder ?? 'Path to file',
    });
  },
  getValue(model) {
    return (model as { value?: string }).value ?? '';
  },
  setValue(model, value) {
    const next = asString(value);
    const m = model as { cursor?: number };
    return { ...(model as object), value: next, cursor: Math.min(m.cursor ?? 0, segmentGraphemes(next).length) } as typeof model;
  },
});

/**
 * Built-in field type descriptors. Stored as the unknown-parameterized
 * descriptor type because the registry intentionally erases the value type
 * (the engine pulls values out as `unknown` and the resolver pipeline
 * coerces). Authored descriptors keep their narrower T for type-safe call
 * sites, then widen here.
 */
export const BUILT_IN_FORM_FIELD_DESCRIPTORS: readonly FormFieldTypeDescriptor[] = Object.freeze([
  textDescriptor as FormFieldTypeDescriptor,
  passwordDescriptor as FormFieldTypeDescriptor,
  numberDescriptor as FormFieldTypeDescriptor,
  booleanDescriptor as FormFieldTypeDescriptor,
  selectDescriptor as FormFieldTypeDescriptor,
  textareaDescriptor as FormFieldTypeDescriptor,
  sliderDescriptor as FormFieldTypeDescriptor,
  dateDescriptor as FormFieldTypeDescriptor,
  autocompleteDescriptor as FormFieldTypeDescriptor,
  colorDescriptor as FormFieldTypeDescriptor,
  tagsDescriptor as FormFieldTypeDescriptor,
  ratingDescriptor as FormFieldTypeDescriptor,
  rangeDescriptor as FormFieldTypeDescriptor,
  segmentedDescriptor as FormFieldTypeDescriptor,
  toggleDescriptor as FormFieldTypeDescriptor,
  radioDescriptor as FormFieldTypeDescriptor,
  multiSelectDescriptor as FormFieldTypeDescriptor,
  fileDescriptor as FormFieldTypeDescriptor,
]);

/**
 * Construct a fresh registry populated with all built-in descriptors.
 * Each call returns a new registry so consumer mutations don't leak.
 */
export function defaultFormFieldRegistry(): FormFieldTypeRegistry {
  return createFormFieldRegistry(BUILT_IN_FORM_FIELD_DESCRIPTORS);
}

// A single shared default registry. Used when `createFieldAdapter` is
// called without an explicit registry. Treated as immutable; consumers
// that want to add types should pass their own registry instead of
// mutating this one.
let sharedDefaultRegistry: FormFieldTypeRegistry | undefined;

/**
 * Return the process-wide default registry. Lazy so that constellation
 * imports don't run at module top-level cost.
 */
export function getDefaultFormFieldRegistry(): FormFieldTypeRegistry {
  if (!sharedDefaultRegistry) {
    sharedDefaultRegistry = defaultFormFieldRegistry();
  }
  return sharedDefaultRegistry;
}
