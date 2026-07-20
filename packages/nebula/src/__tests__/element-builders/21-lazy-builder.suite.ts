// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { lazy, text } from '../../elements.js';

// ─── lazy() ────────────────────────────────────────────────────────────────

describe('lazy() builder', () => {
  it('should create a LazyNode with key, loader, placeholder', () => {
    const loader = () => Promise.resolve(() => text('loaded'));
    const placeholder = text('loading...');
    const node = lazy('lazy-1', loader, placeholder);
    expect(node.kind).toBe('lazy');
    expect(node.key).toBe('lazy-1');
    expect(node.loader).toBe(loader);
    expect(node.placeholder).toBe(placeholder);
  });
});
