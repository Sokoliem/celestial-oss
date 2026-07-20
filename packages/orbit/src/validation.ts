import type { AsyncValidationRule, ValidationResult, ValidationRule } from './types.js';
import { segmentGraphemes } from '@celestial/rosetta';

// ─── Helpers ────────────────────────────────────────────────────────────────

const valid: ValidationResult = { valid: true };

function invalid(message: string): ValidationResult {
  return { valid: false, message };
}

// ─── Built-in Rules ─────────────────────────────────────────────────────────

/** Value must be non-empty (not null, undefined, or whitespace-only string). */
export function required(message?: string): ValidationRule<unknown> {
  return (value: unknown): ValidationResult => {
    if (value === undefined || value === null) return invalid(message ?? 'This field is required');
    if (typeof value === 'string' && value.trim().length === 0) return invalid(message ?? 'This field is required');
    return valid;
  };
}

/** String length must be >= min. */
export function minLength(min: number, message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (segmentGraphemes(value).length < min) return invalid(message ?? `Must be at least ${min} characters`);
    return valid;
  };
}

/** String length must be <= max. */
export function maxLength(max: number, message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (segmentGraphemes(value).length > max) return invalid(message ?? `Must be at most ${max} characters`);
    return valid;
  };
}

/** Value must match the provided regex pattern. */
export function pattern(regex: RegExp, message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (!regex.test(value)) return invalid(message ?? `Must match pattern ${regex.source}`);
    return valid;
  };
}

/** Number must be >= n. */
export function min(n: number, message?: string): ValidationRule<number> {
  return (value: number): ValidationResult => {
    if (value < n) return invalid(message ?? `Must be at least ${n}`);
    return valid;
  };
}

/** Number must be <= n. */
export function max(n: number, message?: string): ValidationRule<number> {
  return (value: number): ValidationResult => {
    if (value > n) return invalid(message ?? `Must be at most ${n}`);
    return valid;
  };
}

/** Basic email format check. */
export function email(message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return invalid(message ?? 'Must be a valid email address');
    return valid;
  };
}

/** String must represent a valid URL. */
export function url(message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    try {
      new URL(value);
      return valid;
    } catch {
      return invalid(message ?? 'Must be a valid URL');
    }
  };
}

/** String must contain only digits. */
export function numeric(message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (!/^\d+$/.test(value)) return invalid(message ?? 'Must contain only numbers');
    return valid;
  };
}

/** String must contain only letters (a-z, A-Z). */
export function alpha(message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (!/^[a-zA-Z]+$/.test(value)) return invalid(message ?? 'Must contain only letters');
    return valid;
  };
}

/** String must contain only letters and digits. */
export function alphanumeric(message?: string): ValidationRule<string> {
  return (value: string): ValidationResult => {
    if (!/^[a-zA-Z0-9]+$/.test(value)) return invalid(message ?? 'Must contain only letters and numbers');
    return valid;
  };
}

/** Value must equal the expected value. Useful for "confirm password" fields. */
export function equals<T>(expected: T, message?: string): ValidationRule<T> {
  return (value: T): ValidationResult => {
    if (value !== expected) return invalid(message ?? 'Values must match');
    return valid;
  };
}

/** Value must be one of the allowed values. */
export function oneOf<T>(allowed: readonly T[], message?: string): ValidationRule<T> {
  return (value: T): ValidationResult => {
    if (!allowed.includes(value)) return invalid(message ?? `Must be one of: ${allowed.join(', ')}`);
    return valid;
  };
}

/** Number must be an integer. */
export function integer(message?: string): ValidationRule<number> {
  return (value: number): ValidationResult => {
    if (!Number.isInteger(value)) return invalid(message ?? 'Must be a whole number');
    return valid;
  };
}

/** Number must be positive (> 0). */
export function positive(message?: string): ValidationRule<number> {
  return (value: number): ValidationResult => {
    if (value <= 0) return invalid(message ?? 'Must be a positive number');
    return valid;
  };
}

/** Number must be negative (< 0). */
export function negative(message?: string): ValidationRule<number> {
  return (value: number): ValidationResult => {
    if (value >= 0) return invalid(message ?? 'Must be a negative number');
    return valid;
  };
}

