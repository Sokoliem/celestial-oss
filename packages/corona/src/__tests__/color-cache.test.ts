import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { color, resetColorLevelCache } from '../color.js';

describe('color.level caching', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env['FORCE_COLOR'];
    delete process.env['NO_COLOR'];
    delete process.env['COLORTERM'];
  });

  afterEach(() => {
    resetColorLevelCache();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('should cache the result of detectColorLevel across multiple accesses', () => {
    // Regression: color.level called detectColorLevel() on every access,
    // meaning process.env was scanned on every call. It should be cached.
    process.env['FORCE_COLOR'] = '3';
    resetColorLevelCache();

    const first = color.level;
    expect(first).toBe('truecolor');

    // Changing env after first access should NOT change result (cached)
    process.env['FORCE_COLOR'] = '0';
    const second = color.level;
    expect(second).toBe('truecolor');
  });

  it('should return fresh value after resetColorLevelCache()', () => {
    process.env['FORCE_COLOR'] = '3';
    resetColorLevelCache();
    expect(color.level).toBe('truecolor');

    // Reset cache and change env
    resetColorLevelCache();
    process.env['FORCE_COLOR'] = '1';
    expect(color.level).toBe('16');
  });
});
