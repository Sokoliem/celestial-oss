import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { schemaForm } from '../schema-form.js';

const FIELD_CHANGE_BUDGET_MS_PER_FIELD = 0.75;

function createFieldSchema(fieldCount: number) {
  return {
    fields: Array.from({ length: fieldCount }, (_, index) => ({
      kind: 'text' as const,
      name: `field-${index}`,
      label: `Field ${index}`,
      default: `value-${index}`,
      required: true,
    })),
  };
}

describe('schemaForm performance budgets', () => {
  it('initializes a 50-field form within first-paint budget', () => {
    const form = schemaForm({
      schema: createFieldSchema(50),
      value: {},
      onChange: () => undefined,
    });

    const start = performance.now();
    const [model] = form.init();
    const elapsed = performance.now() - start;

    expect(model.validation.valid).toBe(true);
    expect(elapsed).toBeLessThan(80);
  });

  it('propagates a field change within update budget', () => {
    const schema = createFieldSchema(50);
    const form = schemaForm({
      schema,
      value: {},
      onChange: () => undefined,
    });
    let [model] = form.init();

    const start = performance.now();
    [model] = form.update(
      {
        type: 'schema-form:set-field',
        field: 'field-25',
        value: 'updated',
      },
      model,
    );
    const elapsed = performance.now() - start;

    expect(model.values['field-25']).toBe('updated');
    expect(elapsed / schema.fields.length).toBeLessThan(FIELD_CHANGE_BUDGET_MS_PER_FIELD);
  });

  it('runs full-form validation within budget', () => {
    const form = schemaForm({
      schema: createFieldSchema(50),
      value: {},
      onChange: () => undefined,
    });
    const [model] = form.init();

    const start = performance.now();
    const [submitted] = form.update({ type: 'schema-form:submit' }, model);
    const elapsed = performance.now() - start;

    expect(submitted.validation.valid).toBe(true);
    expect(elapsed).toBeLessThan(20);
  });
});
