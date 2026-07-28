// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { portal, text } from '../../elements.js';

// ─── portal() ──────────────────────────────────────────────────────────────

describe('portal() builder', () => {
  it('should create a PortalNode with target and child', () => {
    const child = text('teleported');
    const node = portal('modal-root', child);
    expect(node.kind).toBe('portal');
    expect(node.target).toBe('modal-root');
    expect(node.child).toBe(child);
  });

  it('should expose transparent composition as an explicit option', () => {
    const node = portal('modal-root', text('teleported'), { transparent: true, focusMode: 'modal' });

    expect(node.transparent).toBe(true);
    expect(node.focusMode).toBe('modal');
  });
});
