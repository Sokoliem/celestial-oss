import type { ThemeInput } from '@celestial/corona';
import type { Cmd, Sub, ThemeContext, VNode } from '@celestial/nebula';
import type { LocaleLike } from '@celestial/rosetta';
import type { ComponentDescriptor } from '@celestial/ui';
import type { FormMsg } from './engine.js';
import type { FormFieldTypeRegistry } from './field-registry.js';
import type { OrbitMessages } from './i18n.js';
import type { OrbitLedger } from './ledger.js';

// ─── Validation ─────────────────────────────────────────────────────────────

/** Result of a single validation check. */
export type ValidationResult = { valid: true } | { valid: false; message: string };

/** A synchronous validation rule. Returns a ValidationResult for a given value. */
export type ValidationRule<T = unknown> = (value: T) => ValidationResult;

/**
 * A validation rule that may be async (e.g. server-side uniqueness checks).
 *
 * The second `signal` argument is an `AbortSignal` supplied by the engine's
 * Cmd runtime. Rules that fire long-running work (`fetch`, websocket
 * round-trips, etc.) should pass the signal to the underlying API so a
 * stale rule cancels cleanly when the user keeps typing. Pre-Phase-6 rules
 * that ignore the signal continue to work without changes.
 */
export type AsyncValidationRule<T = unknown> = (value: T, signal: AbortSignal) => ValidationResult | Promise<ValidationResult>;

// ─── Resolver ───────────────────────────────────────────────────────────────

/** Successful resolver parse. */
export interface ResolverSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed resolver parse. errors keyed by field path (dot-separated for nested). */
export interface ResolverFailure {
  readonly ok: false;
  readonly errors: Record<string, string[]>;
}

/** Union result from a resolver. */
export type ResolverResult<T> = ResolverSuccess<T> | ResolverFailure;

/**
 * A Resolver validates an entire form's raw values and returns either
 * a typed, parsed output or field-level errors. This decouples
 * validation from the engine — use built-in rules, Zod, Yup, etc.
 */
export type Resolver<T> = (raw: Record<string, unknown>) => ResolverResult<T>;

/**
 * Like Resolver but returns a Promise — for async validation
 * (e.g. checking username availability against a server).
 */
export type AsyncResolver<T> = (raw: Record<string, unknown>) => Promise<ResolverResult<T>>;

// ─── Field ──────────────────────────────────────────────────────────────────

/** When validation is triggered for a field. */
export type ValidateOn = 'change' | 'blur' | 'submit';

/** Loose value bag used by dynamic field predicates and hooks. */
export type FormValueBag = Record<string, unknown>;

/** Generic form command returned by field side effects. */
export type FormCommand = Cmd<FormMsg>;

/** Field array path using dot and bracket notation, e.g. `items[0].label`. */
export type FieldArrayPath = string;

/** Override for a validation message. */
export type ValidationMessageOverride = string | ((context: { readonly field: string; readonly message: string; readonly values: FormValueBag }) => string);

/** Flat validation message dictionary keyed by the original message. */
export type ValidationMessageDictionary = Record<string, string>;

/** Global and per-field validation message overrides. */
export interface ValidationMessagesConfig {
  global?: Record<string, ValidationMessageOverride> | ValidationMessageDictionary;
  fields?: Record<string, Record<string, ValidationMessageOverride> | ValidationMessageDictionary>;
}

/** Autosave storage adapter. */
export interface AutosaveStorage {
  load?(key: string): string | null | undefined | Promise<string | null | undefined>;
  save(key: string, value: string): void | Promise<void>;
  clear?(key: string): void | Promise<void>;
}

/** Metadata for a saved draft. */
export interface DraftDescriptor {
  readonly name: string;
  readonly updatedAt: number;
  readonly label?: string;
}

/** Storage adapter for named, browseable drafts (Phase 7). */
export interface DraftStorage<Fields extends FieldMap = FieldMap> {
  list(): Promise<readonly DraftDescriptor[]> | readonly DraftDescriptor[];
  load(name: string): Promise<Partial<FormValues<Fields>> | null> | Partial<FormValues<Fields>> | null;
  save(name: string, values: FormValues<Fields>, meta?: { readonly label?: string }): Promise<void> | void;
  delete(name: string): Promise<void> | void;
  rename(oldName: string, newName: string): Promise<void> | void;
}

