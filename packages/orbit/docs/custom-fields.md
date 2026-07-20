# Custom Fields

Use `createFieldTypeRegistry(...)` to register domain-specific field kinds.

## Descriptor Shape

```ts
createFieldTypeRegistry([
  {
    typeKey: 'cron',
    version: '1.0.0',
    defaultValue: () => '0 * * * *',
    validate: (_field, value) => (typeof value === 'string' ? [] : ['Cron must be a string']),
    describeValue: (_field, value) => String(value),
  },
]);
```

Custom descriptors can provide:

- `defaultValue`
- `validate`
- `describeValue`
- `renderInput`

`SchemaForm` passes custom render callbacks through the normal external `onChange` contract, so hosts keep a single source of truth.
