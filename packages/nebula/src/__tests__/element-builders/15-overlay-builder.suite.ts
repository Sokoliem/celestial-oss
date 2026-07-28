// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { overlay, text } from '../../elements.js';

// ─── overlay() ─────────────────────────────────────────────────────────────

describe('overlay() builder', () => {
  it('should create an OverlayNode with position', () => {
    const child = text('popup');
    const node = overlay(child, { x: 10, y: 5 });
    expect(node.kind).toBe('overlay');
    expect(node.x).toBe(10);
    expect(node.y).toBe(5);
    expect(node.child).toBe(child);
  });

  it('should accept optional dimensions and zIndex', () => {
    const node = overlay(text('x'), {
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      zIndex: 5,
      transparent: true,
      pointerEvents: 'none',
      focusMode: 'active',
    });
    expect(node.width).toBe(20);
    expect(node.height).toBe(10);
    expect(node.zIndex).toBe(5);
    expect(node.transparent).toBe(true);
    expect(node.pointerEvents).toBe('none');
    expect(node.focusMode).toBe('active');
  });
});