/** Autosave behavior for a form. */
export interface AutosaveConfig<Fields extends FieldMap = FieldMap> {
  enabled?: boolean;
  key?: string;
  storage?: AutosaveStorage;
  serialize?: (values: FormValues<Fields>) => string;
  deserialize?: (raw: string) => Partial<FormValues<Fields>>;
  onSave?: (values: FormValues<Fields>) => void | Promise<void>;
  resetOnSuccess?: boolean;
  /** Optional named-draft storage. Enables list/load/save/delete/rename. */
  drafts?: DraftStorage<Fields>;
}

/** Analytics event emitted for field interactions. */
export interface FieldInteractionEvent {
  type: 'focus' | 'blur' | 'change' | 'error' | 'submit' | 'reset' | 'autosave';
  field?: string;
  value?: unknown;
  values: FormValueBag;
  errors?: string[];
}

export type FormAnalyticsEvent<Values extends Record<string, unknown> = FormValueBag> = Omit<FieldInteractionEvent, 'values'> & { values: Values };

/** Analytics configuration hooks. */
export interface FormAnalyticsConfig {
  onFieldInteraction?: (event: FormAnalyticsEvent) => void;
}

/** Lightweight AJV-compatible error object. */
export interface AjvErrorObject {
  instancePath?: string;
  message?: string;
}

export type AjvErrorLike = AjvErrorObject;

/** Lightweight AJV-compatible validate function. */
export interface AjvValidateFunction {
  (data: unknown): boolean;
  errors?: readonly AjvErrorObject[] | null;
}

/** Lightweight JSON Schema type. */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  required?: readonly string[];
  enum?: readonly unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  [key: string]: unknown;
}

/** AJV-like compiler used by fromJsonSchema. */
export interface JsonSchemaCompiler {
  compile(schema: JsonSchema): AjvValidateFunction;
}

export type AjvLike = JsonSchemaCompiler;

/**
 * Built-in field type literals. Other strings are accepted at the type level
 * via `BuiltInFieldType | (string & {})` to keep autocomplete useful while
 * still allowing consumer-registered types.
 */
export type BuiltInFieldType =
  | 'text'
  | 'password'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'date'
  | 'color'
  | 'slider'
  | 'autocomplete'
  | 'tags'
  | 'rating'
  | 'range'
  | 'segmented'
  | 'toggle'
  | 'radio'
  | 'multi-select'
  | 'file';

/** Configuration for a single form field. */
export interface FieldConfig<T = string> {
  /** Human-readable label displayed next to the field. */
  label: string;
  /** Optional help text shown below the field. */
  helpText?: string;
  /** Initial value for the field. */
  defaultValue?: T;
  /** Per-field validation rules (run in order, short-circuit on first error). */
  validate?: ValidationRule<T>[];
  /** Per-field async validation rules (run after sync rules pass). */
  asyncValidate?: AsyncValidationRule<T>[];
  /** When to trigger validation. Defaults to 'submit'. */
  validateOn?: ValidateOn;
  /** Whether this field is disabled (skipped in navigation and validation). */
  disabled?: boolean;
  /** Whether this field is currently visible. Hidden fields are skipped in validation. */
  visibleWhen?: (values: FormValueBag) => boolean;
  /** Dynamic disabled predicate evaluated against current form values. */
  disabledWhen?: (values: FormValueBag) => boolean;
  /** Side effect invoked after the field value changes. */
  onChange?: (value: T, values: FormValueBag) => FormCommand | void;
  /** Field-level validation message overrides keyed by default message. */
  validationMessages?: Record<string, ValidationMessageOverride> | ValidationMessageDictionary;
  /**
   * Field type hint used by the field adapter to pick the right widget.
   *
   * Resolved through the active `FormFieldTypeRegistry`. Built-in kinds are
   * surfaced as a literal-union hint for autocomplete, but the field type
   * string is open — any descriptor registered via
   * `createFormFieldRegistry().register(...)` is a valid value here.
   */
  type?: BuiltInFieldType | (string & {});
  /** Options for select/radio/autocomplete fields. */
  options?: readonly { label: string; value: string }[] | readonly string[];
  /** Placeholder text for text-like fields. */
  placeholder?: string;
}

