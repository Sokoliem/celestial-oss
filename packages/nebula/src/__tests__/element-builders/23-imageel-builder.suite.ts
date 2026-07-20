// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { imageEl } from '../../elements.js';

// ─── imageEl() ─────────────────────────────────────────────────────────────

describe('imageEl() builder', () => {
  it('should create an ImageNode with content, width, height', () => {
    const node = imageEl('pixel-data', 40, 20);
    expect(node.kind).toBe('image');
    expect(node.content).toBe('pixel-data');
    expect(node.width).toBe(40);
    expect(node.height).toBe(20);
    expect(node.raw).toBeUndefined();
  });

  it('should set raw flag when specified', () => {
    const node = imageEl('raw-data', 10, 5, { raw: true });
    expect(node.raw).toBe(true);
  });
});
