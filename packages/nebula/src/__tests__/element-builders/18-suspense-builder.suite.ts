// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { suspense, text } from '../../elements.js';

// ─── suspense() ────────────────────────────────────────────────────────────

describe('suspense() builder', () => {
  it('should create a SuspenseNode with child, fallback, resolved', () => {
    const child = text('loaded');
    const fallback = text('loading...');
    const node = suspense(child, fallback, false);
    expect(node.kind).toBe('suspense');
    expect(node.child).toBe(child);
    expect(node.fallback).toBe(fallback);
    expect(node.resolved).toBe(false);
  });

  it('should set resolved=true when data is ready', () => {
    const node = suspense(text('done'), text('wait'), true);
    expect(node.resolved).toBe(true);
  });
});
