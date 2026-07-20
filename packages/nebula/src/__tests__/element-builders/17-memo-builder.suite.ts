// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { memo, text } from '../../elements.js';

// ─── memo() ────────────────────────────────────────────────────────────────

describe('memo() builder', () => {
  it('should create a MemoNode with render and deps', () => {
    const render = () => text('cached');
    const deps = [1, 'a'] as const;
    const node = memo(render, deps);
    expect(node.kind).toBe('memo');
    expect(node.render).toBe(render);
    expect(node.deps).toBe(deps);
  });
});
