import { describe, expect, it, vi } from 'vitest';
import * as resolverModule from '../resolver.js';
import type { FieldConfig } from '../types.js';
import { minLength, required } from '../validation.js';

const { composeResolvers, fromRules, fromYup, fromZod, resolverErr, resolverOk } = resolverModule;

// ─── resolverOk / resolverErr ───────────────────────────────────────────────

describe('resolverOk', () => {
  it('creates a success result', () => {
    const result = resolverOk({ name: 'Ada' });
    expect(result).toEqual({ ok: true, value: { name: 'Ada' } });
  });
});

describe('resolverErr', () => {
  it('creates a failure result', () => {
    const result = resolverErr({ name: ['Required'] });
    expect(result).toEqual({ ok: false, errors: { name: ['Required'] } });
  });
});

// ─── fromRules ──────────────────────────────────────────────────────────────

describe('fromRules', () => {
  const fields = {
    name: { label: 'Name', validate: [required(), minLength(2)] } as FieldConfig<string>,
    age: { label: 'Age' } as FieldConfig<number>,
  };
  const resolver = fromRules(fields);

  it('returns ok when all fields pass', () => {
    const result = resolver({ name: 'Ada', age: 30 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Ada', age: 30 });
    }
  });

  it('returns errors keyed by field name', () => {
    const result = resolver({ name: '', age: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.name!.length).toBeGreaterThan(0);
      expect(result.errors.age).toBeUndefined();
    }
  });

  it('collects errors from multiple fields', () => {
    // name will fail required, age has no rules so passes
    const result = resolver({ name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name!.length).toBeGreaterThan(0);
    }
  });

  it('handles fields with no validation rules', () => {
    const fieldsNoRules = {
      bio: { label: 'Bio' } as FieldConfig<string>,
    };
    const r = fromRules(fieldsNoRules);
    expect(r({ bio: '' }).ok).toBe(true);
  });
});

// ─── fromZod ────────────────────────────────────────────────────────────────

describe('fromZod', () => {
  // Mock Zod-like schema
  const mockZodSuccess = {
    safeParse: (data: unknown) => ({
      success: true as const,
      data: data as { name: string },
    }),
  };

  const mockZodFailure = {
    safeParse: (_data: unknown) => ({
      success: false as const,
      error: {
        issues: [
          { path: ['name'], message: 'Required' },
          { path: ['email'], message: 'Invalid email' },
          { path: ['email'], message: 'Too short' },
        ],
      },
    }),
  };

  it('returns ok on success', () => {
    const resolver = fromZod(mockZodSuccess);
    const result = resolver({ name: 'Ada' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: 'Ada' });
  });

  it('maps Zod issues to field errors', () => {
    const resolver = fromZod(mockZodFailure);
    const result = resolver({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toEqual(['Required']);
      expect(result.errors.email).toEqual(['Invalid email', 'Too short']);
    }
  });

  it('uses _root for issues with empty path', () => {
    const schema = {
      safeParse: () => ({
        success: false as const,
        error: { issues: [{ path: [], message: 'Top-level error' }] },
      }),
    };
    const resolver = fromZod(schema);
    const result = resolver({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors._root).toEqual(['Top-level error']);
    }
  });
});

// ─── fromYup ────────────────────────────────────────────────────────────────

describe('fromYup', () => {
  const mockYupSuccess = {
    validateSync: (data: unknown) => data as { name: string },
  };

  it('returns ok on success', () => {
    const resolver = fromYup(mockYupSuccess);
    const result = resolver({ name: 'Ada' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: 'Ada' });
  });

  it('maps Yup inner errors to field errors', () => {
    const mockYupFailure = {
      validateSync: () => {
        const err = new Error('Validation failed') as any;
        err.inner = [
          { path: 'name', message: 'Required' },
          { path: 'age', message: 'Must be a number' },
        ];
        throw err;
      },
    };
    const resolver = fromYup(mockYupFailure);
    const result = resolver({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toEqual(['Required']);
      expect(result.errors.age).toEqual(['Must be a number']);
    }
  });

  it('handles non-ValidationError throws', () => {
    const mockYupThrow = {
      validateSync: () => {
        throw new Error('Unexpected');
      },
    };
    const resolver = fromYup(mockYupThrow);
    const result = resolver({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors._root).toEqual(['Unexpected']);
    }
  });
});

// ─── fromAjv / fromJsonSchema ────────────────────────────────────────────────

describe('fromAjv', () => {
  it('maps AJV instance paths into orbit field paths', () => {
    const fromAjv = (resolverModule as any).fromAjv;
    const validate = Object.assign(
      vi.fn(() => false),
      {
        errors: [
          { instancePath: '/sections/0/items/1/label', message: 'must NOT be shorter than 2 characters' },
          { instancePath: '', message: 'must match schema' },
        ],
      },
    );

    const result = fromAjv(validate)({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors['sections[0].items[1].label']).toEqual(['must NOT be shorter than 2 characters']);
      expect(result.errors._root).toEqual(['must match schema']);
    }
  });
});

describe('fromJsonSchema', () => {
  it('compiles a JSON schema with an AJV-like compiler before validating', () => {
    const fromJsonSchema = (resolverModule as any).fromJsonSchema;
    const validate = Object.assign(
      vi.fn((data: unknown) => typeof (data as any).name === 'string'),
      {
        errors: undefined,
      },
    );
    const compile = vi.fn(() => validate);

    const resolver = fromJsonSchema(
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
      { compile },
    );

    const result = resolver({ name: 'Ada' });
    expect(compile).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith({ name: 'Ada' });
    expect(result).toEqual({ ok: true, value: { name: 'Ada' } });
  });
});

// ─── composeResolvers ───────────────────────────────────────────────────────

describe('composeResolvers', () => {
  it('returns ok when all resolvers pass', () => {
    const r1 = () => resolverOk({ name: 'Ada' });
    const r2 = () => resolverOk({ name: 'Ada' });
    const composed = composeResolvers(r1, r2);
    const result = composed({ name: 'Ada' });
    expect(result.ok).toBe(true);
  });

  it('merges errors from multiple resolvers', () => {
    const r1 = () => resolverErr({ name: ['Too short'] });
    const r2 = () => resolverErr({ email: ['Required'] });
    const composed = composeResolvers(r1, r2);
    const result = composed({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toEqual(['Too short']);
      expect(result.errors.email).toEqual(['Required']);
    }
  });

  it('merges errors for the same field from multiple resolvers', () => {
    const r1 = () => resolverErr({ name: ['Too short'] });
    const r2 = () => resolverErr({ name: ['Must start with A'] });
    const composed = composeResolvers(r1, r2);
    const result = composed({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toEqual(['Too short', 'Must start with A']);
    }
  });
});
