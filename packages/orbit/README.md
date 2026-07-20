# @celestial/orbit

Forms, validation, and wizards for the Celestial TUI ecosystem. Build validated form components, interactive CLI prompts, multi-step wizards, and schema-driven form contracts using the Elm Architecture.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Overview

Orbit now exposes three additive layers:

- A stable **v1 runtime layer** for Elm-style forms, validators, prompts, and wizards.
- A new **v2 schema core** for `ArgSchema` grammars, schema validation, custom field registries, recent-value stores, and resolved-output previews.
- An additive **SchemaForm renderer** for schema-driven editing with live prompt-template preview rendering.

## Features

- **Form Component** - Elm Architecture form with tab navigation, conditional visibility/disablement, field side effects, autosave hooks, analytics hooks, and submit handling
- **Validation** - Composable standalone validator functions
- **Schema Adapters** - JSON Schema and AJV-style resolver helpers for generating and validating forms
- **Validation Copy Overrides** - Replace built-in error text globally or per field for i18n and product voice
- **Nested Field Arrays** - Path helpers for reading and writing values like `sections[0].items[1].label`
- **Schema Core** - `ArgSchema` grammar, Zod runtime validation, custom field registries, bounded recent-value history, and `resolveForm(...)` previews
- **Text Prompts** - readline-based input and confirmation
- **Selection Prompts** - Arrow-key select and multi-select
- **Wizard** - Multi-step component with progress indicator and per-step validation

## Schema Core

The schema core is additive and ships through the root `@celestial/orbit` barrel:

- `ARG_SCHEMA_ZOD`, `validateArgSchema(...)`, `parseArgSchema(...)`
- `createFieldTypeRegistry(...)`
- `createInMemoryRecentValueStore(...)`
- `resolveForm(...)`

The `SchemaForm` UI component is available through the same root barrel and builds on the schema contract plus resolution helpers:

```typescript
import {
  createFieldTypeRegistry,
  createInMemoryRecentValueStore,
  resolveForm,
  validateArgSchema,
} from '@celestial/orbit';

const schema = {
  fields: [
    {
      kind: 'enum',
      name: 'mode',
      label: 'Mode',
      default: 'basic',
      options: [
        { label: 'Basic', value: 'basic' },
        { label: 'Advanced', value: 'advanced' },
      ],
    },
    {
      kind: 'promptTemplate',
      name: 'prompt',
      label: 'Prompt',
      default: 'Mode: {{mode}}',
    },
  ],
} as const;

const validation = validateArgSchema(schema);
if (!validation.success) {
  throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
}

const recentValues = createInMemoryRecentValueStore();
recentValues.record('mode-history', 'basic');

const registry = createFieldTypeRegistry();

const preview = resolveForm(schema, {}, {
  fieldTypeRegistry: registry,
  recentValueStore: recentValues,
});

console.log(preview.values.mode);
console.log(preview.resolvedTemplate);
```

```typescript
import { schemaForm } from '@celestial/orbit';

const form = schemaForm({
  schema,
  value: {},
  onChange: (next) => console.log(next),
});
```

See [SPEC.md](./SPEC.md), [docs/schema.md](./docs/schema.md), [docs/fields.md](./docs/fields.md), [docs/custom-fields.md](./docs/custom-fields.md), and [docs/wizards.md](./docs/wizards.md) for the current boundary and authoring guides.

Examples:

- [examples/orbit-schema-form-demo](../../examples/orbit-schema-form-demo/src/index.ts)
- [examples/orbit-config-editor](../../examples/orbit-config-editor/src/index.ts)
- [examples/orbit-multistep-wizard](../../examples/orbit-multistep-wizard/src/index.ts)

## Usage

### Form Component

