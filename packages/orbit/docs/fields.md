# Built-in Fields

Orbit v2 ships these built-in schema field kinds:

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

## Notes

- `promptTemplate` fields resolve `{{token}}` placeholders from the current form values.
- `json` fields parse string input into JSON values during `resolveForm(...)`.
- `multiEnum` fields normalize singular values into arrays and enforce uniqueness.
- `branch` and `commit` fields can validate against contextual git data supplied by the host.
- `range` stores a two-number tuple; `rating`, `segmented`, `toggle`, `color`, `radio`, and `multi-select` map directly to curated `@celestial/ui` controls.
- `file` is a host-provided path value in the public preview; Orbit never opens a native picker or reads the selected path on its own.
