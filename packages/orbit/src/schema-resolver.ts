import { parseArgSchema } from './schema.js';
import { jsonValuesEqual } from './schema-json.js';
import type {
  ArgField,
  ArgSchema,
  CustomField,
  FieldTypeRegistry,
  JsonValue,
  ResolvedFieldState,
  ResolvedOutput,
  ResolvedValidation,
  ResolveFormOptions,
  VisibilityPredicate,
} from './schema-types.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_RE = /^(\d+\s*(ms|s|m|h|d|w)\s*)+$/i;
const TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function hasValue(value: JsonValue): boolean {
  if (value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stringifyValue(value: JsonValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function defaultValueForField(field: ArgField, registry?: FieldTypeRegistry): JsonValue {
  if (field.default !== undefined) {
    return field.default;
  }

  switch (field.kind) {
    case 'boolean':
    case 'toggle':
      return false;
    case 'multiEnum':
    case 'tags':
    case 'multi-select':
      return [];
    case 'text':
    case 'enum':
    case 'path':
    case 'branch':
    case 'commit':
    case 'date':
    case 'duration':
    case 'promptTemplate':
    case 'segmented':
    case 'radio':
    case 'file':
      return '';
    case 'color':
      return '#000000';
    case 'number':
    case 'json':
      return null;
    case 'rating':
      return 0;
    case 'range':
      return { low: field.min ?? 0, high: field.max ?? 100 } as JsonValue;
    case 'custom':
      return registry?.resolve(field.typeKey)?.defaultValue?.(field) ?? null;
    default:
      return '';
  }
}

function normalizeBooleanValue(raw: JsonValue): JsonValue {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return raw;
}

function normalizeNumberValue(raw: JsonValue): JsonValue {
  if (typeof raw === 'number' || raw === null) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}

function normalizeJsonValue(raw: JsonValue): { value: JsonValue; parseError?: string } {
  if (typeof raw !== 'string') {
    return { value: raw };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  try {
    return { value: JSON.parse(trimmed) as JsonValue };
  } catch {
    return { value: raw, parseError: 'Must be valid JSON' };
  }
}

function normalizeStringArray(raw: JsonValue): JsonValue {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string' && raw.trim().length === 0) return [];
  return [String(raw)];
}

function normalizeRangeValue(field: { min?: number; max?: number }, raw: JsonValue): JsonValue {
  const fallback = { low: field.min ?? 0, high: field.max ?? 100 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback as JsonValue;
  const record = raw as Record<string, JsonValue>;
  const low = typeof record.low === 'number' ? record.low : fallback.low;
  const high = typeof record.high === 'number' ? record.high : fallback.high;
  return { low, high } as JsonValue;
}

function normalizeFieldValue(field: ArgField, raw: JsonValue, registry?: FieldTypeRegistry): { value: JsonValue; parseError?: string } {
  if (raw === undefined) {
    return { value: defaultValueForField(field, registry) };
  }

  switch (field.kind) {
    case 'boolean':
    case 'toggle':
      return { value: normalizeBooleanValue(raw) };
    case 'number':
    case 'rating':
      return { value: normalizeNumberValue(raw) };
    case 'multiEnum':
    case 'tags':
    case 'multi-select':
      return { value: normalizeStringArray(raw) };
    case 'json':
      return normalizeJsonValue(raw);
    case 'range':
      return { value: normalizeRangeValue(field, raw) };
    default:
      return { value: raw };
  }
}

function evaluateVisibilityPredicate(predicate: VisibilityPredicate, values: Readonly<Record<string, JsonValue>>): boolean {
  if ('field' in predicate) {
    const candidate = values[predicate.field];
    const comparisons: boolean[] = [];

    if (predicate.exists !== undefined) {
      comparisons.push(predicate.exists ? candidate !== undefined && candidate !== null : candidate === undefined || candidate === null);
    }
    if (predicate.equals !== undefined) {
      comparisons.push(jsonValuesEqual(candidate ?? null, predicate.equals));
    }
    if (predicate.notEquals !== undefined) {
      comparisons.push(!jsonValuesEqual(candidate ?? null, predicate.notEquals));
    }
    if (predicate.in !== undefined) {
      comparisons.push(predicate.in.some((value) => jsonValuesEqual(candidate ?? null, value)));
    }
    if (predicate.notIn !== undefined) {
      comparisons.push(predicate.notIn.every((value) => !jsonValuesEqual(candidate ?? null, value)));
    }

    return comparisons.every(Boolean);
  }

  if ('all' in predicate) {
    return predicate.all.every((child) => evaluateVisibilityPredicate(child, values));
  }

  if ('any' in predicate) {
    return predicate.any.some((child) => evaluateVisibilityPredicate(child, values));
  }

  return !evaluateVisibilityPredicate(predicate.not, values);
}

function pushValidationError(errors: Record<string, string[]>, fieldName: string, message: string): void {
  if (!errors[fieldName]) {
    errors[fieldName] = [];
  }
  errors[fieldName]!.push(message);
}

function validateStringConstraints(field: ArgField, value: string, errors: string[]): void {
  if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
    errors.push(`Must be at least ${field.validation.minLength} characters`);
  }
  if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
    errors.push(`Must be at most ${field.validation.maxLength} characters`);
  }
  if (field.validation?.pattern) {
    try {
      const pattern = new RegExp(field.validation.pattern);
      if (!pattern.test(value)) {
        errors.push('Value does not match the required pattern');
      }
    } catch {
      errors.push('Field validation pattern is invalid');
    }
  }
}

function validateFieldValue(
  field: ArgField,
  value: JsonValue,
  registry: FieldTypeRegistry | undefined,
  context: ResolveFormOptions['context'],
  parseError?: string,
): string[] {
  const errors: string[] = [];

  if (parseError) {
    errors.push(parseError);
  }

  if (field.required && !hasValue(value)) {
    errors.push('This field is required');
    return errors;
  }

  if (!hasValue(value)) {
    return errors;
  }

  switch (field.kind) {
    case 'text':
    case 'path':
    case 'branch':
    case 'commit':
    case 'date':
    case 'duration':
    case 'promptTemplate': {
      if (typeof value !== 'string') {
        errors.push('Must be a string');
        return errors;
      }

      validateStringConstraints(field, value, errors);

      if (field.kind === 'date' && !ISO_DATE_RE.test(value)) {
        errors.push('Must be a valid ISO date (YYYY-MM-DD)');
      }

      if (field.kind === 'duration' && !DURATION_RE.test(value)) {
        errors.push('Must be a valid duration such as "30m" or "1h 15m"');
      }

      if (field.kind === 'branch' && context?.git?.branches && !context.git.branches.includes(value)) {
        errors.push('Branch is not available in the current context');
      }

      if (field.kind === 'commit' && context?.git?.commits && !context.git.commits.includes(value)) {
        errors.push('Commit is not available in the current context');
      }

      return errors;
    }

    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push('Must be a number');
        return errors;
      }

      if (field.validation?.integer && !Number.isInteger(value)) {
        errors.push('Must be a whole number');
      }
      if (field.validation?.min !== undefined && value < field.validation.min) {
        errors.push(`Must be at least ${field.validation.min}`);
      }
      if (field.validation?.max !== undefined && value > field.validation.max) {
        errors.push(`Must be at most ${field.validation.max}`);
      }
      return errors;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push('Must be a boolean');
      }
      return errors;
    }

    case 'enum': {
      if (typeof value !== 'string') {
        errors.push('Must be a string');
        return errors;
      }
      validateStringConstraints(field, value, errors);
      const allowedValues = new Set(field.options.map((option) => option.value));
      if (!allowedValues.has(value)) {
        errors.push('Must be one of the configured options');
      }
      return errors;
    }

    case 'multiEnum': {
      if (!Array.isArray(value)) {
        errors.push('Must be an array');
        return errors;
      }
      const allowedValues = new Set(field.options.map((option) => option.value));
      const normalized = value.map((item) => String(item));
      if (new Set(normalized).size !== normalized.length) {
        errors.push('Selections must be unique');
      }
      if (field.validation?.minItems !== undefined && normalized.length < field.validation.minItems) {
        errors.push(`Select at least ${field.validation.minItems} options`);
      }
      if (field.validation?.maxItems !== undefined && normalized.length > field.validation.maxItems) {
        errors.push(`Select at most ${field.validation.maxItems} options`);
      }
      for (const item of normalized) {
        if (!allowedValues.has(item)) {
          errors.push('Selections must come from the configured options');
          break;
        }
      }
      return errors;
    }

    case 'json': {
      if (field.validation?.jsonType) {
        const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value;
        if (actualType !== field.validation.jsonType) {
          errors.push(`JSON value must be a ${field.validation.jsonType}`);
        }
      }
      return errors;
    }

    case 'custom': {
      const descriptor = registry?.resolve(field.typeKey);
      if (!descriptor) {
        errors.push(`Unknown custom field type "${field.typeKey}"`);
        return errors;
      }
      if (descriptor.validate) {
        errors.push(...descriptor.validate(field as CustomField, value, context ?? {}));
      }
      return errors;
    }

    case 'toggle': {
      if (typeof value !== 'boolean') {
        errors.push('Must be a boolean');
      }
      return errors;
    }

    case 'rating': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push('Must be a number');
        return errors;
      }
      const max = field.maxValue ?? 5;
      if (value < 0) errors.push('Must be at least 0');
      if (value > max) errors.push(`Must be at most ${max}`);
      return errors;
    }

    case 'range': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push('Must be a {low, high} object');
        return errors;
      }
      const record = value as Record<string, JsonValue>;
      if (typeof record.low !== 'number' || typeof record.high !== 'number') {
        errors.push('Range must have numeric low and high values');
        return errors;
      }
      if (record.low > record.high) {
        errors.push('Range low must be less than or equal to high');
      }
      if (field.min !== undefined && record.low < field.min) {
        errors.push(`Range low must be at least ${field.min}`);
      }
      if (field.max !== undefined && record.high > field.max) {
        errors.push(`Range high must be at most ${field.max}`);
      }
      return errors;
    }

    case 'color': {
      if (typeof value !== 'string') {
        errors.push('Must be a hex color string');
        return errors;
      }
      if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value.trim())) {
        errors.push('Must be a hex color like "#ff0066"');
      }
      return errors;
    }

    case 'file':
    case 'segmented':
    case 'radio': {
      if (typeof value !== 'string') {
        errors.push('Must be a string');
        return errors;
      }
      validateStringConstraints(field, value, errors);
      if (field.kind === 'segmented' || field.kind === 'radio') {
        const allowedValues = new Set(field.options.map((option) => option.value));
        if (!allowedValues.has(value)) {
          errors.push('Must be one of the configured options');
        }
      }
      return errors;
    }

    case 'tags':
    case 'multi-select': {
      if (!Array.isArray(value)) {
        errors.push('Must be an array');
        return errors;
      }
      const normalized = value.map((item) => String(item));
      if (new Set(normalized).size !== normalized.length) {
        errors.push('Selections must be unique');
      }
      if (field.validation?.minItems !== undefined && normalized.length < field.validation.minItems) {
        errors.push(`Select at least ${field.validation.minItems} options`);
      }
      if (field.validation?.maxItems !== undefined && normalized.length > field.validation.maxItems) {
        errors.push(`Select at most ${field.validation.maxItems} options`);
      }
      if (field.kind === 'multi-select') {
        const allowedValues = new Set(field.options.map((option) => option.value));
        for (const item of normalized) {
          if (!allowedValues.has(item)) {
            errors.push('Selections must come from the configured options');
            break;
          }
        }
      }
      return errors;
    }
  }
}

