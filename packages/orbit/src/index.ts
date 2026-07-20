// ─── @celestial/orbit ───────────────────────────────────────────────────────
// Production-grade forms engine for the Celestial TUI framework.
// Implements the Elm Architecture (init → update → view → subscriptions).

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  AjvErrorObject,
  AjvValidateFunction,
  AsyncResolver,
  AsyncValidationRule,
  AutosaveConfig,
  AutosaveStorage,
  BuiltInFieldType,
  ConfirmConfig,
  DraftDescriptor,
  DraftStorage,
  // Field Adapter
  FieldAdapter,
  FieldArrayConfig,
  // Field Array
  FieldArrayModel,
  FieldArrayPath,
  FieldConfig,
  FieldInteractionEvent,
  FieldMap,
  FieldState,
  FieldValue,
  FormAnalyticsConfig,
  FormCommand,
  FormConfig,
  FormDescriptor,
  FormModel,
  FormRawValues,
  /** @deprecated Use `FormModel` instead. */
  FormState,
  // Form
  FormValueBag,
  FormValues,
  JsonSchema,
  JsonSchemaCompiler,
  MultiSelectPromptConfig,
  // Prompts
  PromptConfig,
  Resolver,
  ResolverFailure,
  ResolverResult,
  ResolverSuccess,
  SelectPromptConfig,
  SubmitState,
  // Field
  ValidateOn,
  ValidationMessageOverride,
  ValidationMessagesConfig,
  // Validation
  ValidationResult,
  ValidationRule,
} from './types.js';

// ─── Validation Rules ───────────────────────────────────────────────────────

export type { ComposeAllResult } from './validation.js';
export {
  alpha,
  alphanumeric,
  between,
  // Composers
  compose,
  composeAll,
  composeAsync,
  crossField,
  custom,
  email,
  equals,
  integer,
  max,
  maxLength,
  min,
  minLength,
  negative,
  numeric,
  oneOf,
  pattern,
  positive,
  // Built-in rules
  required,
  // Runners
  runRules,
  runRulesAsync,
  url,
} from './validation.js';

// ─── Async validation helpers ──────────────────────────────────────────────

export {
  debouncedAsync,
  serverValidate,
  uniqueValue,
} from './async-validators.js';

// ─── Optional event ledger ──────────────────────────────────────────────────

export type { OrbitLedger, OrbitLedgerAppendResult, OrbitLedgerEvent } from './ledger.js';
export { emitLedgerEvent } from './ledger.js';

// ─── Resolvers ──────────────────────────────────────────────────────────────

export {
  composeResolvers,
  fromAjv,
  fromJsonSchema,
  fromRules,
  fromYup,
  fromZod,
  resolverErr,
  resolverOk,
} from './resolver.js';

// ─── Form Engine ────────────────────────────────────────────────────────────

export type { FormMsg } from './engine.js';
export { form } from './engine.js';

// ─── Field Adapter ──────────────────────────────────────────────────────────

export type {
  AdapterComponentName,
  FieldAdapterInstance,
  NormalizedOption,
} from './field-adapter.js';
export {
  createFieldAdapter,
  extractValue,
  getAdapterForType,
  injectValue,
  normalizeOptions,
} from './field-adapter.js';

// ─── Field-level mouse-first helpers (Phase 10) ────────────────────────────

export type {
  FieldAction,
  FieldContextMenuOptions,
  FieldMenuItem,
  FieldMenuMsgFlavour,
  FieldSetFieldMsg,
} from './field-actions.js';
export {
  buildFieldContextMenu,
  runFieldAction,
} from './field-actions.js';

export type { ReorderHandle } from './field-array-view.js';
export {
  dragKeyToMoveMsg,
  dropToMoveMsg,
  swapMsg,
} from './field-array-view.js';

// ─── Submit UX primitives ──────────────────────────────────────────────────

export type {
  FormActionsConfig,
  SubmitBarConfig,
  SubmitButtonConfig,
} from './form-actions.js';
export { formActions, submitBar, submitButton } from './form-actions.js';

// ─── Surface composition ───────────────────────────────────────────────────

export type {
  SurfaceChild,
  SurfaceCloseReason,
  SurfaceConfig,
  SurfaceDescriptor,
  SurfaceHost,
  SurfaceModel,
  SurfaceMsg,
} from './form-surface.js';
export { formSurface, surface, wizardSurface } from './form-surface.js';

// ─── Visibility interop ───────────────────────────────────────────────────

export { evaluateVisibility, predicateToVisibleWhen } from './visibility.js';

