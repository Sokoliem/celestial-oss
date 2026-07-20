import type { ThemeInput } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Cmd, Msg, Sub, ThemeContext, VNode } from '@celestial/nebula';
import { column, Cmd as NebulaCmd, Sub as NebulaSub, row, text } from '@celestial/nebula';
import { createFocusStackState, type FocusStackState, focusStackUpdate, getActiveFocusId, routeKeyboard } from '@celestial/nexus';
import { type LocaleLike, segmentGraphemes } from '@celestial/rosetta';
import {
  type ComponentDescriptor,
  checkbox,
  checkboxGroup,
  colorPicker,
  datePicker,
  formField,
  multiSelect,
  radioGroup,
  rangeSlider,
  rating,
  segmentedControl,
  select,
  tagInput,
  textarea,
  textInput,
  toggle,
} from '@celestial/ui';
import { type OrbitMessages, tr } from './i18n.js';
import { emitLedgerEvent, type OrbitLedger } from './ledger.js';
import { parseArgSchema } from './schema.js';
import { jsonValuesEqual } from './schema-json.js';
import { resolveParsedForm } from './schema-resolver.js';
import type {
  ArgField,
  ArgSchema,
  CustomField,
  FieldTypeRegistry,
  FormContext,
  JsonValue,
  RecentValueStore,
  ResolvedOutput,
  ResolvedValidation,
} from './schema-types.js';
import { feedbackColor, formColor } from './theme.js';

type SchemaValueMap = Record<string, JsonValue>;
const SCHEMA_FORM_LAYER_ID = 'schema-form';

interface SchemaFieldAdapter {
  readonly interactive: boolean;
  readonly multiLine?: boolean;
  init(): [unknown, Cmd<unknown>];
  update(msg: unknown, model: unknown): [unknown, Cmd<unknown>];
  view(model: unknown, onChange?: (next: JsonValue) => void): VNode;
  subscriptions?(model: unknown): Sub<unknown>;
  getValue(model: unknown): JsonValue;
  setValue(model: unknown, value: JsonValue): unknown;
  setFocused(model: unknown, focused: boolean): unknown;
}

export interface SchemaFormProps<V extends SchemaValueMap = SchemaValueMap> {
  readonly schema: ArgSchema;
  readonly value: Partial<V>;
  readonly onChange: (next: V) => void;
  readonly onSubmit?: (resolved: V) => void;
  readonly locked?: ReadonlyArray<string>;
  readonly context?: FormContext;
  readonly fieldTypeRegistry?: FieldTypeRegistry;
  readonly recentValueStore?: RecentValueStore;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
  readonly ledger?: OrbitLedger;
  readonly ledgerFormId?: string;
  readonly messages?: OrbitMessages;
  readonly locale?: LocaleLike;
}

export interface SchemaFormModel<V extends SchemaValueMap = SchemaValueMap> {
  readonly fieldModels: Readonly<Record<string, unknown>>;
  readonly values: V;
  readonly resolved: ResolvedOutput<V>;
  readonly validation: ResolvedValidation;
  readonly activeField: string | null;
  readonly focusStack: FocusStackState;
  readonly submitted: boolean;
}

export type SchemaFormMsg =
  | Msg<'schema-form:field-msg', { readonly field: string; readonly msg: unknown }>
  | Msg<'schema-form:focus-next'>
  | Msg<'schema-form:focus-prev'>
  | Msg<'schema-form:submit'>
  | Msg<'schema-form:set-field', { readonly field: string; readonly value: JsonValue }>;

export interface SchemaFormDescriptor<V extends SchemaValueMap = SchemaValueMap> extends ComponentDescriptor<SchemaFormModel<V>, SchemaFormMsg> {
  init(): [SchemaFormModel<V>, Cmd<SchemaFormMsg>];
  update(msg: SchemaFormMsg, model: SchemaFormModel<V>): [SchemaFormModel<V>, Cmd<SchemaFormMsg>];
  view(model: SchemaFormModel<V>): VNode;
  subscriptions(model: SchemaFormModel<V>): Sub<SchemaFormMsg>;
  getValues(model: SchemaFormModel<V>): V;
  getResolved(model: SchemaFormModel<V>): ResolvedOutput<V>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function withFocusFlag(model: unknown, focused: boolean): unknown {
  if (!isRecord(model) || !Object.hasOwn(model, 'focused')) {
    return model;
  }
  return { ...model, focused };
}

function parseIsoDate(value: JsonValue): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatIsoDate(value: unknown): JsonValue {
  if (!isRecord(value)) return '';
  const year = typeof value.year === 'number' ? value.year : null;
  const month = typeof value.month === 'number' ? value.month : null;
  const day = typeof value.day === 'number' ? value.day : null;
  if (year === null || month === null || day === null) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function stringifyTemplateValue(value: JsonValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

type TemplateToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'substitution'; readonly name: string; readonly value: string; readonly missing: boolean };

function tokenizeTemplate(template: string, values: Readonly<Record<string, JsonValue>>): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let lastIndex = 0;

  for (let match = pattern.exec(template); match !== null; match = pattern.exec(template)) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', text: template.slice(lastIndex, match.index) });
    }

