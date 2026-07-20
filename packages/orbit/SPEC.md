# `@celestial/orbit` Spec

## Scope

Orbit's focused preview supports schema-driven and typed forms without importing unpublished Celestial packages. APIs may still evolve before 1.0.

This release covers:

- `ArgSchema` grammar and runtime validation
- `SchemaForm`
- `FieldTypeRegistry`
- `RecentValueStore`
- `resolveForm(...)`
- additive wizard composition
- structural lifecycle-event ledgers
- mouse-first curated controls with keyboard focus routing through `@celestial/nexus`

## Current Behavior

- `SchemaForm` supports text, number, boolean, enum, multi-enum, path, branch, commit, date, duration, prompt-template, JSON, custom, tags, rating, range, segmented, toggle, color, file, radio, and multi-select fields.
- Field focus order is managed through a Nexus focus stack.
- `resolveForm(...)` applies defaults, visibility rules, validation, prompt-template substitution, recent values, and contextual branch or commit checks.
- `wizard(...)` remains available for multi-step flows and composes cleanly with schema forms.
- `inputPrompt(...)`, `confirmPrompt(...)`, `selectPrompt(...)`, and `multiSelectPrompt(...)` are non-blocking component descriptors.

## Docs and Examples

- [docs/schema.md](./docs/schema.md)
- [docs/fields.md](./docs/fields.md)
- [docs/custom-fields.md](./docs/custom-fields.md)
- [docs/wizards.md](./docs/wizards.md)
- [Celestial Flight Deck workflow lab](../../examples/celestial-showcase/README.md)

## Compatibility

- The typed form engine and pure prompt-state helpers remain available beside the schema layer.
- Deprecated type aliases are retained only where the public barrel marks them explicitly.
- Schema APIs are the preferred authoring path when a form is data-driven.
