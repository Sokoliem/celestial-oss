import { describe, expect, it } from 'vitest';
import {
  alpha,
  alphanumeric,
  between,
  compose,
  composeAll,
  composeAsync,
  crossField,
  custom,
  email,
  equals,
  integer,
  max,
  maxLength,
  min,
  minLength,
  negative,
  numeric,
  oneOf,
  pattern,
  positive,
  required,
  runRules,
  runRulesAsync,
  url,
} from '../validation.js';

// ─── Original rules (backward compat) ────────────────────────────────────────

describe('required', () => {
  it('passes for non-empty string', () => {
    expect(required()('hello')).toEqual({ valid: true });
  });

  it('fails for empty string', () => {
    const result = required()('');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('This field is required');
  });

  it('fails for whitespace-only string', () => {
    expect(required()('   ').valid).toBe(false);
  });

  it('uses custom message', () => {
    const result = required('Name is required')('');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Name is required');
  });

  it('fails for null', () => {
    const result = required()(null);
    expect(result.valid).toBe(false);
  });

  it('fails for undefined', () => {
    const result = required()(undefined);
    expect(result.valid).toBe(false);
  });

  it('passes for 0 (falsy but present)', () => {
    expect(required()(0)).toEqual({ valid: true });
  });

  it('passes for false (falsy but present)', () => {
    expect(required()(false)).toEqual({ valid: true });
  });
});

describe('minLength', () => {
  it('passes when string length >= min', () => {
    expect(minLength(3)('abc')).toEqual({ valid: true });
  });

  it('fails when string length < min', () => {
    const result = minLength(3)('ab');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('at least 3');
  });

  it('counts user-perceived graphemes', () => {
    expect(minLength(1)('👩‍🚀')).toEqual({ valid: true });
    expect(minLength(2)('👩‍🚀').valid).toBe(false);
  });
});

describe('maxLength', () => {
  it('passes when string length <= max', () => {
    expect(maxLength(5)('abc')).toEqual({ valid: true });
  });

  it('fails when string length > max', () => {
    const result = maxLength(5)('abcdef');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('at most 5');
  });

  it('does not reject a combined emoji as multiple characters', () => {
    expect(maxLength(1)('👩‍🚀')).toEqual({ valid: true });
  });
});

describe('pattern', () => {
  it('passes when value matches regex', () => {
    expect(pattern(/^\d+$/)('123')).toEqual({ valid: true });
  });

  it('fails when value does not match regex', () => {
    const result = pattern(/^\d+$/)('abc');
    expect(result.valid).toBe(false);
  });
});

describe('min', () => {
  it('passes when number >= n', () => {
    expect(min(0)(0)).toEqual({ valid: true });
  });

  it('fails when number < n', () => {
    const result = min(0)(-1);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('at least 0');
  });
});

describe('max', () => {
  it('passes when number <= n', () => {
    expect(max(10)(5)).toEqual({ valid: true });
  });

  it('fails when number > n', () => {
    const result = max(10)(11);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('at most 10');
  });
});

describe('email', () => {
  it('passes for valid email', () => {
    expect(email()('a@b.com')).toEqual({ valid: true });
  });

  it('fails for invalid email', () => {
    const result = email()('not-email');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('email');
  });
});

describe('custom', () => {
  it('uses provided predicate — passes', () => {
    const isEven = custom<number>((v) => v % 2 === 0, 'Must be even');
    expect(isEven(4)).toEqual({ valid: true });
  });

  it('uses provided predicate — fails', () => {
    const isEven = custom<number>((v) => v % 2 === 0, 'Must be even');
    const result = isEven(3);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Must be even');
  });
});

describe('compose', () => {
  it('returns valid when all rules pass', () => {
    const validate = compose(required(), minLength(2));
    expect(validate('abc')).toEqual({ valid: true });
  });

  it('returns first error when a rule fails', () => {
    const validate = compose(required(), minLength(5));
    const result = validate('ab');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('at least 5');
  });

  it('stops at first failing rule', () => {
    const validate = compose(required(), minLength(5), maxLength(3));
    const result = validate('ab');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('at least 5');
  });

  it('with empty rules array returns valid', () => {
    const validate = compose();
    expect(validate('anything')).toEqual({ valid: true });
  });
});

// ─── New rules ──────────────────────────────────────────────────────────────

describe('url', () => {
  it('passes for valid URL', () => {
    expect(url()('https://example.com')).toEqual({ valid: true });
  });

  it('fails for invalid URL', () => {
    const result = url()('not a url');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('URL');
  });

  it('uses custom message', () => {
    const result = url('Enter a link')('nope');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Enter a link');
  });
});

describe('numeric', () => {
  it('passes for digit-only string', () => {
    expect(numeric()('12345')).toEqual({ valid: true });
  });

  it('fails for string with non-digits', () => {
    expect(numeric()('12a').valid).toBe(false);
  });
});

describe('alpha', () => {
  it('passes for letter-only string', () => {
    expect(alpha()('abcXYZ')).toEqual({ valid: true });
  });

  it('fails for string with digits', () => {
    expect(alpha()('abc1').valid).toBe(false);
  });
});