    const name = match[1]!;
    const missing = !Object.hasOwn(values, name);
    tokens.push({
      kind: 'substitution',
      name,
      value: missing ? '' : stringifyTemplateValue(values[name] ?? null),
      missing,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({ kind: 'text', text: template.slice(lastIndex) });
  }

  return tokens;
}

function renderTemplatePreview(
  template: string,
  values: Readonly<Record<string, JsonValue>>,
  themed: { readonly theme?: ThemeInput; readonly themeCtx?: ThemeContext; readonly messages?: OrbitMessages; readonly locale?: LocaleLike },
): VNode {
  const previewLines = template.length > 0 ? template.split('\n') : [''];
  const mutedColor = formColor(themed, 'muted');
  const dangerColor = feedbackColor(themed, 'danger');
  const successColor = feedbackColor(themed, 'success');

  return column(
    text(tr(themed.messages, 'schema-form.preview.label', undefined, themed.locale), style({ dim: true, color: mutedColor })),
    ...previewLines.map((line) =>
      row(
        ...tokenizeTemplate(line, values).map((token) =>
          token.kind === 'text'
            ? text(token.text, style({ color: mutedColor }))
            : text(
                token.missing ? `{{${token.name}}}` : token.value,
                token.missing ? style({ color: dangerColor, dim: true }) : style({ color: successColor, bold: true }),
              ),
        ),
      ),
    ),
  );
}

function createTextAdapter(initialValue: string, placeholder?: string, mask?: string): SchemaFieldAdapter {
  const descriptor = textInput({ value: initialValue, placeholder, mask });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => (isRecord(model) && typeof model.value === 'string' ? model.value : ''),
    setValue: (model, value) => {
      const nextValue = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
      if (!isRecord(model)) return model;
      return { ...model, value: nextValue, cursor: segmentGraphemes(nextValue).length };
    },
    setFocused: withFocusFlag,
  };
}

function createTextareaAdapter(initialValue: string, placeholder?: string): SchemaFieldAdapter {
  const descriptor = textarea({ value: initialValue, placeholder });
  return {
    interactive: true,
    multiLine: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      if (!isRecord(model) || !Array.isArray(model.lines)) return '';
      return model.lines.map((line) => String(line)).join('\n');
    },
    setValue: (model, value) => {
      const nextValue = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
      if (!isRecord(model)) return model;
      const lines = nextValue.length > 0 ? nextValue.split('\n') : [''];
      return { ...model, lines, cursorRow: Math.min(Number(model.cursorRow ?? 0), lines.length - 1), cursorCol: 0 };
    },
    setFocused: withFocusFlag,
  };
}

function createCheckboxAdapter(initialValue: boolean, label: string): SchemaFieldAdapter {
  const descriptor = checkbox({ checked: initialValue, label });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => Boolean(isRecord(model) ? model.checked : false),
    setValue: (model, value) => (!isRecord(model) ? model : { ...model, checked: Boolean(value) }),
    setFocused: withFocusFlag,
  };
}

function createSelectAdapter(field: Extract<ArgField, { kind: 'enum' }>, initialValue: string): SchemaFieldAdapter {
  const descriptor = select({
    options: field.options.map((option) => ({ label: option.label, value: option.value })),
    selected: field.options.findIndex((option) => option.value === initialValue),
    placeholder: field.placeholder,
  });

  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      if (!isRecord(model) || typeof model.selected !== 'number') return '';
      return field.options[model.selected]?.value ?? '';
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const nextIndex = field.options.findIndex((option) => option.value === value);
      return { ...model, selected: nextIndex >= 0 ? nextIndex : null, highlighted: nextIndex >= 0 ? nextIndex : 0 };
    },
    setFocused: withFocusFlag,
  };
}

