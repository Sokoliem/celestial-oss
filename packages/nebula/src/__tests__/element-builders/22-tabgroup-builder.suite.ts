// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { tabGroup, text } from '../../elements.js';

// ─── tabGroup() ────────────────────────────────────────────────────────────

describe('tabGroup() builder', () => {
  it('should create a TabGroupNode with defaults', () => {
    const tabs = [text('Tab 1'), text('Tab 2')];
    const node = tabGroup('tabs', tabs);
    expect(node.kind).toBe('tabGroup');
    expect(node.id).toBe('tabs');
    expect(node.orientation).toBe('horizontal');
    expect(node.activeIndex).toBe(0);
    expect(node.children).toBe(tabs);
  });

  it('should accept custom options', () => {
    const node = tabGroup('t', [text('A')], { orientation: 'vertical', activeIndex: 2, wrap: true });
    expect(node.orientation).toBe('vertical');
    expect(node.activeIndex).toBe(2);
    expect(node.wrap).toBe(true);
  });
});
