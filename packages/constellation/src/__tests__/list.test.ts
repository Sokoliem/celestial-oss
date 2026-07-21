import { describe, expect, it } from 'vitest';
import type { ListItem } from '../list.js';
import { list } from '../list.js';

describe('list', () => {
  it('renders a simple list of strings', () => {
    const result = list({ items: ['Alpha', 'Beta', 'Gamma'] });
    expect(result).toBeDefined();
    expect(result.kind).toBe('column');
  });

  it('renders empty list with default message', () => {
    const result = list({ items: [] });
    expect(result).toBeDefined();
    expect(result.kind).toBe('text');
  });

  it('renders empty list with custom message', () => {
    const result = list({ items: [], emptyLabel: 'Nothing here' });
    expect(result).toBeDefined();
    expect(result.kind).toBe('text');
  });

  it('renders ordered list', () => {
    const result = list({ items: ['First', 'Second', 'Third'], ordered: true });
    expect(result).toBeDefined();
    expect(result.kind).toBe('column');
  });

  it('renders with custom bullet', () => {
    const result = list({ items: ['A', 'B'], bullet: '→' });
    expect(result).toBeDefined();
  });

  it('renders ListItem objects with descriptions', () => {
    const items: ListItem[] = [
      { label: 'Item 1', description: 'Description for item 1' },
      { label: 'Item 2', description: 'Description for item 2' },
    ];
    const result = list({ items });
    expect(result).toBeDefined();
    expect(result.kind).toBe('column');
  });

  it('renders items with prefix and suffix', () => {
    const items: ListItem[] = [
      { label: 'Task', prefix: '✓', suffix: '(done)' },
      { label: 'Task 2', prefix: '○', suffix: '(pending)' },
    ];
    const result = list({ items });
    expect(result).toBeDefined();
  });

  it('renders items with tone', () => {
    const items: ListItem[] = [
      { label: 'Error', tone: 'danger' },
      { label: 'Warning', tone: 'warning' },
      { label: 'Success', tone: 'success' },
      { label: 'Info', tone: 'info' },
      { label: 'Normal', tone: 'neutral' },
    ];
    const result = list({ items });
    expect(result).toBeDefined();
  });

  it('renders with global tone', () => {
    const result = list({ items: ['A', 'B'], tone: 'accent' });
    expect(result).toBeDefined();
  });

  it('mixes string and object items', () => {
    const items: Array<string | ListItem> = ['Simple string', { label: 'Object item', description: 'Has description' }];
    const result = list({ items });
    expect(result).toBeDefined();
  });

  it('renders single item', () => {
    const result = list({ items: ['Only one'] });
    expect(result).toBeDefined();
    expect(result.kind).toBe('column');
  });

  it('caps a large list at maxRenderedItems with a truncation hint', () => {
    const items: string[] = [];
    for (let i = 0; i < 10000; i++) items.push(`Item ${i}`);
    const result = list({ items, maxRenderedItems: 5 });
    expect(result.kind).toBe('column');
    if (result.kind === 'column') {
      // 5 rendered items + 1 truncation hint
      expect(result.children).toHaveLength(6);
      const last = result.children[5];
      expect(last?.kind).toBe('text');
      if (last?.kind === 'text') {
        expect(last.content).toContain('9995 more');
        expect(last.content).toContain('virtualList');
      }
    }
  });

  it('does not truncate when items.length <= maxRenderedItems', () => {
    const result = list({ items: ['A', 'B', 'C'], maxRenderedItems: 10 });
    expect(result.kind).toBe('column');
    if (result.kind === 'column') {
      expect(result.children).toHaveLength(3);
    }
  });

  it('aligns descriptions using terminal-cell width for wide markers', () => {
    const result = list({ items: [{ label: 'Item', prefix: '界', description: 'Details' }] });
    expect(result.kind).toBe('column');
    if (result.kind === 'column' && result.children[1]?.kind === 'text') {
      expect(result.children[1].content).toBe('   Details');
    }
  });

  it('treats invalid render caps as bounded values', () => {
    const result = list({ items: ['A', 'B'], maxRenderedItems: Number.NaN });
    expect(result.kind).toBe('column');
    if (result.kind === 'column') expect(result.children).toHaveLength(2);
  });
});