function createMultiEnumAdapter(field: Extract<ArgField, { kind: 'multiEnum' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const selectedValues = new Set(Array.isArray(initialValue) ? initialValue.map((entry) => String(entry)) : []);
  const descriptor = checkboxGroup({
    options: field.options.map((option) => ({
      label: option.label,
      value: option.value,
      checked: selectedValues.has(option.value),
    })),
  });

  return {
    interactive: true,
    multiLine: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      if (!isRecord(model) || !(model.checked instanceof Set)) return [];
      return [...model.checked.values()].map((entry) => String(entry));
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const values = new Set(Array.isArray(value) ? value.map((entry) => String(entry)) : []);
      return { ...model, checked: values };
    },
    setFocused: withFocusFlag,
  };
}

function createDateAdapter(initialValue: JsonValue): SchemaFieldAdapter {
  const initialDate = parseIsoDate(initialValue);
  const descriptor = datePicker({ selected: initialDate ?? undefined });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => formatIsoDate(isRecord(model) ? model.selected : null),
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const selected = parseIsoDate(value);
      if (!selected) {
        return { ...model, selected: null };
      }
      return {
        ...model,
        selected,
        viewYear: selected.year,
        viewMonth: selected.month,
        cursorDay: selected.day,
      };
    },
    setFocused: withFocusFlag,
  };
}

function normalizeStringValue(value: JsonValue, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function createTagsAdapter(initialValue: JsonValue): SchemaFieldAdapter {
  const initial = Array.isArray(initialValue) ? initialValue.map((entry) => String(entry)) : [];
  const descriptor = tagInput({ tags: initial });
  return {
    interactive: true,
    multiLine: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      const tags = isRecord(model) && Array.isArray(model.tags) ? model.tags : [];
      return tags.map((entry) => String(entry));
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const tags = Array.isArray(value) ? value.map((entry) => String(entry)) : [];
      return { ...model, tags, inputBuffer: '', cursorPos: 0, highlightedTag: -1 };
    },
    setFocused: withFocusFlag,
  };
}

function createRatingAdapter(field: Extract<ArgField, { kind: 'rating' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const max = field.maxValue ?? 5;
  const descriptor = rating({ value: typeof initialValue === 'number' ? initialValue : 0, max, interactive: true });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => (isRecord(model) && typeof model.value === 'number' ? model.value : 0),
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const next = typeof value === 'number' ? value : 0;
      const m = model as { max?: number };
      const capped = Math.max(0, Math.min(m.max ?? max, next));
      return { ...model, value: capped };
    },
    setFocused: withFocusFlag,
  };
}

function createRangeAdapter(field: Extract<ArgField, { kind: 'range' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  let low = min;
  let high = max;
  if (initialValue && typeof initialValue === 'object' && !Array.isArray(initialValue)) {
    const record = initialValue as Record<string, JsonValue>;
    low = typeof record.low === 'number' ? record.low : min;
    high = typeof record.high === 'number' ? record.high : max;
  }
  const descriptor = rangeSlider({ min, max, step: field.step ?? 1, low, high });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      if (!isRecord(model)) return { low: min, high: max };
      const lo = typeof model.low === 'number' ? model.low : min;
      const hi = typeof model.high === 'number' ? model.high : max;
      return { low: lo, high: hi } as JsonValue;
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, JsonValue>;
        return {
          ...model,
          low: typeof record.low === 'number' ? record.low : min,
          high: typeof record.high === 'number' ? record.high : max,
        };
      }
      return { ...model, low: min, high: max };
    },
    setFocused: withFocusFlag,
  };
}

function createSegmentedAdapter(field: Extract<ArgField, { kind: 'segmented' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const labels = field.options.map((option) => option.label);
  const initialIdx = field.options.findIndex((option) => option.value === normalizeStringValue(initialValue));
  const descriptor = segmentedControl({ options: labels, selected: Math.max(0, initialIdx) });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      const selected = isRecord(model) && typeof model.selected === 'number' ? model.selected : 0;
      return field.options[selected]?.value ?? '';
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const idx = field.options.findIndex((option) => option.value === normalizeStringValue(value));
      const next = idx >= 0 ? idx : 0;
      return { ...model, selected: next, highlighted: next };
    },
    setFocused: withFocusFlag,
  };
}

function createToggleAdapter(field: Extract<ArgField, { kind: 'toggle' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const descriptor = toggle({ label: field.label ?? field.name, checked: Boolean(initialValue) });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => Boolean(isRecord(model) ? model.checked : false),
    setValue: (model, value) => (!isRecord(model) ? model : { ...model, checked: Boolean(value) }),
    setFocused: withFocusFlag,
  };
}

function normalizeHexColor(value: JsonValue): string {
  const str = normalizeStringValue(value, '#000000').trim();
  return str.startsWith('#') ? str : `#${str}`;
}