// ─── i18n ──────────────────────────────────────────────────────────────────

export type { OrbitMessageKey, OrbitMessages } from './i18n.js';
export { interpolate, ORBIT_DEFAULT_MESSAGES, tr } from './i18n.js';

// ─── Theme helpers ──────────────────────────────────────────────────────────

export type { ThemedConfig } from './theme.js';
export { feedbackColor, formColor, orbitToneColor, resolveOrbitTheme } from './theme.js';

// ─── Form Field Type Registry ───────────────────────────────────────────────

export type {
  FormFieldComponent,
  FormFieldTypeDescriptor,
  FormFieldTypeRegistry,
} from './field-registry.js';
export {
  BUILT_IN_FORM_FIELD_DESCRIPTORS,
  createFormFieldRegistry,
  defaultFormFieldRegistry,
  defineFormField,
  getDefaultFormFieldRegistry,
} from './field-registry.js';

// ─── Field Array ────────────────────────────────────────────────────────────

export type { FieldArrayDescriptor, FieldArrayMsg } from './field-array.js';
export {
  appendValueAtPath,
  fieldArray,
  getFieldArrayValue,
  getValueAtPath,
  parseFieldArrayPath,
  removeValueAtPath,
  setFieldArrayValue,
  setValueAtPath,
} from './field-array.js';

// ─── Wizard ─────────────────────────────────────────────────────────────────

export type {
  WizardConfig,
  WizardDescriptor,
  WizardGraph,
  WizardModel,
  WizardMsg,
  WizardStepConfig,
  WizardStepDecision,
  WizardStepRef,
} from './wizard.js';
export { wizard } from './wizard.js';

// ─── Prompts (Elm Architecture ComponentDescriptors) ────────────────────────

export type {
  ConfirmPromptDescriptor,
  ConfirmPromptModel,
  ConfirmPromptMsg,
  InputPromptDescriptor,
  InputPromptModel,
  InputPromptMsg,
  MultiSelectPromptDescriptor,
  MultiSelectPromptModel,
  MultiSelectPromptMsg,
  SelectPromptDescriptor,
  SelectPromptModel,
  SelectPromptMsg,
} from './prompt.js';
export {
  confirmPrompt,
  inputPrompt,
  multiSelectPrompt,
  selectPrompt,
} from './prompt.js';

// ─── Schema Core ─────────────────────────────────────────────────────────────

export { parseArgSchema, validateArgSchema } from './schema.js';
export type { SchemaFormDescriptor, SchemaFormModel, SchemaFormMsg, SchemaFormProps } from './schema-form.js';
export { SchemaForm, schemaForm } from './schema-form.js';
export { createFieldTypeRegistry, createInMemoryRecentValueStore } from './schema-registry.js';
export { resolveForm } from './schema-resolver.js';
export type {
  ArgField,
  ArgFieldKind,
  ArgSchema,
  BooleanField,
  BranchField,
  ColorField,
  CommitField,
  CustomField,
  DateField,
  DurationField,
  EnumField,
  EnumOption,
  FieldTypeDescriptor,
  FieldTypeRegistry,
  FieldValidation,
  FileField,
  FormContext,
  FormLayout,
  FormLayoutSection,
  FormValidationRule,
  FormValidationSpec,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  MultiEnumField,
  MultiSelectField,
  NumberField,
  PathField,
  PromptTemplateField,
  RadioField,
  RangeField,
  RatingField,
  RecentValueConfig,
  RecentValueStore,
  ResolvedFieldState,
  ResolvedOutput,
  ResolvedValidation,
  ResolveFormOptions,
  SchemaValidationIssue,
  SchemaValidationResult,
  SegmentedField,
  TagsField,
  TextField,
  ToggleField,
  VisibilityAnyPredicate,
  VisibilityComparisonPredicate,
  VisibilityPredicate,
} from './schema-types.js';
export {
  ARG_FIELD_ZOD,
  ARG_SCHEMA_ZOD,
  JSON_VALUE_ZOD,
  VISIBILITY_PREDICATE_ZOD,
} from './schema-types.js';

// ─── Prompts (Pure State Machines — backward compat) ────────────────────────

export type {
  ConfirmState,
  InputState,
  MultiSelectState,
  SelectState,
} from './prompt-state.js';
export {
  confirmResult,
  createConfirmState,
  createInputState,
  createMultiSelectState,
  createSelectState,
  multiSelectResults,
  updateConfirmState,
  updateInputState,
  updateMultiSelectState,
  updateSelectState,
} from './prompt-state.js';
