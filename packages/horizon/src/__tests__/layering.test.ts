import { describe, expect, it } from 'vitest';
import { splitH } from '../compat/index.js';
import { splitPane } from '../core/index.js';
import { rectContains } from '../primitives/index.js';
import { createPipModel, pipUpdateResult, stateUpdateResult } from '../state/index.js';

describe('horizon layering', () => {
  it('exposes distinct core, state, compat, and primitive barrels', () => {
    expect(typeof splitPane).toBe('function');
    expect(typeof splitH).toBe('function');
    expect(typeof rectContains).toBe('function');
    expect(typeof createPipModel).toBe('function');
  });

  it('provides a normalized state update result contract', () => {
    const initial = createPipModel({ width: 10, height: 4 });
    const next = pipUpdateResult({ type: 'pip-toggle' }, initial);

    expect(next.model.minimized).toBe(true);
    expect(next.effects).toEqual([]);
    expect(next.diagnostics).toEqual([]);

    const manual = stateUpdateResult(initial);
    expect(manual.effects).toEqual([]);
  });

  it('shares geometry primitives through the primitive barrel', () => {
    expect(rectContains({ x: 1, y: 2, width: 3, height: 4 }, 2, 3)).toBe(true);
    expect(rectContains({ x: 1, y: 2, width: 3, height: 4 }, 9, 9)).toBe(false);
  });
});
