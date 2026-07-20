/**
 * Shared Validation Interface
 *
 * Composable validators for input components. Validators are pure functions
 * that return a ValidationResult. Compose multiple validators with `compose()`.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type ValidationResult = { valid: true } | { valid: false; message: string };

export type Validator = (value: string) => ValidationResult;

// ─── Built-in Validators ────────────────────────────────────────────────

/** Value must not be empty. */
export function required(message?: string): Validator {
  return (value: string) => (value.trim().length > 0 ? { valid: true } : { valid: false, message: message ?? 'This field is required' });
}

/** Value must have at least n characters. */
export function minLength(n: number, message?: string): Validator {
  const length = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return (value: string) => (value.length >= length ? { valid: true } : { valid: false, message: message ?? `Must be at least ${length} characters` });
}

/** Value must have at most n characters. */
export function maxLength(n: number, message?: string): Validator {
  const length = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : Number.MAX_SAFE_INTEGER;
  return (value: string) => (value.length <= length ? { valid: true } : { valid: false, message: message ?? `Must be at most ${length} characters` });
}

/** Value must match the given regex. */
export function pattern(regex: RegExp, message?: string): Validator {
  const stableRegex = new RegExp(regex.source, regex.flags);
  return (value: string) => {
    stableRegex.lastIndex = 0;
    return stableRegex.test(value) ? { valid: true } : { valid: false, message: message ?? 'Invalid format' };
  };
}

/** Custom validation function. */
export function custom(fn: (value: string) => boolean, message: string): Validator {
  return (value: string) => (fn(value) ? { valid: true } : { valid: false, message });
}

// ─── Composition ────────────────────────────────────────────────────────

/** Run multiple validators in order; return first failure or success. */
export function compose(...validators: Validator[]): Validator {
  return (value: string) => {
    for (const v of validators) {
      const result = v(value);
      if (!result.valid) return result;
    }
    return { valid: true };
  };
}

/** Run all validators and return all failures (not just the first). */
export function composeAll(...validators: Validator[]): (value: string) => ValidationResult[] {
  return (value: string) => {
    const results: ValidationResult[] = [];
    for (const v of validators) {
      const result = v(value);
      if (!result.valid) results.push(result);
    }
    return results.length > 0 ? results : [{ valid: true }];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Run a validator and return the error message (or undefined if valid). */
export function validate(value: string, validator: Validator): string | undefined {
  const result = validator(value);
  return result.valid ? undefined : result.message;
}

/** Check if a value passes validation. */
export function isValid(value: string, validator: Validator): boolean {
  return validator(value).valid;
}
