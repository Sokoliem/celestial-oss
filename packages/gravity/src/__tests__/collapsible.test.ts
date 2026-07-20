import type { BoxNode, ComponentRenderContext, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { collapsible, collapsibleUpdate, createCollapsibleModel, getCollapsibleProgress, isCollapsibleAnimating } from '../index.js';

const ctx: ComponentRenderContext = {
  terminal: { cols: 80, rows: 24 },
  available: { cols: 40, rows: 24 },
  container: { cols: 40, rows: 24 },
};

function renderComponent(node: VNode): VNode {
  if (node.kind === 'component') {
    return node.render(ctx);
  }
  return node;
}

describe('collapsible', () => {
  it('animates progress across ticks toward open=true', () => {
    let model = createCollapsibleModel(false);
    model = collapsibleUpdate({ type: 'collapsible-set', open: true }, model);
    expect(isCollapsibleAnimating(model)).toBe(true);

    model = collapsibleUpdate({ type: 'collapsible-tick', now: 0 }, model);
    model = collapsibleUpdate({ type: 'collapsible-tick', now: 200 }, model);
    expect(getCollapsibleProgress(model)).toBeGreaterThan(0);
  });

  it('snaps immediately when reduceMotion is true', () => {
    let model = createCollapsibleModel(false);
    model = collapsibleUpdate({ type: 'collapsible-set', open: true }, model, { reduceMotion: true });
    expect(isCollapsibleAnimating(model)).toBe(false);
    expect(getCollapsibleProgress(model)).toBe(1);
  });

  it('reverses mid-animation via setTarget', () => {
    let model = createCollapsibleModel(false);
    model = collapsibleUpdate({ type: 'collapsible-set', open: true }, model);
    model = collapsibleUpdate({ type: 'collapsible-tick', now: 0 }, model);
    model = collapsibleUpdate({ type: 'collapsible-tick', now: 80 }, model);
    const midProgress = getCollapsibleProgress(model);
    expect(midProgress).toBeGreaterThan(0);

    model = collapsibleUpdate({ type: 'collapsible-set', open: false }, model);
    expect(model.open).toBe(false);
    expect(isCollapsibleAnimating(model)).toBe(true);
  });

  it('swaps to collapsedChild below threshold', () => {
    const child: VNode = { kind: 'text', content: 'wide-child-content' };
    const collapsedChild: VNode = { kind: 'text', content: '·' };
    const closedNode = collapsible({
      open: false,
      child,
      collapsedChild,
      threshold: 0.15,
      reduceMotion: true,
    });

    const closed = renderComponent(closedNode) as BoxNode;
    expect(closed.children[0]).toBe(collapsedChild);

    const openNode = collapsible({
      open: true,
      child,
      collapsedChild,
      threshold: 0.15,
      reduceMotion: true,
    });
    const open = renderComponent(openNode) as BoxNode;
    expect(open.children[0]).toBe(child);
  });

  it('preserves the cross-axis dimension', () => {
    const child: VNode = { kind: 'box', width: 20, height: 5, children: [] };
    const node = collapsible({
      open: true,
      axis: 'width',
      child,
      reduceMotion: true,
    });
    const rendered = renderComponent(node) as BoxNode;
    expect(rendered.height).toBe(5);
    expect(rendered.width).toBe(20);

    const heightNode = collapsible({
      open: true,
      axis: 'height',
      child,
      reduceMotion: true,
    });
    const heightRendered = renderComponent(heightNode) as BoxNode;
    expect(heightRendered.width).toBe(20);
    expect(heightRendered.height).toBe(5);
  });
});
