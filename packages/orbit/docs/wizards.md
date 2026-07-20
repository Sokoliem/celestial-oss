# Wizard Composition

Orbit's `wizard(...)` helper remains available in v2 and works well with schema-driven steps.

## Pattern

1. Create one `schemaForm(...)` descriptor per step.
2. Wrap those descriptors in `wizard({ steps })`.
3. Validate each step using `getResolved(model).validation`.

```ts
const profileStep = schemaForm({ schema: profileSchema, value: {}, onChange() {} });
const reviewStep = schemaForm({ schema: reviewSchema, value: {}, onChange() {} });

const flow = wizard({
  steps: [
    {
      title: 'Profile',
      component: profileStep,
      validate(model) {
        const resolved = profileStep.getResolved(model as never);
        return resolved.validation.valid ? { valid: true } : { valid: false, message: 'Profile is incomplete' };
      },
    },
    {
      title: 'Review',
      component: reviewStep,
    },
  ],
});
```

The wizard owns step navigation while each schema form owns field state, validation, and focus within its step.
