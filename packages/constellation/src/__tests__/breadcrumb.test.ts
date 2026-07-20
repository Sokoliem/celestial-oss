import { describe, expect, it, vi } from 'vitest';
import { breadcrumb } from '../breadcrumb.js';

const items = [
  { label: 'Home', key: 'home' },
  { label: 'Products', key: 'products' },
  { label: 'Details', key: 'details' },
];

describe('breadcrumb', () => {
  it('initializes to the last item by default', () => {
    const component = breadcrumb({ items });
    const [model] = component.init();
    expect(model.selectedIndex).toBe(2);
    expect(model.cursor).toBe(2);
  });

  it('honors an explicit selected key', () => {
    const component = breadcrumb({ items, selectedKey: 'products' });
    const [model] = component.init();
    expect(model.selectedIndex).toBe(1);
  });

  it('renders labels joined by the configured separator', () => {
    const component = breadcrumb({ items, separator: ' / ' });
    const [model] = component.init();
    const vnode = component.view(model);
    expect(vnode.kind).toBe('row');
    if (vnode.kind === 'row') {
      expect(vnode.children.length).toBe(5);
      expect(JSON.stringify(vnode.children[1])).toContain(' / ');
    }
  });

  it('activates the exact clicked item and calls onSelect', () => {
    const onSelect = vi.fn();
    const component = breadcrumb({ items, onSelect });
    const [model] = component.init();
    const [selected] = component.update({ type: 'activate-at', index: 0 }, model);
    expect(selected.selectedIndex).toBe(0);
    expect(selected.cursor).toBe(0);
    expect(selected.focused).toBe(true);
    expect(onSelect).toHaveBeenCalledWith('home');
  });

  it('owns hover state and emits semantic hover and click regions', () => {
    const component = breadcrumb({ id: 'docs-path', items });
    const [model] = component.init();
    const [hovered] = component.update({ type: 'hover-at', index: 1 }, model);
    expect(hovered.hoveredIndex).toBe(1);
    expect(hovered.cursor).toBe(1);
    const view = component.view(hovered);
    expect(JSON.stringify(view)).toContain('onMouseEnter');
    expect(JSON.stringify(view)).toContain('docs-path:item:1');

    const [resting] = component.update({ type: 'leave-at', index: 1 }, hovered);
    expect(resting.hoveredIndex).toBeNull();
  });

  it('keeps pointer subscriptions active without keyboard focus', () => {
    const component = breadcrumb({ items });
    const [model] = component.init();
    expect(component.subscriptions?.(model)._kind.kind).toBe('elementMouse');
  });

  it('enables keyboard navigation after focus', () => {
    const component = breadcrumb({ items, focused: true });
    const [model] = component.init();
    const [left] = component.update({ type: 'left' }, model);
    expect(left.cursor).toBe(1);
    expect(component.subscriptions?.(left)._kind.kind).toBe('batch');
  });

  it('renders an empty text node for an empty path', () => {
    const component = breadcrumb({ items: [] });
    const [model] = component.init();
    const vnode = component.view(model);
    expect(vnode.kind).toBe('text');
    if (vnode.kind === 'text') expect(vnode.content).toBe('');
  });
});