```typescript
import { form, field, required, minLength, email, compose } from '@celestial/orbit';
import { app, Cmd, type Msg } from '@celestial/nebula';

type AppMsg =
  | Msg<'form-msg', { type: string; field: string; value: string }>
  | Msg<'tab-next'>
  | Msg<'tab-prev'>
  | Msg<'submit'>;

const loginForm = form({
  fields: {
    username: field({
      label: 'Username',
      validate: [required(), minLength(3)],
    }),
    password: field({
      label: 'Password',
      type: 'password',
      validate: [required()],
    }),
  },
  onSubmit: (values) => console.log('Submitted:', values),
});

interface Model {
  formState: ReturnType<typeof loginForm.init>[0];
}

app<Model, AppMsg>({
  init: () => {
    const [formState] = loginForm.init();
    return [{ formState }, Cmd.none()];
  },
  update: (msg, model) => {
    const [newFormState] = loginForm.update(msg, model.formState);
    return [{ formState: newFormState }, Cmd.none()];
  },
  view: (model) => loginForm.view(model.formState),
});
```

### Validators

```typescript
import {
  required,
  minLength,
  maxLength,
  pattern,
  min,
  max,
  email,
  custom,
  compose,
} from '@celestial/orbit';

required('Field is required');
minLength(3, 'Must be at least 3 characters');
maxLength(100);
pattern(/^[A-Z]+$/, 'Must be uppercase');
min(0);
max(150);
email('Invalid email');
custom<number>((v) => v % 2 === 0, 'Must be even');
compose(required(), minLength(5), email());
```

### Resolver Helpers

```typescript
import { fromAjv, fromJsonSchema } from '@celestial/orbit';

const resolver = fromJsonSchema(
  {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
    },
    required: ['name'],
  },
  { compile: ajv.compile.bind(ajv) },
);

const directResolver = fromAjv(ajv.compile({ type: 'object' }));
```

### Wizard

```typescript
import { wizard, type WizardMsg } from '@celestial/orbit';
import { text, column, app, Cmd, type Msg } from '@celestial/nebula';

type AppMsg = Msg<'wizard-msg', WizardMsg>;

const setupWizard = wizard({
  steps: [
    {
      title: 'Welcome',
      view: (values) => text('Welcome to setup!'),
    },
    {
      title: 'Configure',
      view: (values) => column(text(`Name: ${values.name ?? ''}`)),
      validate: (values) => {
        if (!values.name) return { valid: false, message: 'Name is required' };
        return { valid: true };
      },
    },
  ],
  onComplete: (values) => ({ type: 'done' as const, values }),
});

interface Model {
  wizardState: ReturnType<typeof setupWizard.init>[0];
}

app<Model, AppMsg>({
  init: () => {
    const [wizardState] = setupWizard.init();
    return [{ wizardState }, Cmd.none()];
  },
  update: (msg, model) => {
    const [newWizardState, cmd] = setupWizard.update(msg, model.wizardState);
    return [{ wizardState: newWizardState }, cmd];
  },
  view: (model) => setupWizard.view(model.wizardState),
});
```

### Terminal Prompts

```typescript
import { promptInput, promptConfirm, promptSelect, promptMultiSelect } from '@celestial/orbit';

const name = await promptInput({ message: 'Enter your name', defaultValue: 'World' });

const confirmed = await promptConfirm('Delete this file?', false);

const color = await promptSelect({
  message: 'Choose a color:',
  options: [
    { label: 'Red', value: 'red' },
    { label: 'Green', value: 'green' },
    { label: 'Blue', value: 'blue' },
  ],
});

const features = await promptMultiSelect({
  message: 'Select features:',
  options: ['auth', 'api', 'db'],
});
```

