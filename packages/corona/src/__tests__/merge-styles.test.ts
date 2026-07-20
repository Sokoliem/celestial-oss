import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { mergeStyles, style } from '../style.js';

describe('mergeStyles', () => {
  it('returns empty object for no arguments', () => {
    expect(mergeStyles()).toEqual({});
  });

  it('returns a copy for single argument', () => {
    const s = { bold: true as const };
    const result = mergeStyles(s);
    expect(result).toEqual(s);
    expect(result).not.toBe(s); // new object
  });

  describe('plain value overrides', () => {
    it('later value wins for same property', () => {
      const result = mergeStyles({ color: color.red }, { color: color.blue });
      expect(result.color).toBe(color.blue);
    });

    it('undefined in override does not clobber', () => {
      const result = mergeStyles({ color: color.red, bold: true }, { color: undefined, italic: true });
      expect(result.color).toBe(color.red);
      expect(result.bold).toBe(true);
      expect(result.italic).toBe(true);
    });
  });

  describe('responsive map merging', () => {
    it('unions breakpoint keys when both are responsive maps', () => {
      const result = mergeStyles({ bold: { xs: true, md: false } }, { bold: { md: true, lg: true } });
      expect(result.bold).toEqual({ xs: true, md: true, lg: true });
    });

    it('responsive map + plain value: override wins entirely', () => {
      const result = mergeStyles({ bold: { xs: true, md: false } }, { bold: true });
      expect(result.bold).toBe(true);
    });

    it('plain value + responsive map: override wins entirely', () => {
      const result = mergeStyles({ bold: true }, { bold: { xs: false, lg: true } });
      expect(result.bold).toEqual({ xs: false, lg: true });
    });
  });

  describe('effects deep merge', () => {
    it('deep merges plain effects objects', () => {
      const result = mergeStyles({ effects: { glass: true, blur: 5 } }, { effects: { blur: 3, opacity: 0.8 } });
      expect(result.effects).toEqual({ glass: true, blur: 3, opacity: 0.8 });
    });

    it('deep merges responsive effects per-breakpoint', () => {
      const result = mergeStyles({ effects: { xs: { glass: true }, md: { blur: 5 } } }, { effects: { md: { opacity: 0.5 }, lg: { noise: 0.1 } } });
      const effects = result.effects as Record<string, unknown>;
      expect(effects).toEqual({
        xs: { glass: true },
        md: { blur: 5, opacity: 0.5 },
        lg: { noise: 0.1 },
      });
    });
  });

  describe('three-way merge', () => {
    it('applies left-to-right', () => {
      const result = mergeStyles({ color: color.red, bold: true }, { color: color.green }, { color: color.blue, italic: true });
      expect(result.color).toBe(color.blue);
      expect(result.bold).toBe(true);
      expect(result.italic).toBe(true);
    });
  });

  describe('Style.merge() uses mergeStyles', () => {
    it('responsive maps are union-merged via Style.merge()', () => {
      const s = style({ bold: { xs: true, md: false } });
      const merged = s.merge({ bold: { lg: true } });
      // Should union breakpoint keys
      expect(merged.props.bold).toEqual({ xs: true, md: false, lg: true });
    });
  });
});