/** Runtime state for a single field. */
export interface FieldState<T = unknown> {
  /** Current value. */
  value: T;
  /** Validation errors (empty when valid). */
  errors: string[];
  /** True after the field has been focused then blurred at least once. */
  touched: boolean;
  /** True when the value differs from the initial defaultValue. */
  dirty: boolean;
  /** True while async validation is in progress. */
  validating: boolean;
  /** Generation token used to ignore stale async validation results. */
  asyncToken?: number;
}

// ─── Form ───────────────────────────────────────────────────────────────────

/**
 * A typed field map. Keys are field names, values are FieldConfigs.
 * This is the primary generic constraint used throughout the engine.
 */
export type FieldMap = Record<string, FieldConfig<any>>;

/** Extract the value type from a FieldConfig. */
export type FieldValue<F> = F extends FieldConfig<infer T> ? T : unknown;

/** Extract typed values from a FieldMap. Preserves per-field types. */
export type FormValues<Fields extends FieldMap> = {
  [K in keyof Fields]: FieldValue<Fields[K]>;
};

/** Extract raw (string) values — used before resolver parsing. */
export type FormRawValues<Fields extends FieldMap> = {
  [K in keyof Fields]: unknown;
};

/** Runtime state for the entire form. */
export interface FormModel<Fields extends FieldMap> {
  /** Per-field states, keyed the same as the field config. */
  fields: Record<string, FieldState<unknown>> & { [K in keyof Fields]-?: FieldState<FieldValue<Fields[K]>> };
  /** Index of the currently focused field in field order. */
  activeField: number;
  /** Ordered field keys (stable iteration order). */
  fieldOrder: (keyof Fields & string)[];
  /** True after a submit attempt. */
  submitted: boolean;
  /** True when all field errors are empty. */
  valid: boolean;
  /** True while any async validation is running. */
  validating: boolean;
  /** Form-level errors (from resolver or cross-field validation). */
  formErrors: string[];
  /** Number of successful submissions. */
  submitCount: number;
  /**
   * Snapshot of the values the form was initialised with. Drives the
   * `dirty` flag and `getChangedValues` diff. Rebased by
   * `FormDescriptor.setInitialValues(...)`.
   */
  initialValues: Record<string, unknown>;
  /**
   * Lifecycle of the most recent submit attempt. Transitions:
   * `idle → submitting → (succeeded | failed | cancelled) → idle`.
   * Submit UX primitives (`submitButton`, `submitBar`, `formActions`) read
   * this to swap label/spinner state without driving local timers.
   */
  submitState: SubmitState;
  /** Set when `submitState` is `'failed'`. Carries the failure message. */
  submitError?: string;
}

/** Submit lifecycle states. */
export type SubmitState = 'idle' | 'submitting' | 'succeeded' | 'failed' | 'cancelled';