## API Reference

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `form` | `<Fields extends Record<string, FieldConfig>>(config: FormConfig<Fields>) => FormDescriptor<Fields, FormMsg>` | Create a form component descriptor |
| `field` | `<T = string>(config: FieldConfig<T>) => FieldConfig<T>` | Create a typed field config |
| `renderField` | `(state: FieldState, config: FieldConfig, active: boolean) => VNode` | Render a single form field |
| `required` | `(message?: string) => ValidationRule<unknown>` | Value must be non-empty |
| `minLength` | `(min: number, message?: string) => ValidationRule<string>` | String length >= min |
| `maxLength` | `(max: number, message?: string) => ValidationRule<string>` | String length <= max |
| `pattern` | `(regex: RegExp, message?: string) => ValidationRule<string>` | Must match regex |
| `min` | `(n: number, message?: string) => ValidationRule<number>` | Number >= n |
| `max` | `(n: number, message?: string) => ValidationRule<number>` | Number <= n |
| `email` | `(message?: string) => ValidationRule<string>` | Basic email format check |
| `custom` | `<T>(fn: (value: T) => boolean, message?: string) => ValidationRule<T>` | User-defined predicate |
| `compose` | `<T>(...rules: ValidationRule<T>[]) => ValidationRule<T>` | Runs all rules, returns first error |
| `promptInput` | `(config: PromptConfig) => Promise<string>` | Readline text input |
| `promptConfirm` | `(message: string, defaultValue?: boolean) => Promise<boolean>` | Readline y/n confirmation |
| `promptSelect` | `(config: SelectPromptConfig) => Promise<string>` | Arrow-key single select |
| `promptMultiSelect` | `(config: SelectPromptConfig) => Promise<string[]>` | Arrow-key + space multi-select |
| `wizard` | `<OutMsg>(config: WizardConfig<OutMsg>) => ComponentDescriptor<WizardState, WizardMsg>` | Create a multi-step wizard |

### Types

```typescript
type ValidationResult = { valid: true } | { valid: false; message: string };
type ValidationRule<T = unknown> = (value: T) => ValidationResult;

interface FieldConfig<T = string> {
  label: string;
  helpText?: string;
  defaultValue?: T;
  validate?: ValidationRule<T>[];
  type?: 'text' | 'password' | 'number';
}

interface FieldState<T = string> {
  value: T;
  errors: string[];
  touched: boolean;
  dirty: boolean;
}

interface FormConfig<Fields extends Record<string, FieldConfig>> {
  fields: Fields;
  onSubmit?: (values: FormValues<Fields>) => unknown;
  validateOnChange?: boolean;
}

type FormValues<Fields extends Record<string, FieldConfig>> = {
  [K in keyof Fields]: string;
};

interface FormState<Fields extends Record<string, FieldConfig>> {
  fields: { [K in keyof Fields]: FieldState };
  activeField: number;
  submitted: boolean;
  valid: boolean;
}

interface FormDescriptor<Fields extends Record<string, FieldConfig>, Msg> {
  init(): [FormState<Fields>, Cmd<Msg>];
  update(msg: Msg, state: FormState<Fields>): [FormState<Fields>, Cmd<Msg>];
  view(state: FormState<Fields>): VNode;
  subscriptions?(state: FormState<Fields>): Sub<Msg>;
  getValues(state: FormState<Fields>): FormValues<Fields>;
  validate(state: FormState<Fields>): FormState<Fields>;
}

type FormMsg =
  | Msg<'field-input', { field: string; value: string }>
  | Msg<'field-focus', { field: string }>
  | Msg<'tab-next'>
  | Msg<'tab-prev'>
  | Msg<'submit'>;

interface PromptConfig {
  message: string;
  defaultValue?: string;
}

interface SelectPromptConfig {
  message: string;
  options: string[] | { label: string; value: string }[];
}

interface WizardStep {
  title: string;
  view: (values: Record<string, unknown>) => VNode;
  validate?: (values: Record<string, unknown>) => ValidationResult;
}

interface WizardConfig<Msg> {
  steps: WizardStep[];
  onComplete?: (values: Record<string, unknown>) => Msg;
}

interface WizardState {
  currentStep: number;
  stepValues: Record<string, unknown>[];
  completed: boolean;
}

type WizardMsg =
  | Msg<'next-step'>
  | Msg<'prev-step'>
  | Msg<'set-value', { key: string; value: unknown }>;
```

## Related Packages

- **@celestial/nebula** - Core runtime (VNode, Cmd, Sub, Msg)
- **@celestial/ui** - Curated public UI components
- **@celestial/telescope** - Testing utilities

## License

MIT
