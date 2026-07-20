import { color } from '@celestial/core/corona';
import type { RowNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { badge, badgeGroup } from '../badge.js';
import type { ConstellationThemeInput } from '../theme.js';

function isRowNode(node: VNode): node is RowNode {
  return node.kind === 'row';
}

describe('badge', () => {
  it('initializes with visible true', () => {
    const comp = badge({ label: 'New' });
    const [model] = comp.init();
    expect(model.visible).toBe(true);
  });

  it('handles click message', () => {
    let clicked = false;
    const comp = badge({
      label: 'New',
      onClick: () => {
        clicked = true;
      },
    });
    const [model] = comp.init();
    comp.update({ type: 'click' }, model);
    expect(clicked).toBe(true);
  });

  it('owns pointer hover state and exposes a semantic click region when interactive', () => {
    const comp = badge({ id: 'release-badge', label: 'New', onClick: () => {} });
    const [model] = comp.init();
    const [hovered] = comp.update({ type: 'hover' }, model);
    expect(hovered.hovered).toBe(true);
    expect(comp.view(hovered).kind).toBe('event');
    expect(JSON.stringify(comp.view(hovered))).toContain('onMouseEnter');
    expect(JSON.stringify(comp.subscriptions?.(hovered))).toContain('elementMouse');

    const [resting] = comp.update({ type: 'leave' }, hovered);
    expect(resting.hovered).toBe(false);
  });

  it('keeps informational badges non-interactive', () => {
    const comp = badge({ label: 'Read only' });
    const [model] = comp.init();
    expect(comp.view(model).kind).toBe('text');
    expect(comp.subscriptions?.(model)?._kind.kind).toBe('none');
  });

  it('renders view without crashing', () => {
    const comp = badge({ label: 'New' });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('accepts theme config and uses it for variant colors', () => {
    const customTheme = {
      colors: { tones: { danger: color.rgb(255, 0, 0) } },
    } as ConstellationThemeInput;
    const comp = badge({ label: 'Error', variant: 'danger', theme: customTheme });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });
});

describe('badgeGroup', () => {
  it('returns a VNode directly (not a ComponentDescriptor)', () => {
    const result = badgeGroup({
      badges: [{ label: 'New' }, { label: 'Hot' }],
    });
    // Should be a VNode, not an object with init/update/view
    expect(result).toBeDefined();
    expect(result).toHaveProperty('kind');
    expect((result as any).init).toBeUndefined();
    expect((result as any).update).toBeUndefined();
  });

  it('renders badges in a row', () => {
    const result = badgeGroup({
      badges: [{ label: 'New' }, { label: 'Hot' }],
    });
    expect(isRowNode(result)).toBe(true);
  });

  it('renders all badges', () => {
    const result = badgeGroup({
      badges: [{ label: 'New' }, { label: 'Hot' }, { label: 'Sale' }],
    });
    expect(isRowNode(result)).toBe(true);
    const rowNode = result as RowNode;
    // Each badge produces a text node
    expect(rowNode.children.length).toBe(3);
  });

  it('passes theme to child badges', () => {
    const customTheme = {
      colors: { tones: { success: color.rgb(0, 200, 0) } },
    } as ConstellationThemeInput;
    const result = badgeGroup({
      badges: [{ label: 'OK', variant: 'success' }],
      theme: customTheme,
    });
    expect(result).toBeDefined();
    expect(isRowNode(result)).toBe(true);
  });
});
