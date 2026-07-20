# `@celestial/orbit` Spec

## Scope

Orbit v2.0 freezes the schema-driven form surface while keeping the older form-builder and prompt APIs available as the compatibility layer.

This release covers:

- `ArgSchema` grammar and runtime validation
- `SchemaForm`
- `FieldTypeRegistry`
- `RecentValueStore`
- `resolveForm(...)`
- additive wizard composition
- full keyboard focus routing through `@celestial/nexus`

## Current Behavior

- `SchemaForm` supports the baseline field set: text, number, boolean, enum, multi-enum, path, branch, commit, date, duration, promptTemplate, json, and custom.
- Field focus order is managed through a Nexus focus stack.
- `resolveForm(...)` applies defaults, visibility rules, validation, prompt-template substitution, recent values, and contextual branch or commit checks.
- `wizard(...)` remains available for multi-step flows and composes cleanly with schema forms.

## Docs and Examples

- [docs/schema.md](./docs/schema.md)
- [docs/fields.md](./docs/fields.md)
- [docs/custom-fields.md](./docs/custom-fields.md)
- [docs/wizards.md](./docs/wizards.md)
- [examples/orbit-config-editor](../../examples/orbit-config-editor/src/index.ts)
- [examples/orbit-multistep-wizard](../../examples/orbit-multistep-wizard/src/index.ts)

## Compatibility

- The older form-builder runtime remains available in v2.x.
- Deprecated legacy aliases stay in place for migration.
- New schema APIs are additive and are the preferred authoring path for new consumers.
