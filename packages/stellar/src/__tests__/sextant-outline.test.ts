/**
 * Back-compat smoke test for the deprecated `sextantOutline` alias.
 * The full behavioral suite lives in `subcell-outline.test.ts` against
 * the new canonical name.
 */
import { describe, expect, it } from 'vitest';
import { type SextantOutlineOpts, type SextantOutlineResult, type SextantOutlineRow, sextantOutline } from '../sextant-outline.js';

describe('sextantOutline (back-compat alias)', () => {
  it('forwards to the renamed primitive', () => {
    const result: SextantOutlineResult = sextantOutline({ density: [0.5, 1], height: 2 });
    expect(result.rows.length).toBe(2);
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('preserves the original opts/result/row type names as aliases', () => {
    const opts: SextantOutlineOpts = { density: [0.3], height: 1 };
    const result = sextantOutline(opts);
    const row: SextantOutlineRow | undefined = result.rows[0];
    expect(row).toBeDefined();
    expect(row?.primary).toBeCloseTo(0.3);
  });
});
