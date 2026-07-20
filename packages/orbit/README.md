# @celestial/orbit

Elm-style forms, validation, prompts, schema-driven controls, and branching wizards for Celestial terminal applications.

Orbit keeps field state and side effects explicit: every interactive surface exposes `init`, `update`, `view`, and `subscriptions`, and every effect is returned as a `Cmd`.

## Install

```bash
pnpm add @celestial/core@preview @celestial/ui@preview @celestial/orbit@preview
```

The public package depends only on the focused Celestial preview plus Zod. It does not load private packages or execute application-defined code while parsing a schema.

## Choose a layer

- `schemaForm(...)` turns a declarative `ArgSchema` into curated `@celestial/ui` controls.
- `form(...)` provides a typed field engine with validation, dirty tracking, autosave, drafts, and submit state.
- `wizard(...)` composes any Elm-style components into linear or branching steps.
- `inputPrompt(...)`, `confirmPrompt(...)`, `selectPrompt(...)`, and `multiSelectPrompt(...)` are component descriptors, not blocking readline calls.
- Resolver and validator helpers connect Zod, Yup-like, AJV-like, JSON Schema, synchronous, and asynchronous validation paths.

## Schema form

```typescript
import { schemaForm } from '@celestial/orbit';

const releaseForm = schemaForm({
  schema: {
    fields: [
      {
        kind: 'segmented',
        name: 'density',
        label: 'Layout density',
        default: 'balanced',
        options: [
          { label: 'Compact', value: 'compact' },
          { label: 'Balanced', value: 'balanced' },
        ],
      },
      {
        kind: 'toggle',
        name: 'reducedMotion',
        label: 'Reduced motion',
        default: true,
      },
      {
        kind: 'range',
        name: 'viewport',
        label: 'Target width',
        min: 70,
        max: 160,
        step: 10,
        default: [80, 120],
      },
    ],
    layout: {
      sections: [
        {
          title: 'Release preferences',
          fields: ['density', 'reducedMotion', 'viewport'],
        },
      ],
    },
  },
  value: {},
  onChange: (values) => console.log(values),
});

const [model] = releaseForm.init();
const resolved = releaseForm.getResolved(model);
console.log(resolved.validation.valid, resolved.values);
```

Built-in schema kinds are `text`, `number`, `boolean`, `enum`, `multiEnum`, `path`, `branch`, `commit`, `date`, `duration`, `promptTemplate`, `json`, `custom`, `tags`, `rating`, `range`, `segmented`, `toggle`, `color`, `file`, `radio`, and `multi-select`.

Use `validateArgSchema(...)` for untrusted JSON-like input and `parseArgSchema(...)` when invalid input should throw. `resolveForm(...)` normalizes values, evaluates visibility and validation, and renders prompt-template previews without mounting a component.

## Typed form engine

Field definitions are plain data; there is no separate `field()` builder.

```typescript
import { email, form, min, required } from '@celestial/orbit';

const accountForm = form({
  fields: {
    email: {
      label: 'Email',
      defaultValue: '',
      validate: [required(), email()],
      validateOn: 'blur',
    },
    retries: {
      label: 'Retries',
      type: 'number',
      defaultValue: 3,
      validate: [min(0)],
    },
  },
  onSubmit: async (values) => {
    await saveAccount(values);
  },
});

let [model, command] = accountForm.init();
[model, command] = accountForm.update(
  { type: 'form:field-change', field: 'email', value: 'dev@example.com' },
  model,
);

console.log(accountForm.getValues(model));
console.log(accountForm.getDirtyFields(model));
```

When embedding a descriptor in an application, store its model, delegate messages to its `update`, map its returned `Cmd`, render its `view`, and map its `subscriptions` into the parent message type.

## Wizards

Wizard steps contain components. They may validate locally and route forward or backward by step name.

```typescript
import { schemaForm, wizard } from '@celestial/orbit';

const profile = schemaForm({
  schema: { fields: [{ kind: 'text', name: 'name', label: 'Name', required: true }] },
  value: {},
  onChange: () => undefined,
});

const review = schemaForm({
  schema: { fields: [{ kind: 'toggle', name: 'confirmed', label: 'Ready', default: false }] },
  value: {},
  onChange: () => undefined,
});

const setup = wizard({
  steps: [
    {
      name: 'profile',
      title: 'Profile',
      component: profile,
      validate: (model) =>
        profile.getResolved(model as never).validation.valid
          ? { valid: true }
          : { valid: false, message: 'Complete the profile' },
    },
    { name: 'review', title: 'Review', component: review },
  ],
});
```

Navigation messages are `wizard:next`, `wizard:prev`, `wizard:goto`, `wizard:step-msg`, and `wizard:reset`. `getGraph()` exposes the static order and branch metadata for visualization and tests.

## Prompt components

```typescript
import { confirmPrompt, inputPrompt, multiSelectPrompt, selectPrompt } from '@celestial/orbit';

const name = inputPrompt({ message: 'Enter a name', defaultValue: 'World' });
const confirm = confirmPrompt({ message: 'Publish?', defaultValue: false });
const channel = selectPrompt({ message: 'Channel', options: ['preview', 'latest'] });
const checks = multiSelectPrompt({
  message: 'Checks',
  options: ['types', 'unit', 'pty'],
  minSelect: 1,
});
```

These descriptors are deterministic and testable. The host application owns process IO and decides when a completed prompt should trigger an external effect.

## Optional event ledger

Forms and wizards can emit structured lifecycle events to any structural ledger. Emission is fire-and-forget and a ledger failure never breaks interaction.

```typescript
import { form, type OrbitLedger } from '@celestial/orbit';

const events: Array<{ kind: string }> = [];
const ledger: OrbitLedger = {
  append(event) {
    events.push(event);
    return { id: `event-${events.length}` };
  },
};

const tracked = form({
  fields: { name: { label: 'Name', defaultValue: '' } },
  ledger,
  ledgerFormId: 'profile',
});
```

## Public API map

- Forms: `form`, field adapters and registries, field arrays, form actions, surfaces, autosave, and drafts.
- Validation: built-in rules, composition, async validation, cross-field validation, and resolver adapters.
- Schemas: `schemaForm`, `SchemaForm`, schema parsing, field registries, recent values, visibility, and resolution.
- Workflows: `wizard`, branching graph inspection, prompts, and pure prompt state machines.
- Presentation: theme tokens, localized messages, and Rosetta locale integration.
- Observability: `OrbitLedger`, `OrbitLedgerEvent`, and `emitLedgerEvent`.

The root barrel is the supported import surface. See [`docs/schema.md`](docs/schema.md), [`docs/fields.md`](docs/fields.md), [`docs/custom-fields.md`](docs/custom-fields.md), and [`docs/wizards.md`](docs/wizards.md) for focused guides.

## Verify

```bash
pnpm --filter @celestial/orbit typecheck
pnpm --filter @celestial/orbit test
pnpm --filter @celestial/orbit build
```

## Related packages

- `@celestial/ui` supplies the curated field controls.
- `@celestial/rosetta` supplies locale, grapheme, and bidi handling.
- `@celestial/test` supplies deterministic app and interaction harnesses.

## License

MIT