function createColorAdapter(initialValue: JsonValue): SchemaFieldAdapter {
  const descriptor = colorPicker({ value: normalizeHexColor(initialValue) });
  return {
    interactive: true,
    multiLine: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      if (!isRecord(model) || typeof model.hexInput !== 'string') return '#000000';
      return model.hexInput;
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      return { ...model, hexInput: normalizeHexColor(value) };
    },
    setFocused: withFocusFlag,
  };
}

function createRadioAdapter(field: Extract<ArgField, { kind: 'radio' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const idx = field.options.findIndex((option) => option.value === normalizeStringValue(initialValue));
  const descriptor = radioGroup({
    options: field.options.map((option) => ({ label: option.label, value: option.value })),
    selected: idx >= 0 ? idx : 0,
  });
  return {
    interactive: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      const selected = isRecord(model) && typeof model.selected === 'number' ? model.selected : 0;
      return field.options[selected]?.value ?? '';
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const next = field.options.findIndex((option) => option.value === normalizeStringValue(value));
      const safe = next >= 0 ? next : 0;
      return { ...model, selected: safe, highlighted: safe };
    },
    setFocused: withFocusFlag,
  };
}

function createMultiSelectAdapter(field: Extract<ArgField, { kind: 'multi-select' }>, initialValue: JsonValue): SchemaFieldAdapter {
  const requested = new Set(Array.isArray(initialValue) ? initialValue.map((entry) => String(entry)) : []);
  const selectedIndexes: number[] = [];
  field.options.forEach((option, index) => {
    if (requested.has(option.value)) selectedIndexes.push(index);
  });
  const descriptor = multiSelect({
    options: field.options.map((option) => ({ label: option.label, value: option.value })),
    placeholder: field.placeholder,
    selected: selectedIndexes,
  });
  return {
    interactive: true,
    multiLine: true,
    init: () => descriptor.init(),
    update: (msg, model) => descriptor.update(msg as never, model as never),
    view: (model) => descriptor.view(model as never),
    subscriptions: descriptor.subscriptions ? (model) => descriptor.subscriptions!(model as never) : undefined,
    getValue: (model) => {
      if (!isRecord(model) || !(model.selected instanceof Set)) return [];
      const values: string[] = [];
      for (const index of model.selected) {
        const option = field.options[index as number];
        if (option) values.push(option.value);
      }
      return values;
    },
    setValue: (model, value) => {
      if (!isRecord(model)) return model;
      const requestedValues = new Set(Array.isArray(value) ? value.map((entry) => String(entry)) : []);
      const next = new Set<number>();
      field.options.forEach((option, index) => {
        if (requestedValues.has(option.value)) next.add(index);
      });
      return { ...model, selected: next };
    },
    setFocused: withFocusFlag,
  };
}

function createFileAdapter(initialValue: JsonValue): SchemaFieldAdapter {
  // File explorer integration is deferred to a later phase. For now route
  // through the standard text input so `file` is a real registered kind
  // rather than a silent textual fallback.
  return createTextAdapter(normalizeStringValue(initialValue), 'Path to file');
}

function createCustomAdapter(
  field: CustomField,
  initialValue: JsonValue,
  registry: FieldTypeRegistry | undefined,
  context: FormContext | undefined,
): SchemaFieldAdapter {
  const descriptor = registry?.resolve(field.typeKey);
  const interactive = Boolean(descriptor?.renderInput);
  return {
    interactive,
    multiLine: true,
    init: () => [{ value: initialValue, focused: false }, NebulaCmd.none()],
    update: (_msg, model) => [model, NebulaCmd.none()],
    view: (model, onChange) => {
      const currentValue = isRecord(model) && Object.hasOwn(model, 'value') ? (model.value as JsonValue) : initialValue;
      if (descriptor?.renderInput) {
        return descriptor.renderInput(
          field,
          currentValue,
          // The renderer is given a fire-and-forget callback. We deliberately
          // do NOT mutate the supplied model — that would break the Elm
          // architecture's structural-diff contract. Consumers route the
          // change through `onChange` (or `schema-form:set-field`) and the
          // engine produces a new model on the next tick.
          (nextValue) => {
            onChange?.(nextValue);
          },
          context ?? {},
        );
      }
      if (descriptor?.describeValue) {
        return text(descriptor.describeValue(field, currentValue));
      }
      return text(currentValue == null ? '' : typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue));
    },
    getValue: (model) => (isRecord(model) && Object.hasOwn(model, 'value') ? (model.value as JsonValue) : initialValue),
    setValue: (model, value) => (!isRecord(model) ? model : { ...model, value }),
    setFocused: withFocusFlag,
  };
}