function resolveTemplateValue(template: string, values: Readonly<Record<string, JsonValue>>, errors: string[]): string {
  return template.replace(TEMPLATE_RE, (_match, key: string) => {
    if (!Object.hasOwn(values, key)) {
      errors.push(`Prompt template references unknown field "${key}"`);
      return '';
    }
    return stringifyValue(values[key] ?? null);
  });
}

function buildValidation(fieldStates: Readonly<Record<string, ResolvedFieldState>>, formErrors: readonly string[]): ResolvedValidation {
  const fieldErrors: Record<string, readonly string[]> = {};

  for (const [fieldName, state] of Object.entries(fieldStates)) {
    if (state.errors.length > 0) {
      fieldErrors[fieldName] = state.errors;
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0 && formErrors.length === 0,
    fieldErrors,
    formErrors,
  };
}

export function resolveParsedForm<V extends Record<string, JsonValue> = Record<string, JsonValue>>(
  schema: ArgSchema,
  value: Partial<V>,
  options: ResolveFormOptions = {},
): ResolvedOutput<V> {
  const registry = options.fieldTypeRegistry;
  const lockedFields = new Set(options.locked ?? []);
  const values: Record<string, JsonValue> = {};
  const parseErrors = new Map<string, string>();

  for (const field of schema.fields) {
    const raw = (value as Partial<Record<string, JsonValue>>)[field.name] ?? defaultValueForField(field, registry);
    const normalized = normalizeFieldValue(field, raw, registry);
    values[field.name] = normalized.value;
    if (normalized.parseError) {
      parseErrors.set(field.name, normalized.parseError);
    }
  }

  const fieldStates: Record<string, ResolvedFieldState> = {};
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const field of schema.fields) {
    const visible = field.visibleWhen ? evaluateVisibilityPredicate(field.visibleWhen, values) : true;
    const errors = visible ? validateFieldValue(field, values[field.name]!, registry, options.context, parseErrors.get(field.name)) : [];

    if (field.kind === 'promptTemplate' && typeof values[field.name] === 'string') {
      const templateErrors: string[] = [];
      resolveTemplateValue(values[field.name] as string, values, templateErrors);
      errors.push(...templateErrors);
    }

    if (errors.length > 0) {
      fieldErrors[field.name] = errors;
    }

    fieldStates[field.name] = {
      field,
      visible,
      locked: lockedFields.has(field.name),
      value: values[field.name]!,
      errors,
      recentValues: field.recent && options.recentValueStore ? options.recentValueStore.list(field.recent.storeKey, field.recent.maxItems ?? 5) : undefined,
    };
  }

  for (const rule of schema.validation?.rules ?? []) {
    if (rule.kind === 'equal') {
      if (!jsonValuesEqual(values[rule.left] ?? null, values[rule.right] ?? null)) {
        pushValidationError(fieldErrors, rule.target ?? rule.right, rule.message ?? `${rule.right} must match ${rule.left}`);
      }
      continue;
    }

    const satisfied = rule.fields.some((fieldName) => hasValue(values[fieldName] ?? null));
    if (!satisfied) {
      formErrors.push(rule.message ?? `At least one of ${rule.fields.join(', ')} is required`);
    }
  }

  for (const [fieldName, errors] of Object.entries(fieldErrors)) {
    fieldStates[fieldName] = {
      ...fieldStates[fieldName]!,
      errors,
    };
  }

  let template: string | undefined;
  let resolvedTemplate: string | undefined;
  const promptField = schema.fields.find((field) => field.kind === 'promptTemplate');
  if (promptField && typeof values[promptField.name] === 'string') {
    template = values[promptField.name] as string;
    const templateErrors: string[] = [];
    resolvedTemplate = resolveTemplateValue(template, values, templateErrors);
    if (templateErrors.length > 0) {
      for (const message of templateErrors) {
        formErrors.push(message);
      }
    }
  }

  return {
    values: values as V,
    fields: fieldStates,
    template,
    resolvedTemplate,
    validation: buildValidation(fieldStates, formErrors),
  };
}

export function resolveForm<V extends Record<string, JsonValue> = Record<string, JsonValue>>(
  schema: ArgSchema,
  value: Partial<V>,
  options: ResolveFormOptions = {},
): ResolvedOutput<V> {
  return resolveParsedForm(parseArgSchema(schema), value, options);
}
