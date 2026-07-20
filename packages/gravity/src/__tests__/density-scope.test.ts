import { afterEach, describe, expect, it } from 'vitest';
import { _resetDensityStackForTests, currentDensity, DEFAULT_DENSITY, DENSITY_SPACING, densitySpacing, withDensity } from '../density-scope.js';

afterEach(() => {
  _resetDensityStackForTests();
});

describe('densityScope', () => {
  it('returns DEFAULT_DENSITY when no scope is active', () => {
    expect(currentDensity()).toBe(DEFAULT_DENSITY);
  });

  it('respects the active density inside withDensity', () => {
    withDensity('compact', () => {
      expect(currentDensity()).toBe('compact');
    });
  });

  it('pops the scope after withDensity returns', () => {
    withDensity('compact', () => undefined);
    expect(currentDensity()).toBe(DEFAULT_DENSITY);
  });

  it('nests scopes predictably', () => {
    withDensity('compact', () => {
      expect(currentDensity()).toBe('compact');
      withDensity('comfortable', () => {
        expect(currentDensity()).toBe('comfortable');
      });
      expect(currentDensity()).toBe('compact');
    });
  });

  it('unwinds even when the inner fn throws', () => {
    expect(() =>
      withDensity('compact', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(currentDensity()).toBe(DEFAULT_DENSITY);
  });

  it('densitySpacing reads from current scope', () => {
    withDensity('compact', () => {
      expect(densitySpacing()).toEqual(DENSITY_SPACING.compact);
    });
    withDensity('comfortable', () => {
      expect(densitySpacing()).toEqual(DENSITY_SPACING.comfortable);
    });
    expect(densitySpacing()).toEqual(DENSITY_SPACING.cozy);
  });

  it('returns the inner fn return value', () => {
    const result = withDensity('compact', () => 42);
    expect(result).toBe(42);
  });
});