/** Configuration for the form engine. */
export interface FormConfig<Fields extends FieldMap, T = FormValues<Fields>> {
  /** Field definitions. */
  fields: Fields;
  /**
   * Callback invoked on successful submission with parsed values. Returning
   * a promise puts the form into `submitState: 'submitting'` until the
   * promise resolves (→ `'succeeded'`) or rejects (→ `'failed'`).
   */
  onSubmit?: (values: T) => void | Promise<void>;
  /** Callback invoked when any field value changes. */
  onChange?: (values: FormValues<Fields>) => void;
  /** Callback invoked for focus/blur/change/error analytics. */
  onFieldInteraction?: (event: FieldInteractionEvent) => void;
  /** Callback invoked on validation failure during submit. */
  onError?: (errors: Record<string, string[]>) => void;
  /** When to trigger per-field validation. Overridden by field-level validateOn. */
  validateOn?: ValidateOn;
  /** Resolver for whole-form validation + parsing. */
  resolver?: Resolver<T>;
  /** Async resolver for server-side validation. */
  asyncResolver?: AsyncResolver<T>;
  /** Cross-field validation. Runs after per-field rules, before resolver. */
  crossValidate?: (values: FormValues<Fields>) => Record<string, string[]>;
  /** Autosave behavior for value changes and reset flows. */
  autosave?: AutosaveConfig<Fields>;
  /** Analytics hooks for field interactions. */
  analytics?: FormAnalyticsConfig;
  /** Override validation copy globally or per field. */
  validationMessages?: ValidationMessagesConfig;
  /** Focus group name for focus trapping. Defaults to 'orbit-form'. */
  focusGroup?: string;
  /**
   * Field type registry consulted by `createFieldAdapter`. Defaults to the
   * built-in registry. Supply a custom registry to extend the available
   * `FieldConfig['type']` values without forking adapter wiring.
   */
  fieldTypeRegistry?: FormFieldTypeRegistry;
  /**
   * Theme override applied when rendering form chrome (validation errors,
   * keyboard cheat-sheet, etc.). Use the `theme` field for a static palette
   * override, or `themeCtx` so the form participates in the host app's
   * render-time theme switching.
   */
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
  /**
   * Optional structural event ledger. When supplied, the form emits
   * `form:field-changed`, `form:validation-failed`, `form:submitted`, and
   * `form:autosaved` events with structured payloads.
   */
  ledger?: OrbitLedger;
  /** Identifier appended to every emitted event payload. Defaults to `focusGroup`. */
  ledgerFormId?: string;
  /** Translation overrides for navigation hints + cheat-sheet text. */
  messages?: OrbitMessages;
  /** Locale hint forwarded to rosetta. */
  locale?: LocaleLike;
}

// ─── FormDescriptor ─────────────────────────────────────────────────────────

/**
 * The form engine's public interface. Implements the ComponentDescriptor
 * shape plus helper methods for reading/writing form state imperatively.
 *
 * Note: We inline the ComponentDescriptor methods rather than extending
 * it to avoid build-order dependency issues in the monorepo.
 */
export interface FormDescriptor<Fields extends FieldMap, Msg> {
  // ComponentDescriptor methods
  init(): [FormModel<Fields>, Cmd<Msg>];
  update(msg: Msg, model: FormModel<Fields>): [FormModel<Fields>, Cmd<Msg>];
  view(model: FormModel<Fields>): VNode;
  subscriptions?(model: FormModel<Fields>): Sub<Msg>;
  // Form-specific helpers
  /** Extract current values from the model. */
  getValues(model: FormModel<Fields>): FormValues<Fields>;
  /** Run all validation and return the updated model. */
  validate(model: FormModel<Fields>): FormModel<Fields>;
  /** Reset the form to its initial state. */
  reset(model: FormModel<Fields>): [FormModel<Fields>, Cmd<Msg>];
  /** Set a single field's value programmatically. */
  setValue<K extends keyof Fields & string>(model: FormModel<Fields>, field: K, value: FieldValue<Fields[K]>): FormModel<Fields>;
  /**
   * Field type registry in effect for this form. Defaults to the built-in
   * registry, or whatever was passed via `FormConfig.fieldTypeRegistry`.
   * Useful for consumers that drive their own rendering and want to share
   * adapter configuration with the form engine.
   */
  getFieldTypeRegistry(): FormFieldTypeRegistry;
  /**
   * Return the names of fields whose current value differs from the form's
   * initial values. The initial values come from `defaultValue` declarations
   * unless `setInitialValues(...)` has rebased them.
   */
  getDirtyFields(model: FormModel<Fields>): (keyof Fields & string)[];
  /**
   * Diff current values against the supplied baseline. Useful when loading
   * server-side state into a form and wanting to send only the changed
   * fields back. When omitted, the form's tracked initial values are used.
   */
  getChangedValues(model: FormModel<Fields>, baseline?: Partial<FormValues<Fields>>): Partial<FormValues<Fields>>;
  /**
   * Reset a single field back to its initial value. Clears errors and
   * touched/dirty flags for that field.
   */
  resetField<K extends keyof Fields & string>(model: FormModel<Fields>, field: K): FormModel<Fields>;
  /**
   * Rebase the form's initial values (the source of truth for `dirty` and
   * `getChangedValues`). Use after a server load or after a successful
   * "save and keep editing" flow.
   */
  setInitialValues(model: FormModel<Fields>, values: Partial<FormValues<Fields>>): FormModel<Fields>;
  /**
   * Named-draft helpers. Each method delegates to `AutosaveConfig.drafts`
   * and returns the corresponding promise. When no draft storage is
   * configured, the methods resolve as no-ops (`list → []`, `load → null`,
   * `save / delete / rename → void`).
   */
  drafts: {
    list(): Promise<readonly DraftDescriptor[]>;
    load(name: string): Promise<Partial<FormValues<Fields>> | null>;
    save(name: string, model: FormModel<Fields>, meta?: { readonly label?: string }): Promise<void>;
    delete(name: string): Promise<void>;
    rename(oldName: string, newName: string): Promise<void>;
  };
}

