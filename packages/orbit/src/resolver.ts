import type {
  AjvValidateFunction,
  FieldMap,
  FormValues,
  JsonSchema,
  JsonSchemaCompiler,
  Resolver,
  ResolverFailure,
  ResolverResult,
  ResolverSuccess,
  ValidationRule,
} from './types.js';
import { runRules } from './validation.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a success result. */
export function resolverOk<T>(value: T): ResolverSuccess<T> {
  return { ok: true, value };
}

/** Create a failure result. */
export function resolverErr(errors: Record<string, string[]>): ResolverFailure {
  return { ok: false, errors };
}

// ─── Built-in Resolver: fromRules ───────────────────────────────────────────

/**
 * Build a Resolver from per-field ValidationRule arrays.
 * This is the default resolver used when FormConfig has no explicit resolver —
 * the engine constructs it automatically from field-level `validate` arrays.
 *
 * It validates each field independently, collects all errors, and returns
 * a typed FormValues<Fields> on success or a Record<string, string[]> on failure.
 */
export function fromRules<Fields extends FieldMap>(fields: Fields): Resolver<FormValues<Fields>> {
  return (raw: Record<string, unknown>): ResolverResult<FormValues<Fields>> => {
    const errors: Record<string, string[]> = {};
    const values: Record<string, unknown> = {};
    let hasErrors = false;

    for (const [key, config] of Object.entries(fields)) {
      const value = raw[key];
      values[key] = value;

      if (config.validate && config.validate.length > 0) {
        const fieldErrors = runRules(config.validate as ValidationRule<unknown>[], value);
        if (fieldErrors.length > 0) {
          errors[key] = fieldErrors;
          hasErrors = true;
        }
      }
    }

    if (hasErrors) {
      return resolverErr(errors);
    }

    return resolverOk(values as FormValues<Fields>);
  };
}

// ─── Schema Adapter Placeholders ────────────────────────────────────────────

/**
 * Wrap a Zod schema as a Resolver.
 *
 * ```ts
 * import { z } from 'zod';
 * const schema = z.object({ name: z.string().min(1), age: z.number().int() });
 * const resolver = fromZod(schema);
 * ```
 *
 * NOTE: This is a lightweight adapter — Zod is NOT a dependency.
 * It accepts any object with a `safeParse` method matching Zod's API.
 */
export function fromZod<T>(schema: {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}): Resolver<T> {
  return (raw: Record<string, unknown>): ResolverResult<T> => {
    const result = schema.safeParse(raw);
    if (result.success) {
      return resolverOk(result.data);
    }

    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_root';
      if (!errors[path]) errors[path] = [];
      errors[path].push(issue.message);
    }

    return resolverErr(errors);
  };
}

/**
 * Wrap a Yup schema as a Resolver.
 *
 * ```ts
 * import * as yup from 'yup';
 * const schema = yup.object({ name: yup.string().required(), age: yup.number().integer() });
 * const resolver = fromYup(schema);
 * ```
 *
 * NOTE: This is a lightweight adapter — Yup is NOT a dependency.
 * It accepts any object with a `validateSync` method matching Yup's API.
 */
export function fromYup<T>(schema: { validateSync(data: unknown, options?: { abortEarly?: boolean }): T }): Resolver<T> {
  return (raw: Record<string, unknown>): ResolverResult<T> => {
    try {
      const value = schema.validateSync(raw, { abortEarly: false });
      return resolverOk(value);
    } catch (err: unknown) {
      const errors: Record<string, string[]> = {};

      // Yup ValidationError has inner[] with path and message
      if (err && typeof err === 'object' && 'inner' in err && Array.isArray((err as any).inner)) {
        for (const inner of (err as any).inner) {
          const path: string = inner.path || '_root';
          if (!errors[path]) errors[path] = [];
          errors[path].push(inner.message);
        }
      } else if (err instanceof Error) {
        errors['_root'] = [err.message];
      }

      return resolverErr(errors);
    }
  };
}

function jsonPointerToPath(pointer?: string): string {
  if (!pointer) return '_root';
  const segments = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .filter(Boolean);

  if (segments.length === 0) return '_root';

  return segments
    .map((segment, index) => {
      if (/^\d+$/.test(segment)) {
        return `[${segment}]`;
      }

      return index === 0 ? segment : `.${segment}`;
    })
    .join('');
}

/**
 * Wrap an AJV-style validate function as an Orbit resolver.
 */
export function fromAjv<T>(validate: AjvValidateFunction): Resolver<T> {
  return (raw: Record<string, unknown>): ResolverResult<T> => {
    if (validate(raw)) {
      return resolverOk(raw as T);
    }

    const errors: Record<string, string[]> = {};
    for (const error of validate.errors ?? []) {
      const path = jsonPointerToPath(error.instancePath);
      if (!errors[path]) errors[path] = [];
      errors[path].push(error.message ?? 'Invalid value');
    }

    return resolverErr(errors);
  };
}

/**
 * Compile a JSON schema using an AJV-like compiler and expose it as a resolver.
 */
export function fromJsonSchema<T>(schema: JsonSchema, compiler: JsonSchemaCompiler | { compile(schema: JsonSchema): AjvValidateFunction }): Resolver<T> {
  const validate = compiler.compile(schema);
  return fromAjv<T>(validate);
}

/**
 * Combine multiple resolvers. Runs each in order, merges errors from all.
 * If all succeed, returns the value from the last resolver.
 */
export function composeResolvers<T>(...resolvers: Resolver<T>[]): Resolver<T> {
  return (raw: Record<string, unknown>): ResolverResult<T> => {
    const allErrors: Record<string, string[]> = {};
    let hasErrors = false;
    let lastValue: T | undefined;

    for (const resolver of resolvers) {
      const result = resolver(raw);
      if (result.ok) {
        lastValue = result.value;
      } else {
        hasErrors = true;
        for (const [key, msgs] of Object.entries(result.errors)) {
          if (!allErrors[key]) allErrors[key] = [];
          allErrors[key].push(...msgs);
        }
      }
    }

    if (hasErrors) {
      return resolverErr(allErrors);
    }

    return resolverOk(lastValue as T);
  };
}
