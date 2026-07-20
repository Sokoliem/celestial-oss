// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { animated } from '../../elements.js';
import type { VNode } from '../../vdom.js';

// ─── Bug 2.6: animated() spreads ComponentNode losing key ───────────────────

describe('Bug 2.6: animated() should preserve key on ComponentNode', () => {
  it('should preserve key when wrapping a component node with layoutId', () => {
    const render = () => ({ kind: 'text' as const, content: 'hi' });
    const componentNode: VNode = { kind: 'component', render, key: 'my-key' };

    const result = animated('anim-1', componentNode);

    // After fix: key should be preserved
    expect((result as any).layoutId).toBe('anim-1');
    expect((result as any).key).toBe('my-key');
    expect((result as any).kind).toBe('component');
    expect((result as any).render).toBe(render);
  });

  it('should preserve all properties when wrapping a text node', () => {
    const textNode: VNode = { kind: 'text', content: 'hello', style: { bold: true } };
    const result = animated('anim-2', textNode);

    expect((result as any).layoutId).toBe('anim-2');
    expect((result as any).content).toBe('hello');
    expect((result as any).style).toEqual({ bold: true });
  });
});