describe('alphanumeric', () => {
  it('passes for letters and digits', () => {
    expect(alphanumeric()('abc123')).toEqual({ valid: true });
  });

  it('fails for string with special chars', () => {
    expect(alphanumeric()('abc-123').valid).toBe(false);
  });
});

describe('equals', () => {
  it('passes when values match', () => {
    expect(equals('abc')('abc')).toEqual({ valid: true });
  });

  it('fails when values differ', () => {
    const result = equals('abc')('xyz');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('match');
  });
});

describe('oneOf', () => {
  it('passes when value is in the list', () => {
    expect(oneOf(['a', 'b', 'c'])('b')).toEqual({ valid: true });
  });

  it('fails when value is not in the list', () => {
    const result = oneOf(['a', 'b', 'c'])('d');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toContain('one of');
  });
});

describe('integer', () => {
  it('passes for whole numbers', () => {
    expect(integer()(42)).toEqual({ valid: true });
  });

  it('fails for floats', () => {
    expect(integer()(3.14).valid).toBe(false);
  });
});

describe('positive', () => {
  it('passes for positive numbers', () => {
    expect(positive()(1)).toEqual({ valid: true });
  });

  it('fails for zero', () => {
    expect(positive()(0).valid).toBe(false);
  });

  it('fails for negative numbers', () => {
    expect(positive()(-1).valid).toBe(false);
  });
});

describe('negative', () => {
  it('passes for negative numbers', () => {
    expect(negative()(-1)).toEqual({ valid: true });
  });

  it('fails for zero', () => {
    expect(negative()(0).valid).toBe(false);
  });

  it('fails for positive numbers', () => {
    expect(negative()(1).valid).toBe(false);
  });
});

describe('between', () => {
  it('passes when value is within range', () => {
    expect(between(1, 10)(5)).toEqual({ valid: true });
  });

  it('passes at boundaries', () => {
    expect(between(1, 10)(1)).toEqual({ valid: true });
    expect(between(1, 10)(10)).toEqual({ valid: true });
  });

  it('fails when below range', () => {
    expect(between(1, 10)(0).valid).toBe(false);
  });

  it('fails when above range', () => {
    expect(between(1, 10)(11).valid).toBe(false);
  });
});

// ─── Composition ────────────────────────────────────────────────────────────

describe('composeAll', () => {
  it('returns valid when all rules pass', () => {
    const validate = composeAll(required(), minLength(2));
    expect(validate('abc')).toEqual({ valid: true });
  });

  it('collects ALL error messages', () => {
    const validate = composeAll<string>(minLength(10, 'Too short'), maxLength(2, 'Too long'));
    const result = validate('hello');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.messages).toEqual(['Too short', 'Too long']);
      expect(result.message).toBe('Too short'); // first error as primary
    }
  });
});

describe('composeAsync', () => {
  it('resolves to valid when all rules pass', async () => {
    const asyncRule = async (v: string) => (v.includes('@') ? { valid: true as const } : { valid: false as const, message: 'Must have @' });
    const validate = composeAsync(required(), asyncRule);
    expect(await validate('test@example.com')).toEqual({ valid: true });
  });

  it('short-circuits at first async failure', async () => {
    let secondCalled = false;
    const fail = async (_v: string) => ({ valid: false as const, message: 'fail' });
    const second = async (_v: string) => {
      secondCalled = true;
      return { valid: true as const };
    };
    const validate = composeAsync(fail, second);
    const result = await validate('x');
    expect(result.valid).toBe(false);
    expect(secondCalled).toBe(false);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

describe('crossField', () => {
  it('returns the provided function', () => {
    const fn = crossField<{ a: string; b: string }>((values) => {
      const errors: Record<string, string[]> = {};
      if (values.a !== values.b) errors.b = ['Must match a'];
      return errors;
    });
    expect(fn({ a: 'x', b: 'y' })).toEqual({ b: ['Must match a'] });
    expect(fn({ a: 'x', b: 'x' })).toEqual({});
  });
});

describe('runRules', () => {
  it('returns empty array when all rules pass', () => {
    expect(runRules([required(), minLength(1)], 'ok')).toEqual([]);
  });

  it('collects all failing errors', () => {
    const errors = runRules<string>([minLength(10, 'Too short'), maxLength(2, 'Too long')], 'hello');
    expect(errors).toEqual(['Too short', 'Too long']);
  });
});

describe('runRulesAsync', () => {
  it('returns empty array when all rules pass', async () => {
    const asyncOk = async () => ({ valid: true as const });
    expect(await runRulesAsync([required(), asyncOk], 'ok')).toEqual([]);
  });

  it('collects all failing errors including async', async () => {
    const asyncFail = async () => ({ valid: false as const, message: 'Server says no' });
    const errors = await runRulesAsync([minLength(10, 'Too short'), asyncFail], 'hello');
    expect(errors).toEqual(['Too short', 'Server says no']);
  });
});
