import type { ColumnNode, TextNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { emptyState } from '../empty-state.js';

function isColumnNode(node: VNode): node is ColumnNode {
  return node.kind === 'column';
}

function isTextNode(node: VNode): node is TextNode {
  return node.kind === 'text';
}

describe('emptyState', () => {
  // ── basic rendering ─────────────────────────────────────────────────────

  it('returns a VNode directly (pure function)', () => {
    const result = emptyState({
      title: 'No results',
      description: 'Try adjusting your search.',
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty('kind');
    expect((result as any).init).toBeUndefined();
  });

  it('renders as a column', () => {
    const result = emptyState({
      title: 'Nothing here',
      description: 'Create your first item to get started.',
    });
    expect(isColumnNode(result)).toBe(true);
  });

  it('renders title text', () => {
    const result = emptyState({
      title: 'Empty inbox',
      description: 'All caught up!',
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      const textNodes = result.children.filter((c) => isTextNode(c)) as TextNode[];
      const titleNode = textNodes.find((n) => n.content.includes('Empty inbox'));
      expect(titleNode).toBeDefined();
    }
  });

  it('renders description text', () => {
    const result = emptyState({
      title: 'No data',
      description: 'Upload a file to begin.',
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      const textNodes = result.children.filter((c) => isTextNode(c)) as TextNode[];
      const descNode = textNodes.find((n) => n.content.includes('Upload a file to begin.'));
      expect(descNode).toBeDefined();
    }
  });

  // ── icon ────────────────────────────────────────────────────────────────

  it('renders icon with title when provided', () => {
    const result = emptyState({
      title: 'No items',
      description: 'Start adding items.',
      icon: '📦',
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      const textNodes = result.children.filter((c) => isTextNode(c)) as TextNode[];
      const headerNode = textNodes.find((n) => n.content.includes('📦'));
      expect(headerNode).toBeDefined();
    }
  });

  it('renders title without icon prefix when icon is absent', () => {
    const result = emptyState({
      title: 'No items',
      description: 'Start adding items.',
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      const textNodes = result.children.filter((c) => isTextNode(c)) as TextNode[];
      const titleNode = textNodes.find((n) => n.content === 'No items');
      expect(titleNode).toBeDefined();
    }
  });

  // ── actions ─────────────────────────────────────────────────────────────

  it('renders actions when provided', () => {
    const result = emptyState({
      title: 'Empty',
      description: 'Nothing to show.',
      actions: [{ label: 'Create New' }, { label: 'Import', shortcut: 'Ctrl+I' }],
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      // There should be more children when actions are present
      // divider + title + desc + actions + divider
      expect(result.children.length).toBeGreaterThan(3);
    }
  });

  it('renders without actions when none provided', () => {
    const result = emptyState({
      title: 'Empty',
      description: 'Nothing here.',
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      // divider + title + desc + divider = 4
      expect(result.children.length).toBe(4);
    }
  });

  it('renders action with shortcut keycap', () => {
    const result = emptyState({
      title: 'Empty',
      description: 'Nothing.',
      actions: [{ label: 'Create', shortcut: 'n' }],
    });
    expect(isColumnNode(result)).toBe(true);
    if (isColumnNode(result)) {
      // divider + title + desc + 1 action row + divider = 5
      expect(result.children.length).toBe(5);
    }
  });

  // ── width ───────────────────────────────────────────────────────────────

  it('accepts custom width', () => {
    const result = emptyState({
      title: 'Empty',
      description: 'Nothing.',
      width: 60,
    });
    expect(result).toBeDefined();
  });

  // ── tone ────────────────────────────────────────────────────────────────

  it('accepts tone config', () => {
    const result = emptyState({
      title: 'Error',
      description: 'Something went wrong.',
      tone: 'danger',
    });
    expect(result).toBeDefined();
  });
});
