// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { component, text } from '../../elements.js';

// ─── component() ───────────────────────────────────────────────────────────

describe('component() builder', () => {
  it('should create a ComponentNode with a render function', () => {
    const render = () => text('rendered');
    const node = component(render, 'comp-key');
    expect(node.kind).toBe('component');
    expect(node.render).toBe(render);
    expect(node.key).toBe('comp-key');
  });

  it('should default key to undefined', () => {
    const node = component(() => text('x'));
    expect(node.key).toBeUndefined();
  });
});