/** Number must be between min and max (inclusive). */
export function between(minVal: number, maxVal: number, message?: string): ValidationRule<number> {
  return (value: number): ValidationResult => {
    if (value < minVal || value > maxVal) return invalid(message ?? `Must be between ${minVal} and ${maxVal}`);
    return valid;
  };
}

/** User-defined synchronous predicate. */
export function custom<T = unknown>(fn: (value: T) => boolean, message?: string): ValidationRule<T> {
  return (value: T): ValidationResult => {
    if (!fn(value)) return invalid(message ?? 'Invalid value');
    return valid;
  };
}

// ─── Composition ────────────────────────────────────────────────────────────

/** Runs all rules in order, returns the first error (short-circuit). */
export function compose<T = unknown>(...rules: ValidationRule<T>[]): ValidationRule<T> {
  return (value: T): ValidationResult => {
    for (const rule of rules) {
      const result = rule(value);
      if (!result.valid) return result;
    }
    return valid;
  };
}

/** Result type that can carry multiple error messages. */
export type ComposeAllResult = ValidationResult & { messages?: string[] };

/** Runs ALL rules and collects every error message. */
export function composeAll<T = unknown>(...rules: ValidationRule<T>[]): (value: T) => ComposeAllResult {
  return (value: T): ComposeAllResult => {
    const messages: string[] = [];
    for (const rule of rules) {
      const result = rule(value);
      if (!result.valid) messages.push(result.message);
    }
    if (messages.length === 0) return valid;
    return { valid: false, message: messages[0]!, messages };
  };
}

/** Runs sync rules first, then async rules in order if sync passes. */
export function composeAsync<T = unknown>(...rules: (ValidationRule<T> | AsyncValidationRule<T>)[]): AsyncValidationRule<T> {
  return async (value: T, signal?: AbortSignal): Promise<ValidationResult> => {
    const effectiveSignal = signal ?? NEVER_ABORTS;
    for (const rule of rules) {
      if (effectiveSignal.aborted) return valid;
      // Async rules take (value, signal); sync rules accept (value) only.
      // `rule.length` distinguishes the two without throwing TypeErrors.
      const result = await ((rule as AsyncValidationRule<T>).length >= 2
        ? (rule as AsyncValidationRule<T>)(value, effectiveSignal)
        : (rule as ValidationRule<T>)(value));
      if (!result.valid) return result;
    }
    return valid;
  };
}

// ─── Cross-field helpers ────────────────────────────────────────────────────

/**
 * Build a cross-field validator. Returns a function that accepts form values
 * and returns field-level errors keyed by field name.
 *
 * Example:
 * ```ts
 * crossField((values) => {
 *   const errors: Record<string, string[]> = {};
 *   if (values.password !== values.confirmPassword) {
 *     errors.confirmPassword = ['Passwords must match'];
 *   }
 *   return errors;
 * });
 * ```
 */
export function crossField<V extends Record<string, unknown>>(fn: (values: V) => Record<string, string[]>): (values: V) => Record<string, string[]> {
  return fn;
}

/**
 * Run a list of sync validation rules against a single value.
 * Returns an array of error messages (empty if all pass).
 */
export function runRules<T>(rules: ValidationRule<T>[], value: T): string[] {
  const errors: string[] = [];
  for (const rule of rules) {
    const result = rule(value);
    if (!result.valid) errors.push(result.message);
  }
  return errors;
}

/**
 * Run a list of (possibly async) validation rules against a single value.
 * Returns an array of error messages (empty if all pass).
 *
 * Passing an `AbortSignal` (Phase 6) propagates cancellation to each async
 * rule. When omitted, a never-aborting signal is used so existing call sites
 * continue to work.
 */
export async function runRulesAsync<T>(rules: (ValidationRule<T> | AsyncValidationRule<T>)[], value: T, signal?: AbortSignal): Promise<string[]> {
  const errors: string[] = [];
  const effectiveSignal = signal ?? NEVER_ABORTS;
  for (const rule of rules) {
    if (effectiveSignal.aborted) break;
    const result = await ((rule as AsyncValidationRule<T>).length >= 2
      ? (rule as AsyncValidationRule<T>)(value, effectiveSignal)
      : (rule as ValidationRule<T>)(value));
    if (!result.valid) errors.push(result.message);
  }
  return errors;
}

const NEVER_ABORTS: AbortSignal = (typeof AbortController === 'function' ? new AbortController().signal : ({ aborted: false } as AbortSignal)) as AbortSignal;
