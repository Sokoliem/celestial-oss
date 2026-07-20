import { afterEach, describe, expect, it } from 'vitest';
import { resolveConditional, resolveWhen, setTerminalSize, when } from '../index.js';
import {
  clearActiveMediaContracts,
  defineMediaContract,
  emitContractMediaQueries,
  getActiveMediaContract,
  matchTier,
  setActiveMediaContract,
} from '../media-contract.js';

afterEach(() => {
  clearActiveMediaContracts();
  setTerminalSize(null);
});

describe('media-contract', () => {
  describe('defineMediaContract', () => {
    it('rejects empty tiers', () => {
      expect(() => defineMediaContract({ name: 'pane', tiers: {} })).toThrow();
    });

    it('rejects negative cols', () => {
      expect(() =>
        defineMediaContract({
          name: 'pane',
          tiers: { compact: { cols: -1 } },
        }),
      ).toThrow();
    });

    it('rejects out-of-order tiers', () => {
      expect(() =>
        defineMediaContract({
          name: 'pane',
          tiers: { wide: { cols: 100 }, compact: { cols: 0 } },
        }),
      ).toThrow();
    });

    it('rejects negative browserPx', () => {
      expect(() =>
        defineMediaContract({
          name: 'pane',
          tiers: { compact: { cols: 0, browserPx: -10 } },
        }),
      ).toThrow();
    });
  });

  describe('matchTier', () => {
    it('selects the highest tier whose cols are <= input', () => {
      const contract = defineMediaContract({
        name: 'pane',
        tiers: { compact: { cols: 0 }, comfortable: { cols: 80 }, wide: { cols: 140 } },
      });
      expect(matchTier(contract, 30)?.name).toBe('compact');
      expect(matchTier(contract, 100)?.name).toBe('comfortable');
      expect(matchTier(contract, 200)?.name).toBe('wide');
    });
  });

  describe('emitContractMediaQueries', () => {
    it('skips zero / undefined browserPx tiers', () => {
      const contract = defineMediaContract({
        name: 'pane',
        tiers: {
          compact: { cols: 0, browserPx: 0 },
          comfortable: { cols: 80, browserPx: 800 },
          wide: { cols: 140, browserPx: 1400 },
        },
      });
      const css = emitContractMediaQueries(contract, (name) => `.${name} { display: block; }`);
      expect(css).toContain('@media (min-width: 800px)');
      expect(css).toContain('@media (min-width: 1400px)');
      expect(css).not.toContain('compact { display:');
      // Two non-zero tiers
      expect(css.match(/@media/g)?.length).toBe(2);
    });
  });

  describe('setActiveMediaContract / when()', () => {
    it('axis-tag form resolves against the active contract', () => {
      const contract = defineMediaContract({
        name: 'pane',
        tiers: { compact: { cols: 0 }, comfortable: { cols: 80 }, wide: { cols: 140 } },
      });
      setActiveMediaContract(contract);
      expect(getActiveMediaContract('pane')).toBe(contract);

      setTerminalSize({ cols: 100, rows: 24 });
      expect(resolveWhen(when({ pane: '>= comfortable' }))).toBe(true);
      expect(resolveWhen(when({ pane: '>= wide' }))).toBe(false);

      setTerminalSize({ cols: 30, rows: 24 });
      expect(resolveWhen(when({ pane: '>= comfortable' }))).toBe(false);
    });

    it('returns false when no contract is registered', () => {
      setTerminalSize({ cols: 100, rows: 24 });
      expect(resolveWhen(when({ unknown: '>= foo' }))).toBe(false);
    });

    it('rejects redefinition under same name', () => {
      const a = defineMediaContract({ name: 'pane', tiers: { compact: { cols: 0 } } });
      setActiveMediaContract(a);
      const b = defineMediaContract({ name: 'pane', tiers: { compact: { cols: 0 }, wide: { cols: 100 } } });
      expect(() => setActiveMediaContract(b)).toThrow();
    });

    it('axis-tag conditional form selects ifTrue/ifFalse', () => {
      const contract = defineMediaContract({
        name: 'pane',
        tiers: { compact: { cols: 0 }, comfortable: { cols: 80 } },
      });
      setActiveMediaContract(contract);
      const cond = when({ pane: '>= comfortable' }, 'full', 'mini');

      setTerminalSize({ cols: 100, rows: 24 });
      expect(resolveConditional(cond)).toBe('full');

      setTerminalSize({ cols: 30, rows: 24 });
      expect(resolveConditional(cond)).toBe('mini');
    });
  });
});
