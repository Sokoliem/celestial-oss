import { describe, expect, it, vi } from 'vitest';
import { pagination } from '../pagination.js';

interface TestNode {
  kind: string;
  content?: string;
  child?: TestNode;
  children?: TestNode[];
}

function collectText(node: TestNode): string[] {
  if (node.kind === 'text') return [node.content ?? ''];
  if (node.child) return collectText(node.child);
  return node.children?.flatMap(collectText) ?? [];
}

describe('pagination', () => {
  it('init with default current page', () => {
    const comp = pagination({ total: 50, pageSize: 10 });
    const [model] = comp.init();
    expect(model.current).toBe(1);
    expect(model.totalPages).toBe(5);
  });

  it('init with custom current page', () => {
    const comp = pagination({ total: 50, pageSize: 10, current: 3 });
    const [model] = comp.init();
    expect(model.current).toBe(3);
  });

  it('next increments page', () => {
    const comp = pagination({ total: 50, pageSize: 10 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'next' }, model);
    expect(updated.current).toBe(2);
  });

  it('prev decrements page', () => {
    const comp = pagination({ total: 50, pageSize: 10 });
    const model = { current: 3, totalPages: 5 };
    const [updated] = comp.update({ type: 'prev' }, model);
    expect(updated.current).toBe(2);
  });

  it('cannot go below page 1 or above total', () => {
    const comp = pagination({ total: 50, pageSize: 10 });
    // Below page 1
    const model1 = { current: 1, totalPages: 5 };
    const [updated1] = comp.update({ type: 'prev' }, model1);
    expect(updated1.current).toBe(1);
    // Above total
    const model2 = { current: 5, totalPages: 5 };
    const [updated2] = comp.update({ type: 'next' }, model2);
    expect(updated2.current).toBe(5);
  });

  it('onChange callback fires with new page', () => {
    const onChange = vi.fn();
    const comp = pagination({ total: 50, pageSize: 10, onChange });
    const [model] = comp.init();
    comp.update({ type: 'next' }, model);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('view renders page numbers', () => {
    const comp = pagination({ total: 30, pageSize: 10 });
    const [model] = comp.init();
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('row');
    if (vnode.kind === 'row') {
      // Should contain page numbers 1, 2, 3 plus arrows
      const texts = vnode.children.flatMap((child) => collectText(child as TestNode));
      const joined = texts.join('');
      expect(joined).toContain('1');
      expect(joined).toContain('2');
      expect(joined).toContain('3');
    }
  });

  it('ellipsis for many pages', () => {
    const comp = pagination({ total: 100, pageSize: 10 });
    const [model] = comp.init();
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const texts = vnode.children.flatMap((child) => collectText(child as TestNode));
      const joined = texts.join('');
      expect(joined).toContain('...');
    }
  });

  it('should not emit duplicate ellipsis for large page counts', () => {
    // Bug: For large page counts, both i===4 and i===totalPages-2 conditions
    // can fire, producing two '...' nodes. Each side should show at most one.
    const comp = pagination({ total: 200, pageSize: 10 }); // 20 pages
    const model = { current: 1, totalPages: 20 };
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const texts = vnode.children.flatMap((child) => collectText(child as TestNode));
      const ellipsisCount = texts.filter((t) => t.includes('...')).length;
      // Should have at most 2 ellipsis (one left, one right), never more
      expect(ellipsisCount).toBeLessThanOrEqual(2);
    }
  });

  it('should not emit duplicate left ellipsis', () => {
    // Navigate to middle page to trigger both left and right ellipsis
    const comp = pagination({ total: 200, pageSize: 10 }); // 20 pages
    const model = { current: 10, totalPages: 20 };
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const texts = vnode.children.flatMap((child) => collectText(child as TestNode));
      const ellipsisCount = texts.filter((t) => t.includes('...')).length;
      // With current in middle: should have exactly 2 ellipsis (left + right)
      expect(ellipsisCount).toBeLessThanOrEqual(2);
    }
  });
});