function createAdapterForField(
  field: ArgField,
  initialValue: JsonValue,
  registry: FieldTypeRegistry | undefined,
  context: FormContext | undefined,
): SchemaFieldAdapter {
  switch (field.kind) {
    case 'text':
    case 'path':
    case 'branch':
    case 'commit':
    case 'duration':
      return createTextAdapter(typeof initialValue === 'string' ? initialValue : '', field.placeholder);
    case 'number':
      return createTextAdapter(initialValue == null ? '' : String(initialValue), field.placeholder);
    case 'boolean':
      return createCheckboxAdapter(Boolean(initialValue), field.label ?? field.name);
    case 'enum':
      return createSelectAdapter(field, typeof initialValue === 'string' ? initialValue : '');
    case 'multiEnum':
      return createMultiEnumAdapter(field, initialValue);
    case 'date':
      return createDateAdapter(initialValue);
    case 'promptTemplate':
    case 'json':
      return createTextareaAdapter(
        typeof initialValue === 'string' ? initialValue : initialValue == null ? '' : JSON.stringify(initialValue, null, 2),
        field.placeholder,
      );
    case 'custom':
      return createCustomAdapter(field, initialValue, registry, context);
    case 'tags':
      return createTagsAdapter(initialValue);
    case 'rating':
      return createRatingAdapter(field, initialValue);
    case 'range':
      return createRangeAdapter(field, initialValue);
    case 'segmented':
      return createSegmentedAdapter(field, initialValue);
    case 'toggle':
      return createToggleAdapter(field, initialValue);
    case 'color':
      return createColorAdapter(initialValue);
    case 'radio':
      return createRadioAdapter(field, initialValue);
    case 'multi-select':
      return createMultiSelectAdapter(field, initialValue);
    case 'file':
      return createFileAdapter(initialValue);
    default:
      return createTextAdapter(typeof initialValue === 'string' ? initialValue : '');
  }
}

function getVisibleFieldOrder<V extends SchemaValueMap>(
  schema: ArgSchema,
  resolved: ResolvedOutput<V>,
  adapters: Readonly<Record<string, SchemaFieldAdapter>>,
  lockedFields: ReadonlySet<string>,
): string[] {
  return schema.fields
    .map((field) => field.name)
    .filter((fieldName) => resolved.fields[fieldName]?.visible && adapters[fieldName]?.interactive && !lockedFields.has(fieldName));
}

function determineNextActiveField<V extends SchemaValueMap>(
  schema: ArgSchema,
  resolved: ResolvedOutput<V>,
  adapters: Readonly<Record<string, SchemaFieldAdapter>>,
  lockedFields: ReadonlySet<string>,
  currentField: string | null,
): string | null {
  const visibleFields = getVisibleFieldOrder(schema, resolved, adapters, lockedFields);
  if (visibleFields.length === 0) return null;
  if (currentField && visibleFields.includes(currentField)) return currentField;
  return visibleFields[0] ?? null;
}

function syncFocusStack(visibleFields: readonly string[], preferredActiveField: string | null, existing?: FocusStackState): FocusStackState {
  const preferred = preferredActiveField && visibleFields.includes(preferredActiveField) ? preferredActiveField : (visibleFields[0] ?? undefined);

  if (!existing) {
    return createFocusStackState({
      id: SCHEMA_FORM_LAYER_ID,
      kind: 'base',
      trap: true,
      focusableIds: [...visibleFields],
      activeFocusId: preferred,
    });
  }

  let next = focusStackUpdate(
    {
      type: 'focus-sync-layer',
      layerId: SCHEMA_FORM_LAYER_ID,
      focusableIds: [...visibleFields],
    },
    existing,
  ).state;

  if (preferred) {
    next = focusStackUpdate(
      {
        type: 'focus-set',
        layerId: SCHEMA_FORM_LAYER_ID,
        elementId: preferred,
      },
      next,
    ).state;
  }

  return next;
}

function setFocusedField(
  fieldModels: Readonly<Record<string, unknown>>,
  adapters: Readonly<Record<string, SchemaFieldAdapter>>,
  activeField: string | null,
): Record<string, unknown> {
  const nextModels: Record<string, unknown> = {};
  for (const [fieldName, model] of Object.entries(fieldModels)) {
    nextModels[fieldName] = adapters[fieldName]!.setFocused(model, fieldName === activeField);
  }
  return nextModels;
}

