import { describe, expect, it } from 'vitest';
import { event, text } from '../elements.js';
import { collectHitRegions } from '../hit-regions.js';
import { applyAutomaticHoverFeedback } from '../interaction-feedback.js';
import { planLayout, rasterize } from '../vdom.js';

describe('automatic interaction feedback', () => {
  it('infers one contrast-preserving hover contract for click-only regions', () => {
    const node = event(
      'open',
      text('Open'),
      { onClick: 'open' },
      { label: 'Open', affordances: ['click'], cursor: 'pointer' },
    );

    expect(node.metadata).toMatchObject({
      hoverFeedback: 'reverse',
      affordances: ['click', 'hover'],
    });
  });

  it('reverses and emphasizes exactly the hovered hit rectangle', () => {
    const node = event('open', text('Open'), { onClick: 'open' });
    const plan = planLayout(node, 8, 1);
    const idle = rasterize(plan);
    const hovered = applyAutomaticHoverFeedback(idle, collectHitRegions(plan), 'open');

    expect(hovered).not.toBe(idle);
    expect(hovered.cells[0]!.slice(0, 4).every((cell) => cell.style.reverse && cell.style.bold)).toBe(true);
    expect(hovered.cells[0]![4]!.style.reverse).toBeUndefined();
    expect(idle.cells[0]![0]!.style.reverse).toBeUndefined();
  });

  it('adds a framework receipt to managed faces while leaving spatial surfaces untouched', () => {
    const managed = event('managed', text('Managed'), { onClick: 'open', onMouseEnter: 'enter', onMouseLeave: 'leave' });
    const spatial = event('spatial', text('Spatial'), { onRightClick: 'menu' }, { presentation: 'spatial' });
    const managedPlan = planLayout(managed, 10, 1);
    const managedIdle = rasterize(managedPlan);
    const managedHover = applyAutomaticHoverFeedback(managedIdle, collectHitRegions(managedPlan), managed.id);
    expect(managedHover.cells[0]![0]!.style).toMatchObject({ bold: true, underline: true });
    expect(managedHover.cells[0]![0]!.style.reverse).toBeUndefined();

    const spatialPlan = planLayout(spatial, 10, 1);
    const spatialIdle = rasterize(spatialPlan);
    expect(applyAutomaticHoverFeedback(spatialIdle, collectHitRegions(spatialPlan), spatial.id)).toBe(spatialIdle);
  });
});
