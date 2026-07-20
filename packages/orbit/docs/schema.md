# Orbit Schema Core

## Field kinds

Orbit's schema core currently supports these baseline field kinds:

- `text`
- `number`
- `boolean`
- `enum`
- `multiEnum`
- `path`
- `branch`
- `commit`
- `date`
- `duration`
- `promptTemplate`
- `json`
- `custom`
- `tags`
- `rating`
- `range`
- `segmented`
- `toggle`
- `color`
- `file`
- `radio`
- `multi-select`

## Validation helpers

Use `validateArgSchema(...)` when accepting arbitrary JSON-like input:

```typescript
import { validateArgSchema } from '@celestial/orbit';

const result = validateArgSchema(schemaLikeValue);
if (!result.success) {
  for (const issue of result.issues) {
    console.error(issue.path, issue.message);
  }
}
```

Use `parseArgSchema(...)` when invalid schemas should fail fast:

```typescript
import { parseArgSchema } from '@celestial/orbit';

const schema = parseArgSchema(schemaLikeValue);
```

## Custom field types

Custom schema fields resolve through `FieldTypeRegistry` descriptors:

```typescript
import { createFieldTypeRegistry } from '@celestial/orbit';

const registry = createFieldTypeRegistry();

registry.register({
  typeKey: 'cron',
  version: '1.0.0',
  defaultValue: () => '0 * * * *',
  validate: (_field, value) =>
    typeof value === 'string' && value.split(' ').length === 5
      ? []
      : ['Cron must have five segments'],
});
```

The renderer hook `renderInput(...)` is part of the descriptor shape already and is consumed by the `SchemaForm` renderer. Custom fields can return their own interactive preview, emit updated values through the form's `onChange` contract, and coexist with prompt-template live substitution previews in the same surface.

## Resolved previews

`resolveForm(...)` produces the normalized values plus validation and prompt-template previews:

```typescript
import { resolveForm } from '@celestial/orbit';

const preview = resolveForm(schema, rawValues, {
  fieldTypeRegistry: registry,
  context: {
    git: {
      branches: ['main', 'release/1.0'],
    },
  },
});

console.log(preview.values);
console.log(preview.validation);
console.log(preview.resolvedTemplate);
```

## Recent values

The default store is in-memory, deduplicates by value, and keeps a bounded recency ring per key:

```typescript
import { createInMemoryRecentValueStore } from '@celestial/orbit';

const store = createInMemoryRecentValueStore();
store.record('branch-history', 'main');
store.record('branch-history', 'release/1.0');
store.record('branch-history', 'main');

console.log(store.list('branch-history', 2));
```