function buildSectionOrder(schema: ArgSchema): Array<{ readonly title?: string; readonly description?: string; readonly fields: readonly string[] }> {
  const sections = schema.layout?.sections ?? [];
  const claimed = new Set(sections.flatMap((section) => section.fields));
  const unclaimed = schema.fields.map((field) => field.name).filter((name) => !claimed.has(name));
  const orderedSections = sections.map((section) => ({
    title: section.title,
    description: section.description,
    fields: section.fields,
  }));
  if (unclaimed.length > 0) {
    orderedSections.push({ title: undefined, description: undefined, fields: unclaimed });
  }
  if (orderedSections.length === 0) {
    orderedSections.push({ title: undefined, description: undefined, fields: schema.fields.map((field) => field.name) });
  }
  return orderedSections;
}

function normalizeInitialFieldModels<V extends SchemaValueMap>(
  schema: ArgSchema,
  resolved: ResolvedOutput<V>,
  adapters: Readonly<Record<string, SchemaFieldAdapter>>,
): {
  readonly fieldModels: Record<string, unknown>;
  readonly commands: ReadonlyArray<{ readonly field: string; readonly cmd: Cmd<unknown> }>;
} {
  const fieldModels: Record<string, unknown> = {};
  const commands: Array<{ readonly field: string; readonly cmd: Cmd<unknown> }> = [];
  for (const field of schema.fields) {
    const adapter = adapters[field.name]!;
    const [initialModel, initialCmd] = adapter.init();
    fieldModels[field.name] = adapter.setValue(initialModel, resolved.values[field.name] ?? null);
    commands.push({ field: field.name, cmd: initialCmd });
  }
  return { fieldModels, commands };
}

function rehydrateFieldModels<V extends SchemaValueMap>(
  schema: ArgSchema,
  adapters: Readonly<Record<string, SchemaFieldAdapter>>,
  fieldModels: Readonly<Record<string, unknown>>,
  resolved: ResolvedOutput<V>,
): Record<string, unknown> {
  const nextModels: Record<string, unknown> = { ...fieldModels };
  for (const field of schema.fields) {
    const adapter = adapters[field.name]!;
    const nextValue = resolved.values[field.name] ?? null;
    const currentValue = adapter.getValue(nextModels[field.name]);
    if (!jsonValuesEqual(currentValue, nextValue)) {
      nextModels[field.name] = adapter.setValue(nextModels[field.name], nextValue);
    }
  }
  return nextModels;
}

