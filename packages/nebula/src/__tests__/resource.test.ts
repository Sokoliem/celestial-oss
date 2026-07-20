import { describe, expect, it } from 'vitest';
import { error, idle, loading, mapResource, type Resource, success, unwrapOr } from '../resource.js';

// ─── Constructors ───────────────────────────────────────────────────────────

describe('Resource constructors', () => {
  it('idle() creates an idle resource', () => {
    const r = idle<number>();
    expect(r.status).toBe('idle');
  });

  it('loading() creates a loading resource', () => {
    const r = loading<number>();
    expect(r.status).toBe('loading');
  });

  it('success() creates a success resource with data', () => {
    const r = success(42);
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.data).toBe(42);
    }
  });

  it('success() preserves complex data types', () => {
    const data = { users: [{ name: 'Alice' }, { name: 'Bob' }] };
    const r = success(data);
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.data).toBe(data);
      expect(r.data.users).toHaveLength(2);
    }
  });

  it('error() creates an error resource with the given Error', () => {
    const err = new Error('network failure');
    const r = error<number>(err);
    expect(r.status).toBe('error');
    if (r.status === 'error') {
      expect(r.error).toBe(err);
      expect(r.error.message).toBe('network failure');
    }
  });
});

// ─── Type narrowing ─────────────────────────────────────────────────────────

describe('Resource discriminated union narrowing', () => {
  it('narrows to idle', () => {
    const r: Resource<string> = idle();
    if (r.status === 'idle') {
      // Should not have data or error properties
      expect(r).toEqual({ status: 'idle' });
    } else {
      throw new Error('Expected idle');
    }
  });

  it('narrows to loading', () => {
    const r: Resource<string> = loading();
    if (r.status === 'loading') {
      expect(r).toEqual({ status: 'loading' });
    } else {
      throw new Error('Expected loading');
    }
  });

  it('narrows to success with data', () => {
    const r: Resource<string> = success('hello');
    if (r.status === 'success') {
      expect(r.data).toBe('hello');
    } else {
      throw new Error('Expected success');
    }
  });

  it('narrows to error with Error', () => {
    const r: Resource<string> = error(new Error('oops'));
    if (r.status === 'error') {
      expect(r.error.message).toBe('oops');
    } else {
      throw new Error('Expected error');
    }
  });
});

// ─── mapResource ────────────────────────────────────────────────────────────

describe('mapResource', () => {
  it('transforms data in a success resource', () => {
    const r = success(10);
    const mapped = mapResource(r, (n) => n * 2);

    expect(mapped.status).toBe('success');
    if (mapped.status === 'success') {
      expect(mapped.data).toBe(20);
    }
  });

  it('transforms data type in a success resource', () => {
    const r = success(42);
    const mapped = mapResource(r, (n) => `value: ${n}`);

    expect(mapped.status).toBe('success');
    if (mapped.status === 'success') {
      expect(mapped.data).toBe('value: 42');
    }
  });

  it('passes through idle resource unchanged', () => {
    const r = idle<number>();
    const mapped = mapResource(r, (n) => n * 2);

    expect(mapped.status).toBe('idle');
  });

  it('passes through loading resource unchanged', () => {
    const r = loading<number>();
    const mapped = mapResource(r, (n) => n * 2);

    expect(mapped.status).toBe('loading');
  });

  it('passes through error resource unchanged', () => {
    const err = new Error('fail');
    const r = error<number>(err);
    const mapped = mapResource(r, (n) => n * 2);

    expect(mapped.status).toBe('error');
    if (mapped.status === 'error') {
      expect(mapped.error).toBe(err);
    }
  });
});

// ─── unwrapOr ───────────────────────────────────────────────────────────────

describe('unwrapOr', () => {
  it('returns data from a success resource', () => {
    const r = success(42);
    expect(unwrapOr(r, 0)).toBe(42);
  });

  it('returns default value for idle resource', () => {
    const r = idle<number>();
    expect(unwrapOr(r, 99)).toBe(99);
  });

  it('returns default value for loading resource', () => {
    const r = loading<number>();
    expect(unwrapOr(r, 99)).toBe(99);
  });

  it('returns default value for error resource', () => {
    const r = error<number>(new Error('fail'));
    expect(unwrapOr(r, 99)).toBe(99);
  });

  it('works with complex default values', () => {
    const defaultItems: string[] = [];
    const r = loading<string[]>();
    const result = unwrapOr(r, defaultItems);

    expect(result).toBe(defaultItems);
    expect(result).toHaveLength(0);
  });

  it('returns actual data over default when success', () => {
    const r = success(['a', 'b', 'c']);
    const result = unwrapOr(r, []);

    expect(result).toEqual(['a', 'b', 'c']);
  });
});
