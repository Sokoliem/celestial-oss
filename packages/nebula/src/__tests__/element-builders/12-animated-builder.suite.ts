// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { animated, component, text } from '../../elements.js';

// ─── animated() ────────────────────────────────────────────────────────────

describe('animated() builder', () => {
  it('should add layoutId to a VNode', () => {
    const child = text('hello');
    const node = animated('anim-1', child);
    expect((node as { layoutId?: string }).layoutId).toBe('anim-1');
  });

  it('should preserve key from ComponentNode', () => {
    const comp = component(() => text('x'), 'my-key');
    const node = animated('anim', comp);
    expect((node as { key?: string }).key).toBe('my-key');
  });
});
