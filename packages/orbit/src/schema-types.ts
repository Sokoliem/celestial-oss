import type { VNode } from '@celestial/nebula';
import { z } from 'zod';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonArray = readonly JsonValue[];

export interface FormContext {
  readonly workspaceRoot?: string;
  readonly homeDirectory?: string;
  readonly tempDirectory?: string;
  readonly git?: {
    readonly branches?: readonly string[];
    readonly commits?: readonly string[];
  };
  readonly [key: string]: unknown;
}

export interface RecentValueConfig {
  readonly storeKey: string;
  readonly maxItems?: number;
}

export type VisibilityPredicate = VisibilityComparisonPredicate | VisibilityAllPredicate | VisibilityAnyPredicate | VisibilityNotPredicate;

export interface VisibilityComparisonPredicate {
  readonly field: string;
  readonly equals?: JsonValue;
  readonly notEquals?: JsonValue;
  readonly in?: readonly JsonValue[];
  readonly notIn?: readonly JsonValue[];
  readonly exists?: boolean;
}

export interface VisibilityAllPredicate {
  readonly all: readonly VisibilityPredicate[];
}

export interface VisibilityAnyPredicate {
  readonly any: readonly VisibilityPredicate[];
}

export interface VisibilityNotPredicate {
  readonly not: VisibilityPredicate;
}

export interface FieldValidation {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly jsonType?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
}

export interface FormLayoutSection {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly fields: readonly string[];
}

export interface FormLayout {
  readonly strategy?: string;
  readonly columns?: 1 | 2;
  readonly sections?: readonly FormLayoutSection[];
}

export interface BaseFieldProps {
  readonly kind: ArgFieldKind;
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly default?: JsonValue;
  readonly visibleWhen?: VisibilityPredicate;
  readonly recent?: RecentValueConfig;
  readonly validation?: FieldValidation;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly meta?: JsonObject;
}

export interface TextField extends BaseFieldProps {
  readonly kind: 'text';
}

export interface NumberField extends BaseFieldProps {
  readonly kind: 'number';
}

export interface BooleanField extends BaseFieldProps {
  readonly kind: 'boolean';
}

export interface EnumOption {
  readonly label: string;
  readonly value: string;
}

export interface EnumField extends BaseFieldProps {
  readonly kind: 'enum';
  readonly options: readonly EnumOption[];
}

export interface MultiEnumField extends BaseFieldProps {
  readonly kind: 'multiEnum';
  readonly options: readonly EnumOption[];
}

export interface PathField extends BaseFieldProps {
  readonly kind: 'path';
}

export interface BranchField extends BaseFieldProps {
  readonly kind: 'branch';
}

export interface CommitField extends BaseFieldProps {
  readonly kind: 'commit';
}

export interface DateField extends BaseFieldProps {
  readonly kind: 'date';
}

export interface DurationField extends BaseFieldProps {
  readonly kind: 'duration';
}

export interface PromptTemplateField extends BaseFieldProps {
  readonly kind: 'promptTemplate';
}

export interface JsonField extends BaseFieldProps {
  readonly kind: 'json';
}

export interface CustomField extends BaseFieldProps {
  readonly kind: 'custom';
  readonly typeKey: string;
  readonly options: JsonValue;
}

// ─── Adapter-parity field kinds (mirror v1 built-ins) ──────────────────────

export interface TagsField extends BaseFieldProps {
  readonly kind: 'tags';
}

export interface RatingField extends BaseFieldProps {
  readonly kind: 'rating';
  readonly maxValue?: number;
}

