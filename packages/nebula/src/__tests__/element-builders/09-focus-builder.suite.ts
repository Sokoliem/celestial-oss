// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { focus, text } from '../../elements.js';

// ─── focus() ───────────────────────────────────────────────────────────────

describe('focus() builder', () => {
  it('should accept boolean for backward compat', () => {
    const child = text('focusable');
    const node = focus('f1', child, true);
    expect(node.kind).toBe('focus');
    expect(node.id).toBe('f1');
    expect(node.focused).toBe(true);
  });

  it('should accept FocusOptions object', () => {
    const child = text('focusable');
    const node = focus('f2', child, { focused: true, tabIndex: 3, group: 'grp' });
    expect(node.focused).toBe(true);
    expect(node.tabIndex).toBe(3);
    expect(node.group).toBe('grp');
  });

  it('should default focused to false', () => {
    const node = focus('f3', text('x'));
    expect(node.focused).toBe(false);
  });
});
