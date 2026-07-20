import type { Cmd, Sub, VNode } from '@celestial/nebula';
import { type FormFieldTypeDescriptor, type FormFieldTypeRegistry, getDefaultFormFieldRegistry } from './field-registry.js';
import type { BuiltInFieldType, FieldConfig } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Component name used by the built-in adapter mapping. Kept as an exported
 * convenience for tests and consumers that key on built-in widgets; the
 * underlying type set is open via the registry.
 */
export type AdapterComponentName = 'textInput' | 'numberInput' | 'checkbox' | 'select' | 'textarea' | 'slider' | 'datePicker' | 'autocomplete';

/**
 * Normalized option shape. Constellation components expect { label, value }
 * objects but FieldConfig allows bare strings.
 */
export interface NormalizedOption {
  label: string;
  value: string;
}

/**
 * A field adapter wraps a constellation ComponentDescriptor to bridge
 * its internal model/msg with the form engine's FieldState and FormMsg.
 *
 * It provides:
 * - `type`: the FieldConfig.type that produced this adapter
 * - `init()`: creates the component's initial [model, cmd]
 * - `update(msg, model)`: delegates to the component's update
 * - `view(model)`: delegates to the component's view
 * - `subscriptions?(model)`: delegates to the component's subscriptions
 * - `getValue(model)`: extracts the typed value from the component model
 * - `setValue(model, value)`: injects a value into the component model
 */
export interface FieldAdapterInstance<M = unknown, Msg = unknown, T = unknown> {
  type: string;
  init(): [M, Cmd<Msg>];
  update(msg: Msg, model: M): [M, Cmd<Msg>];
  view(model: M): VNode;
  subscriptions?(model: M): Sub<Msg>;
  getValue(model: M): T;
  setValue(model: M, value: T): M;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalize FieldConfig options to { label, value } objects. */
export function normalizeOptions(options?: readonly { label: string; value: string }[] | readonly string[]): NormalizedOption[] {
  if (!options || options.length === 0) return [];
  if (typeof options[0] === 'string') {
    return (options as readonly string[]).map((s) => ({ label: s, value: s }));
  }
  return [...(options as readonly { label: string; value: string }[])];
}

/**
 * Map a built-in `FieldConfig.type` to the constellation component name used
 * internally. Returns `'textInput'` for any non-built-in or unknown type —
 * callers that need exact widget identity for a custom kind should consult
 * the registry directly via `registry.resolve(type)`.
 */
export function getAdapterForType(type?: FieldConfig['type']): AdapterComponentName {
  switch (type as BuiltInFieldType | undefined) {
    case 'text':
    case 'password':
      return 'textInput';
    case 'number':
      return 'numberInput';
    case 'boolean':
      return 'checkbox';
    case 'select':
      return 'select';
    case 'textarea':
      return 'textarea';
    case 'slider':
      return 'slider';
    case 'date':
      return 'datePicker';
    case 'autocomplete':
      return 'autocomplete';
    case 'color':
      // Color falls back to text input until a dedicated color adapter is
      // registered (Phase 2 ships that as a built-in).
      return 'textInput';
    default:
      return 'textInput';
  }
}

/**
 * Extract the current value from a constellation component's model. Delegates
 * to the registered descriptor for the given type. Kept as a top-level export
 * for backward compatibility with the pre-registry API.
 */
export function extractValue(type: FieldConfig['type'] | undefined, model: unknown, options?: NormalizedOption[], registry?: FormFieldTypeRegistry): unknown {
  const descriptor = resolveDescriptor(type ?? 'text', registry);
  return descriptor.getValue(model, options ?? []);
}

/**
 * Inject a value into a constellation component's model. Delegates to the
 * registered descriptor for the given type. Returns a new model with the
 * value set.
 */
export function injectValue(
  type: FieldConfig['type'] | undefined,
  model: unknown,
  value: unknown,
  options?: NormalizedOption[],
  registry?: FormFieldTypeRegistry,
): unknown {
  const descriptor = resolveDescriptor(type ?? 'text', registry);
  return descriptor.setValue(model, value, options ?? []);
}

// ─── Adapter Factory ────────────────────────────────────────────────────────

function resolveDescriptor(type: string, registry?: FormFieldTypeRegistry): FormFieldTypeDescriptor {
  const effective = registry ?? getDefaultFormFieldRegistry();
  const direct = effective.resolve(type);
  if (direct) return direct;

  // Fall back to the default registry so a consumer-supplied custom registry
  // doesn't have to redeclare every built-in to use one new type.
  if (registry) {
    const fallback = getDefaultFormFieldRegistry().resolve(type);
    if (fallback) return fallback;
  }

  const text = (registry ?? getDefaultFormFieldRegistry()).resolve('text') ?? getDefaultFormFieldRegistry().resolve('text');
  // The default registry always carries a `text` descriptor; this throw is a
  // defensive guard for the case a consumer constructs an empty registry and
  // strips the default. Treat as a programmer error rather than masking it.
  if (!text) {
    throw new Error(`orbit field-registry: no descriptor for type "${type}" and no fallback "text" descriptor is registered`);
  }
  return text;
}

/**
 * Create a FieldAdapterInstance from a FieldConfig.
 *
 * The adapter wraps the component identified by `config.type`, providing
 * uniform getValue/setValue operations and the standard
 * init/update/view/subscriptions lifecycle.
 *
 * If `registry` is omitted, the process-wide default registry is consulted.
 * Custom registries fall back to defaults for unknown types so consumers can
 * extend rather than redeclare.
 */
export function createFieldAdapter<T = unknown>(config: FieldConfig<T>, registry?: FormFieldTypeRegistry): FieldAdapterInstance<unknown, unknown, T> {
  const fieldType = config.type ?? 'text';
  const opts = normalizeOptions(config.options);
  const descriptor = resolveDescriptor(fieldType, registry);
  const component = descriptor.create(config as FieldConfig<unknown>, opts);

  return {
    type: fieldType,
    init(): [unknown, Cmd<unknown>] {
      return component.init();
    },
    update(msg: unknown, model: unknown): [unknown, Cmd<unknown>] {
      return component.update(msg, model);
    },
    view(model: unknown): VNode {
      return component.view(model);
    },
    subscriptions: component.subscriptions ? (model: unknown) => component.subscriptions!(model) : undefined,
    getValue(model: unknown): T {
      return descriptor.getValue(model, opts) as T;
    },
    setValue(model: unknown, value: T): unknown {
      return descriptor.setValue(model, value, opts);
    },
  };
}