export interface RangeField extends BaseFieldProps {
  readonly kind: 'range';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface SegmentedField extends BaseFieldProps {
  readonly kind: 'segmented';
  readonly options: readonly EnumOption[];
}

export interface ToggleField extends BaseFieldProps {
  readonly kind: 'toggle';
}

export interface ColorField extends BaseFieldProps {
  readonly kind: 'color';
}

export interface FileField extends BaseFieldProps {
  readonly kind: 'file';
}

export interface RadioField extends BaseFieldProps {
  readonly kind: 'radio';
  readonly options: readonly EnumOption[];
}

export interface MultiSelectField extends BaseFieldProps {
  readonly kind: 'multi-select';
  readonly options: readonly EnumOption[];
}

export type ArgFieldKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'multiEnum'
  | 'path'
  | 'branch'
  | 'commit'
  | 'date'
  | 'duration'
  | 'promptTemplate'
  | 'json'
  | 'custom'
  | 'tags'
  | 'rating'
  | 'range'
  | 'segmented'
  | 'toggle'
  | 'color'
  | 'file'
  | 'radio'
  | 'multi-select';

export type ArgField =
  | TextField
  | NumberField
  | BooleanField
  | EnumField
  | MultiEnumField
  | PathField
  | BranchField
  | CommitField
  | DateField
  | DurationField
  | PromptTemplateField
  | JsonField
  | CustomField
  | TagsField
  | RatingField
  | RangeField
  | SegmentedField
  | ToggleField
  | ColorField
  | FileField
  | RadioField
  | MultiSelectField;

export type FormValidationRule =
  | {
      readonly kind: 'equal';
      readonly left: string;
      readonly right: string;
      readonly target?: string;
      readonly message?: string;
    }
  | {
      readonly kind: 'atLeastOne';
      readonly fields: readonly string[];
      readonly message?: string;
    };

export interface FormValidationSpec {
  readonly rules?: readonly FormValidationRule[];
}

export interface ArgSchema {
  readonly fields: readonly ArgField[];
  readonly layout?: FormLayout;
  readonly validation?: FormValidationSpec;
}

export interface FieldTypeDescriptor {
  readonly typeKey: string;
  readonly version: string;
  readonly renderInput?: (field: CustomField, value: JsonValue, onChange: (next: JsonValue) => void, context: FormContext) => VNode;
  readonly validate?: (field: CustomField, value: JsonValue, context: FormContext) => readonly string[];
  readonly defaultValue?: (field: CustomField) => JsonValue;
  readonly describeValue?: (field: CustomField, value: JsonValue) => string;
}

export interface FieldTypeRegistry {
  register(descriptor: FieldTypeDescriptor): () => void;
  resolve(typeKey: string): FieldTypeDescriptor | null;
  list(): readonly FieldTypeDescriptor[];
}

export interface RecentValueStore {
  record(storeKey: string, value: JsonValue): void;
  list(storeKey: string, max: number): readonly JsonValue[];
  clear(storeKey: string): void;
}

export interface SchemaValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type SchemaValidationResult =
  | { readonly success: true; readonly data: ArgSchema }
  | { readonly success: false; readonly issues: readonly SchemaValidationIssue[] };

export interface ResolvedFieldState {
  readonly field: ArgField;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly value: JsonValue;
  readonly errors: readonly string[];
  readonly recentValues?: readonly JsonValue[];
}

export interface ResolvedValidation {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
  readonly formErrors: readonly string[];
}

export interface ResolvedOutput<V extends Record<string, JsonValue> = Record<string, JsonValue>> {
  readonly values: V;
  readonly fields: Readonly<Record<string, ResolvedFieldState>>;
  readonly template?: string;
  readonly resolvedTemplate?: string;
  readonly validation: ResolvedValidation;
}

export interface ResolveFormOptions {
  readonly context?: FormContext;
  readonly fieldTypeRegistry?: FieldTypeRegistry;
  readonly recentValueStore?: RecentValueStore;
  readonly locked?: readonly string[];
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const JSON_VALUE_ZOD = jsonValueSchema;

const visibilityComparisonZod: z.ZodType<VisibilityComparisonPredicate> = z
  .object({
    field: z.string().min(1),
    equals: jsonValueSchema.optional(),
    notEquals: jsonValueSchema.optional(),
    in: z.array(jsonValueSchema).min(1).optional(),
    notIn: z.array(jsonValueSchema).min(1).optional(),
    exists: z.boolean().optional(),
  })
  .refine(
    (predicate) =>
      predicate.equals !== undefined ||
      predicate.notEquals !== undefined ||
      predicate.in !== undefined ||
      predicate.notIn !== undefined ||
      predicate.exists !== undefined,
    {
      message: 'Visibility predicates must declare at least one comparison',
    },
  );

const visibilityPredicateSchema: z.ZodType<VisibilityPredicate> = z.lazy(() =>
  z.union([
    visibilityComparisonZod,
    z.object({ all: z.array(visibilityPredicateSchema).min(1) }),
    z.object({ any: z.array(visibilityPredicateSchema).min(1) }),
    z.object({ not: visibilityPredicateSchema }),
  ]),
);

export const VISIBILITY_PREDICATE_ZOD = visibilityPredicateSchema;

const recentValueConfigZod = z.object({
  storeKey: z.string().min(1),
  maxItems: z.number().int().positive().optional(),
});

const fieldValidationZod = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  minItems: z.number().int().nonnegative().optional(),
  maxItems: z.number().int().nonnegative().optional(),
  jsonType: z.enum(['object', 'array', 'string', 'number', 'boolean', 'null']).optional(),
});

const formLayoutSectionZod = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  fields: z.array(z.string().min(1)).min(1),
});

