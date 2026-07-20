import { describe, expect, it } from 'vitest';

// Import through index.ts to trigger auto-registration
import { listNames, lookup, renderAt, resolve, spinners } from '../../spinner/index.js';

describe('auto-registration via index.ts', () => {
  it('registers all built-in spinners on import', () => {
    const names = listNames();
    expect(names.length).toBeGreaterThanOrEqual(80);
    expect(names).toContain('dots');
    expect(names).toContain('line');
    expect(names).toContain('matrix');
    expect(names).toContain('material');
  });

  it('lookup returns registered definitions', () => {
    const dots = lookup('dots');
    expect(dots).toBeDefined();
    expect(dots!.name).toBe('dots');
    expect(dots!.frames).toBeDefined();
  });

  it('end-to-end: lookup → resolve → renderAt', () => {
    const def = lookup('dots')!;
    const resolved = resolve(def);
    const frame = renderAt(resolved, 0);
    expect(frame).toBe('⠋');
  });

  it('spinners namespace exposes all definitions', () => {
    expect(spinners.dots).toBeDefined();
    expect(spinners.matrix).toBeDefined();
    expect(spinners.all).toBeDefined();
    expect(Object.keys(spinners.all).length).toBeGreaterThanOrEqual(80);
  });
});
