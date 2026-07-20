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

## Notes

- `promptTemplate` fields resolve `{{token}}` placeholders from the current form values.
- `json` fields parse string input into JSON values during `resolveForm(...)`.
- `multiEnum` fields normalize singular values into arrays and enforce uniqueness.
- `branch` and `commit` fields can validate against contextual git data supplied by the host.
