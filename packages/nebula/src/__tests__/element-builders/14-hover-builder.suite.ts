// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { hover } from '../../elements.js';
import { measure } from '../../vdom.js';

// ─── hover() ───────────────────────────────────────────────────────────────

describe('hover() builder', () => {
  it('should create a HoverNode with a static child', () => {
    const child = { kind: 'text' as const, content: 'Hover me' };
    const node = hover('hov-1', child);

    expect(node.kind).toBe('hover');
    expect(node.id).toBe('hov-1');
    expect(node.child).toBe(child);
    expect(node.hovered).toBe(false);
  });

  it('should accept an explicit hovered state', () => {
    const child = { kind: 'text' as const, content: 'test' };
    const node = hover('hov', child, true);

    expect(node.hovered).toBe(true);
  });

  it('should default hovered to false', () => {
    const child = { kind: 'text' as const, content: 'test' };
    const node = hover('hov', child);

    expect(node.hovered).toBe(false);
  });

  it('should accept a render function for dynamic children', () => {
    const renderFn = (hovered: boolean) => (hovered ? { kind: 'text' as const, content: 'HOVER' } : { kind: 'text' as const, content: 'normal' });

    // When not hovered: evaluates with false
    const nodeNormal = hover('hov', renderFn, false);
    expect(nodeNormal.child.kind).toBe('text');
    expect((nodeNormal.child as { content: string }).content).toBe('normal');

    // When hovered: evaluates with true
    const nodeHovered = hover('hov', renderFn, true);
    expect(nodeHovered.child.kind).toBe('text');
    expect((nodeHovered.child as { content: string }).content).toBe('HOVER');
  });

  it('should create a measurable node', () => {
    const node = hover('h', { kind: 'text', content: 'test' });
    const size = measure(node);
    expect(size).toEqual({ width: 4, height: 1 });
  });
});