export function schemaForm<V extends SchemaValueMap = SchemaValueMap>(props: SchemaFormProps<V>): SchemaFormDescriptor<V> {
  const schema = parseArgSchema(props.schema);
  const lockedFields = new Set(props.locked ?? []);
  const adapters: Record<string, SchemaFieldAdapter> = {};
  const ledgerFormId = props.ledgerFormId ?? 'schema-form';
  const emit = (kind: string, payload: Record<string, unknown>): void => {
    if (!props.ledger) return;
    void emitLedgerEvent(props.ledger, {
      kind,
      payload: { formId: ledgerFormId, ...payload },
    });
  };

  function resolveValues(value: Partial<V>): ResolvedOutput<V> {
    return resolveParsedForm<V>(schema, value, {
      context: props.context,
      fieldTypeRegistry: props.fieldTypeRegistry,
      recentValueStore: props.recentValueStore,
      locked: props.locked,
    });
  }

  const initialResolved = resolveValues(props.value);
  for (const field of schema.fields) {
    adapters[field.name] = createAdapterForField(field, initialResolved.values[field.name] ?? null, props.fieldTypeRegistry, props.context);
  }

  function buildModel(values: V, fieldModels: Readonly<Record<string, unknown>>, submitted: boolean, preferredActiveField: string | null): SchemaFormModel<V> {
    const resolved = resolveValues(values);
    const rehydratedFieldModels = rehydrateFieldModels(schema, adapters, fieldModels, resolved);
    const visibleFields = getVisibleFieldOrder(schema, resolved, adapters, lockedFields);
    const focusStack = syncFocusStack(visibleFields, determineNextActiveField(schema, resolved, adapters, lockedFields, preferredActiveField));
    const activeField = getActiveFocusId(focusStack) ?? null;
    const focusedFieldModels = setFocusedField(rehydratedFieldModels, adapters, activeField);
    return {
      fieldModels: focusedFieldModels,
      values: resolved.values,
      resolved,
      validation: resolved.validation,
      activeField,
      focusStack,
      submitted,
    };
  }

  function collectValues(fieldModels: Readonly<Record<string, unknown>>): V {
    const values: Record<string, JsonValue> = {};
    for (const field of schema.fields) {
      values[field.name] = adapters[field.name]!.getValue(fieldModels[field.name]);
    }
    return values as V;
  }

  function maybeRecordRecentValues(fieldName: string, value: JsonValue): void {
    const field = schema.fields.find((candidate) => candidate.name === fieldName);
    if (!field?.recent || !props.recentValueStore) return;
    if (value === null) return;
    if (typeof value === 'string' && value.trim().length === 0) return;
    if (Array.isArray(value) && value.length === 0) return;
    props.recentValueStore.record(field.recent.storeKey, value);
  }

  function updateActiveField(model: SchemaFormModel<V>, direction: 1 | -1): SchemaFormModel<V> {
    const route = routeKeyboard('Tab', { shift: direction === -1 }, model.focusStack, {
      escapeCloses: false,
    });
    if (!route.focusStackMsg) {
      return model;
    }
    const focusStack = focusStackUpdate(route.focusStackMsg, model.focusStack).state;
    const activeField = getActiveFocusId(focusStack) ?? null;

    return {
      ...model,
      activeField,
      focusStack,
      fieldModels: setFocusedField(model.fieldModels, adapters, activeField),
    };
  }

  return {
    init(): [SchemaFormModel<V>, Cmd<SchemaFormMsg>] {
      const { fieldModels, commands } = normalizeInitialFieldModels(schema, initialResolved, adapters);
      const visibleFields = getVisibleFieldOrder(schema, initialResolved, adapters, lockedFields);
      const focusStack = syncFocusStack(visibleFields, determineNextActiveField(schema, initialResolved, adapters, lockedFields, null));
      const activeField = getActiveFocusId(focusStack) ?? null;
      const focusedFieldModels = setFocusedField(fieldModels, adapters, activeField);
      return [
        {
          fieldModels: focusedFieldModels,
          values: initialResolved.values,
          resolved: initialResolved,
          validation: initialResolved.validation,
          activeField,
          focusStack,
          submitted: false,
        },
        commands.length > 0
          ? NebulaCmd.batch(
              ...commands.map(({ field, cmd }) =>
                NebulaCmd.map(cmd, (childMsg) => ({
                  type: 'schema-form:field-msg' as const,
                  field,
                  msg: childMsg,
                })),
              ),
            )
          : NebulaCmd.none(),
      ];
    },

    update(msg: SchemaFormMsg, model: SchemaFormModel<V>): [SchemaFormModel<V>, Cmd<SchemaFormMsg>] {
      switch (msg.type) {
        case 'schema-form:field-msg': {
          const fieldName = msg.field;
          const adapter = adapters[fieldName];
          if (!adapter || lockedFields.has(fieldName) || !model.resolved.fields[fieldName]?.visible) {
            return [model, NebulaCmd.none()];
          }

          const [nextFieldModel, nextFieldCmd] = adapter.update(msg.msg, model.fieldModels[fieldName]);
          const nextFieldModels = {
            ...model.fieldModels,
            [fieldName]: nextFieldModel,
          };
          const nextValue = adapter.getValue(nextFieldModel);
          const nextValues = { ...model.values, [fieldName]: nextValue } as V;
          maybeRecordRecentValues(fieldName, nextValue ?? null);
          const nextModel = buildModel(nextValues, nextFieldModels, model.submitted, fieldName);
          props.onChange(nextModel.values);
          emit('form:field-changed', { field: fieldName, value: nextValue as unknown });
          const resolvedField = nextModel.resolved.fields[fieldName];
          if (resolvedField && resolvedField.errors.length > 0) {
            emit('form:validation-failed', { field: fieldName, errors: resolvedField.errors });
          }

          return [
            nextModel,
            NebulaCmd.map(nextFieldCmd, (childMsg) => ({
              type: 'schema-form:field-msg' as const,
              field: fieldName,
              msg: childMsg,
            })),
          ];
        }

        case 'schema-form:focus-next':
          return [updateActiveField(model, 1), NebulaCmd.none()];

        case 'schema-form:focus-prev':
          return [updateActiveField(model, -1), NebulaCmd.none()];

        case 'schema-form:set-field': {
          const adapter = adapters[msg.field];
          if (!adapter) return [model, NebulaCmd.none()];
          const nextFieldModels = {
            ...model.fieldModels,
            [msg.field]: adapter.setValue(model.fieldModels[msg.field], msg.value),
          };
          const nextValue = adapter.getValue(nextFieldModels[msg.field]);
          const nextValues = { ...model.values, [msg.field]: nextValue } as V;
          maybeRecordRecentValues(msg.field, nextValue ?? null);
          const nextModel = buildModel(nextValues, nextFieldModels, model.submitted, model.activeField);
          props.onChange(nextModel.values);
          emit('form:field-changed', { field: msg.field, value: nextValue as unknown });
          return [nextModel, NebulaCmd.none()];
        }

        case 'schema-form:submit': {
          const nextModel = { ...model, submitted: true };
          if (nextModel.validation.valid) {
            props.onSubmit?.(nextModel.values);
            emit('form:submitted', { values: nextModel.values as unknown as Record<string, unknown> });
          } else {
            emit('form:validation-failed', {
              fieldErrors: nextModel.validation.fieldErrors,
              formErrors: nextModel.validation.formErrors,
            });
          }
          return [nextModel, NebulaCmd.none()];
        }

        default:
          return [model, NebulaCmd.none()];
      }
    },

    view(model: SchemaFormModel<V>): VNode {
      const children: VNode[] = [];
      const sections = buildSectionOrder(schema);

      for (const section of sections) {
        const sectionChildren: VNode[] = [];

        if (section.title) {
          sectionChildren.push(text(section.title, style({ bold: true })));
        }
        if (section.description) {
          sectionChildren.push(text(section.description, style({ dim: true, color: formColor(props, 'muted') })));
        }

        for (const fieldName of section.fields) {
          const resolvedField = model.resolved.fields[fieldName];
          const field = schema.fields.find((candidate) => candidate.name === fieldName);
          if (!resolvedField?.visible || !field) {
            continue;
          }

          const error = (model.submitted || fieldName === model.activeField) && resolvedField.errors.length > 0 ? resolvedField.errors[0] : undefined;
          const recentValues =
            resolvedField.recentValues && resolvedField.recentValues.length > 0
              ? `Recent: ${resolvedField.recentValues.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(', ')}`
              : undefined;
          const baseChild = adapters[fieldName]!.view(model.fieldModels[fieldName], (nextValue) => {
            const adapter = adapters[fieldName]!;
            const nextFieldModels = {
              ...model.fieldModels,
              [fieldName]: adapter.setValue(model.fieldModels[fieldName], nextValue),
            };
            const nextValues = collectValues(nextFieldModels);
            maybeRecordRecentValues(fieldName, nextValues[fieldName] ?? null);
            props.onChange(resolveValues(nextValues).values);
          });
          const child =
            field.kind === 'promptTemplate' ? column(baseChild, renderTemplatePreview(String(model.values[fieldName] ?? ''), model.values, props)) : baseChild;

          sectionChildren.push(
            formField({
              label: field.label ?? field.name,
              hint: [field.helpText, recentValues].filter(Boolean).join(' · ') || undefined,
              error,
              child,
              focused: fieldName === model.activeField,
              disabled: lockedFields.has(fieldName) || !adapters[fieldName]!.interactive,
              validationState: resolvedField.errors.length > 0 ? 'invalid' : 'idle',
            }),
          );
        }

        if (sectionChildren.length > 0) {
          children.push(column(...sectionChildren));
        }
      }

      if (model.validation.formErrors.length > 0) {
        for (const error of model.validation.formErrors) {
          children.push(text(error, style({ color: feedbackColor(props, 'danger') })));
        }
      }

      children.push(text(tr(props.messages, 'schema-form.nav.hint', undefined, props.locale), style({ dim: true, color: formColor(props, 'muted') })));

      return column(...children);
    },

    subscriptions(model: SchemaFormModel<V>): Sub<SchemaFormMsg> {
      const subs: Array<Sub<SchemaFormMsg>> = [];

      if (model.focusStack.layers[0]?.focusableIds.length) {
        subs.push(NebulaSub.key('tab', { type: 'schema-form:focus-next' }));
        subs.push(NebulaSub.keyWithModifiers('tab', { shift: true }, { type: 'schema-form:focus-prev' }));
      }

      if (model.activeField) {
        const adapter = adapters[model.activeField];
        const fieldModel = model.fieldModels[model.activeField];
        if (adapter?.subscriptions) {
          subs.push(
            NebulaSub.map(adapter.subscriptions(fieldModel), (childMsg) => ({
              type: 'schema-form:field-msg' as const,
              field: model.activeField!,
              msg: childMsg,
            })),
          );
        }
      }

      return NebulaSub.batch(...subs);
    },

    getValues(model: SchemaFormModel<V>): V {
      return model.values;
    },

    getResolved(model: SchemaFormModel<V>): ResolvedOutput<V> {
      return model.resolved;
    },
  };
}

export const SchemaForm = schemaForm;
