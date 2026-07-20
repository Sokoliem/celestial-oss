import { afterEach, describe, expect, it } from 'vitest';
import {
  clearNamedScales,
  defineBreakpoints,
  densityFor,
  getNamedScale,
  listNamedScales,
  paneMode,
  resolveConditional,
  resolveNamedTier,
  resolveWhen,
  setTerminalSize,
  when,
} from '../index.js';

describe('named-breakpoints', () => {
  afterEach(() => {
    clearNamedScales();
    setTerminalSize(null);
  });

  describe('defineBreakpoints()', () => {
    it('registers a single named scale and returns sorted tiers', () => {
      const [overlay] = defineBreakpoints({
        overlay: { narrow: 0, medium: 82, wide: 104 },
      });
      expect(overlay?.scale).toBe('overlay');
      expect(overlay?.tiers.map((tier) => tier.name)).toEqual(['narrow', 'medium', 'wide']);
      expect(overlay?.tiers.map((tier) => tier.min)).toEqual([0, 82, 104]);
    });

    it('registers multiple scales in one call', () => {
      defineBreakpoints({
        overlay: { narrow: 0, medium: 82, wide: 104 },
        pane: { compact: 0, comfortable: 60, spacious: 100 },
      });
      expect(listNamedScales()).toHaveLength(2);
      expect(getNamedScale('overlay')?.tiers).toHaveLength(3);
      expect(getNamedScale('pane')?.tiers).toHaveLength(3);
    });

    it('re-defining a scale replaces it', () => {
      defineBreakpoints({ overlay: { narrow: 0, wide: 100 } });
      defineBreakpoints({ overlay: { tiny: 0, big: 200 } });
      const def = getNamedScale('overlay');
      expect(def?.tiers.map((tier) => tier.name)).toEqual(['tiny', 'big']);
    });

    it('rejects empty scales', () => {
      expect(() => defineBreakpoints({ overlay: {} })).toThrow();
    });

    it('rejects negative or non-finite thresholds', () => {
      expect(() => defineBreakpoints({ overlay: { bad: -1 } })).toThrow();
      expect(() => defineBreakpoints({ overlay: { bad: Number.NaN } })).toThrow();
      expect(() => defineBreakpoints({ overlay: { bad: Number.POSITIVE_INFINITY } })).toThrow();
    });

    it('rejects duplicate thresholds within a scale', () => {
      expect(() => defineBreakpoints({ overlay: { a: 10, b: 10 } })).toThrow();
    });
  });

  describe('resolveNamedTier() / paneMode() / densityFor()', () => {
    it('returns the highest tier whose threshold is met', () => {
      defineBreakpoints({ overlay: { narrow: 0, medium: 82, wide: 104 } });
      expect(resolveNamedTier('overlay', 50)).toBe('narrow');
      expect(resolveNamedTier('overlay', 82)).toBe('medium');
      expect(resolveNamedTier('overlay', 103)).toBe('medium');
      expect(resolveNamedTier('overlay', 104)).toBe('wide');
      expect(resolveNamedTier('overlay', 200)).toBe('wide');
    });

    it('returns null for unknown scales', () => {
      expect(resolveNamedTier('missing', 100)).toBeNull();
      expect(paneMode('missing', 100)).toBeNull();
      expect(densityFor('missing', 100)).toBeNull();
    });

    it('paneMode and densityFor are aliases for resolveNamedTier', () => {
      defineBreakpoints({ pane: { compact: 0, comfortable: 60, spacious: 100 } });
      expect(paneMode('pane', 70)).toBe('comfortable');
      expect(densityFor('pane', 70)).toBe('comfortable');
    });

    it('falls back to the lowest tier for sub-threshold values', () => {
      defineBreakpoints({ overlay: { medium: 82, wide: 104 } });
      expect(resolveNamedTier('overlay', 10)).toBe('medium');
    });
  });

  describe('clearNamedScales()', () => {
    it('removes every registered scale', () => {
      defineBreakpoints({ overlay: { narrow: 0, wide: 100 } });
      expect(listNamedScales()).toHaveLength(1);
      clearNamedScales();
      expect(listNamedScales()).toHaveLength(0);
      expect(getNamedScale('overlay')).toBeNull();
    });
  });

  describe('when() named-scale overload', () => {
    it('decodes >= comparator into a min-bounded WhenCondition', () => {
      defineBreakpoints({ pane: { compact: 0, comfortable: 60, spacious: 100 } });
      setTerminalSize({ cols: 80, rows: 24 });

      const cond = when({ pane: '>= comfortable' });
      expect(cond._tag).toBe('when');
      expect(resolveWhen(cond)).toBe(true);

      setTerminalSize({ cols: 50, rows: 24 });
      expect(resolveWhen(cond)).toBe(false);
    });

    it('decodes < comparator into a max-bounded WhenCondition', () => {
      defineBreakpoints({ pane: { compact: 0, comfortable: 60, spacious: 100 } });
      setTerminalSize({ cols: 50, rows: 24 });
      expect(resolveWhen(when({ pane: '< comfortable' }))).toBe(true);
      setTerminalSize({ cols: 60, rows: 24 });
      expect(resolveWhen(when({ pane: '< comfortable' }))).toBe(false);
    });

    it('decodes == comparator into a tier-bounded range', () => {
      defineBreakpoints({ pane: { compact: 0, comfortable: 60, spacious: 100 } });
      setTerminalSize({ cols: 70, rows: 24 });
      expect(resolveWhen(when({ pane: '== comfortable' }))).toBe(true);
      setTerminalSize({ cols: 100, rows: 24 });
      expect(resolveWhen(when({ pane: '== comfortable' }))).toBe(false);
    });

    it('returns ifTrue/ifFalse via WhenConditional shape', () => {
      defineBreakpoints({ pane: { compact: 0, comfortable: 60 } });
      setTerminalSize({ cols: 80, rows: 24 });
      const cond = when({ pane: '>= comfortable' }, 'full', 'compact');
      expect(cond._tag).toBe('when-conditional');
      expect(resolveConditional(cond)).toBe('full');
      setTerminalSize({ cols: 30, rows: 24 });
      expect(resolveConditional(cond)).toBe('compact');
    });

    it('falls through to a never-matching predicate when scale or tier is unknown', () => {
      // No scale defined at all → not detected as named-scale input → treated as
      // a plain BreakpointDef with no min/max, which always matches. Validate
      // the explicit defined-but-unknown-tier path returns false.
      defineBreakpoints({ pane: { compact: 0, comfortable: 60 } });
      setTerminalSize({ cols: 80, rows: 24 });
      expect(resolveWhen(when({ pane: '>= bogus' }))).toBe(false);
    });

    it('treats the default operator as >= when omitted', () => {
      defineBreakpoints({ pane: { compact: 0, comfortable: 60 } });
      setTerminalSize({ cols: 80, rows: 24 });
      expect(resolveWhen(when({ pane: 'comfortable' }))).toBe(true);
      setTerminalSize({ cols: 30, rows: 24 });
      expect(resolveWhen(when({ pane: 'comfortable' }))).toBe(false);
    });
  });
});
