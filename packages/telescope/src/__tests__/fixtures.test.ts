import { describe, expect, it } from 'vitest';
import { terminals } from '../fixtures.js';

describe('terminals (fixture presets)', () => {
  it('standard is 80x24', () => {
    expect(terminals.standard).toEqual({ cols: 80, rows: 24 });
  });

  it('compact is 40x10', () => {
    expect(terminals.compact).toEqual({ cols: 40, rows: 10 });
  });

  it('wide is 200x50', () => {
    expect(terminals.wide).toEqual({ cols: 200, rows: 50 });
  });

  it('tall is 80x60', () => {
    expect(terminals.tall).toEqual({ cols: 80, rows: 60 });
  });

  it('all presets have positive cols and rows', () => {
    for (const [name, preset] of Object.entries(terminals)) {
      expect(preset.cols, `${name}.cols`).toBeGreaterThan(0);
      expect(preset.rows, `${name}.rows`).toBeGreaterThan(0);
    }
  });
});