const formLayoutZod = z.object({
  strategy: z.string().min(1).optional(),
  columns: z.union([z.literal(1), z.literal(2)]).optional(),
  sections: z.array(formLayoutSectionZod).min(1).optional(),
});

const enumOptionZod = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const baseFieldZod = z.object({
  name: z.string().min(1),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  required: z.boolean().optional(),
  default: jsonValueSchema.optional(),
  visibleWhen: visibilityPredicateSchema.optional(),
  recent: recentValueConfigZod.optional(),
  validation: fieldValidationZod.optional(),
  helpText: z.string().min(1).optional(),
  placeholder: z.string().min(1).optional(),
  meta: z.record(z.string(), jsonValueSchema).optional(),
});

const optionsFieldZod = z.object({
  options: z.array(enumOptionZod).min(1),
});

const textFieldZod = baseFieldZod.extend({
  kind: z.literal('text'),
});

const numberFieldZod = baseFieldZod.extend({
  kind: z.literal('number'),
});

const booleanFieldZod = baseFieldZod.extend({
  kind: z.literal('boolean'),
});

const enumFieldZod = baseFieldZod
  .extend({
    kind: z.literal('enum'),
  })
  .merge(optionsFieldZod);

const multiEnumFieldZod = baseFieldZod
  .extend({
    kind: z.literal('multiEnum'),
  })
  .merge(optionsFieldZod);

const pathFieldZod = baseFieldZod.extend({
  kind: z.literal('path'),
});

const branchFieldZod = baseFieldZod.extend({
  kind: z.literal('branch'),
});

const commitFieldZod = baseFieldZod.extend({
  kind: z.literal('commit'),
});

const dateFieldZod = baseFieldZod.extend({
  kind: z.literal('date'),
});

const durationFieldZod = baseFieldZod.extend({
  kind: z.literal('duration'),
});

const promptTemplateFieldZod = baseFieldZod.extend({
  kind: z.literal('promptTemplate'),
});

const jsonFieldZod = baseFieldZod.extend({
  kind: z.literal('json'),
});

const customFieldZod = baseFieldZod.extend({
  kind: z.literal('custom'),
  typeKey: z.string().min(1),
  options: jsonValueSchema,
});

const tagsFieldZod = baseFieldZod.extend({
  kind: z.literal('tags'),
});

const ratingFieldZod = baseFieldZod.extend({
  kind: z.literal('rating'),
  maxValue: z.number().int().positive().optional(),
});

const rangeFieldZod = baseFieldZod.extend({
  kind: z.literal('range'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
});

const segmentedFieldZod = baseFieldZod
  .extend({
    kind: z.literal('segmented'),
  })
  .merge(optionsFieldZod);

const toggleFieldZod = baseFieldZod.extend({
  kind: z.literal('toggle'),
});

const colorFieldZod = baseFieldZod.extend({
  kind: z.literal('color'),
});

const fileFieldZod = baseFieldZod.extend({
  kind: z.literal('file'),
});

const radioFieldZod = baseFieldZod
  .extend({
    kind: z.literal('radio'),
  })
  .merge(optionsFieldZod);

const multiSelectFieldZod = baseFieldZod
  .extend({
    kind: z.literal('multi-select'),
  })
  .merge(optionsFieldZod);

export const ARG_FIELD_ZOD: z.ZodType<ArgField> = z.discriminatedUnion('kind', [
  textFieldZod,
  numberFieldZod,
  booleanFieldZod,
  enumFieldZod,
  multiEnumFieldZod,
  pathFieldZod,
  branchFieldZod,
  commitFieldZod,
  dateFieldZod,
  durationFieldZod,
  promptTemplateFieldZod,
  jsonFieldZod,
  customFieldZod,
  tagsFieldZod,
  ratingFieldZod,
  rangeFieldZod,
  segmentedFieldZod,
  toggleFieldZod,
  colorFieldZod,
  fileFieldZod,
  radioFieldZod,
  multiSelectFieldZod,
]);

const formValidationRuleZod: z.ZodType<FormValidationRule> = z.union([
  z.object({
    kind: z.literal('equal'),
    left: z.string().min(1),
    right: z.string().min(1),
    target: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('atLeastOne'),
    fields: z.array(z.string().min(1)).min(1),
    message: z.string().min(1).optional(),
  }),
]);

export const ARG_SCHEMA_ZOD: z.ZodType<ArgSchema> = z.object({
  fields: z.array(ARG_FIELD_ZOD).min(1),
  layout: formLayoutZod.optional(),
  validation: z
    .object({
      rules: z.array(formValidationRuleZod).min(1).optional(),
    })
    .optional(),
});