// ─── FieldAdapter ───────────────────────────────────────────────────────────

/**
 * A FieldAdapter wraps a constellation ComponentDescriptor to participate
 * in the form engine. It bridges the component's internal model/msg with
 * the form engine's field state and form-level messages.
 */
export interface FieldAdapter<FieldModel, FieldMsg, T = unknown> {
  /** Create the component descriptor for this field type. */
  create(config: FieldConfig<T>): ComponentDescriptor<FieldModel, FieldMsg>;
  /** Extract the current value from the component's model. */
  getValue(model: FieldModel): T;
  /** Set a new value on the component's model. */
  setValue(model: FieldModel, value: T): FieldModel;
}

// ─── FieldArray ─────────────────────────────────────────────────────────────

/** Model for a dynamic array of repeating field groups. */
export interface FieldArrayModel<ItemModel> {
  /** Array of item models, in display order. */
  items: ItemModel[];
  /** Counter for generating unique keys. */
  nextKey: number;
  /** Stable keys for each item (for reconciliation). */
  keys: number[];
}

/** Configuration for a field array. */
export interface FieldArrayConfig<ItemModel, ItemMsg> {
  /** Create a new blank item. */
  createItem(): [ItemModel, Cmd<ItemMsg>];
  /** Minimum number of items (default 0). */
  minItems?: number;
  /** Maximum number of items (default Infinity). */
  maxItems?: number;
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

/** Configuration for a text input prompt. */
export interface PromptConfig {
  message: string;
  label?: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  validate?: ValidationRule<string>[];
  locale?: LocaleLike;
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
}

/** Configuration for a confirm (yes/no) prompt. */
export interface ConfirmConfig {
  message: string;
  label?: string;
  description?: string;
  defaultValue?: boolean;
  locale?: LocaleLike;
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
}

/** Configuration for a single-select prompt. */
export interface SelectPromptConfig {
  message: string;
  label?: string;
  description?: string;
  options: readonly string[] | readonly { label: string; value: string }[];
  defaultValue?: string;
  locale?: LocaleLike;
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
}

/** Configuration for a multi-select prompt. */
export interface MultiSelectPromptConfig {
  message: string;
  label?: string;
  description?: string;
  options: readonly string[] | readonly { label: string; value: string }[];
  defaultValues?: string[];
  minSelect?: number;
  maxSelect?: number;
  locale?: LocaleLike;
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
}

// ─── Wizard ─────────────────────────────────────────────────────────────────
// Wizard types are defined in ./wizard.ts (WizardStepConfig, WizardConfig,
// WizardModel, WizardMsg, WizardDescriptor). The generic versions below
// are kept as aliases for documentation purposes but the implementation
// uses the concrete types from wizard.ts.

// ─── Backward-Compat Aliases ────────────────────────────────────────────────
// These aliases exist for the deprecated legacy form.ts. Do not use in new code.

/**
 * @deprecated Use `FormModel` instead. Alias kept for backward compatibility
 * with the legacy form.ts (exported as `legacyForm`).
 */
export type FormState<Fields extends FieldMap> = FormModel<Fields>;
