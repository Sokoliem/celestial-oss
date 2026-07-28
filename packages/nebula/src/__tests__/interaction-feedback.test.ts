import { color, style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { event, text } from '../elements.js';
import { collectHitRegions } from '../hit-regions.js';
import { applyAutomaticHoverFeedback } from '../interaction-feedback.js';
import { planLayout, rasterize } from '../vdom.js';

describe('automatic interaction feedback', () => {
  it('infers one calm hover contract for click-only regions', () => {
    const node = event(
      'open',
      text('Open'),
      { onClick: 'open' },
      { label: 'Open', affordances: ['click'], cursor: 'pointer' },
    );

    expect(node.metadata).toMatchObject({
      hoverFeedback: 'subtle',
      affordances: ['click', 'hover'],
    });
  });

  it('tints only painted glyphs without filling the hovered region', () => {
    const node = event(
      'open',
      text('Open    ', style({ color: color.hex('#94a3b8'), background: color.hex('#0f172a'), dim: true })),
      { onClick: 'open' },
    );
    const plan = planLayout(node, 8, 1);
    const idle = rasterize(plan);
    const hovered = applyAutomaticHoverFeedback(idle, collectHitRegions(plan), 'open');

    expect(hovered).not.toBe(idle);
    expect(hovered.cells[0]!.slice(0, 4).every((cell) => cell.style.dim === false)).toBe(true);
    expect(hovered.cells[0]![0]!.style.fgRgb).not.toEqual(idle.cells[0]![0]!.style.fgRgb);
    expect(hovered.cells[0]![0]!.style.bold).toBe(idle.cells[0]![0]!.style.bold);
    const before = idle.cells[0]![0]!.style;
    const after = hovered.cells[0]![0]!.style;
    expect(color.contrastRatio(color.rgb(...after.fgRgb!), color.rgb(...after.bgRgb!))).toBeGreaterThanOrEqual(
      color.contrastRatio(color.rgb(...before.fgRgb!), color.rgb(...before.bgRgb!)),
    );
    expect(hovered.cells[0]![0]!.style.reverse).toBeFalsy();
    expect(hovered.cells[0]![0]!.style.underline).toBeFalsy();
    expect(hovered.cells[0]!.slice(4)).toEqual(idle.cells[0]!.slice(4));
  });

  it('uses weight only when rendered RGB is unavailable', () => {
    const node = event('fallback', text('Fallback'), { onClick: 'open' });
    const plan = planLayout(node, 8, 1);
    const idle = rasterize(plan);
    const hovered = applyAutomaticHoverFeedback(idle, collectHitRegions(plan), 'fallback');

    expect(hovered.cells[0]!.every((cell) => cell.style.bold)).toBe(true);
    expect(hovered.cells[0]!.every((cell) => !cell.style.reverse && !cell.style.underline)).toBe(true);
  });

  it('leaves managed and spatial surfaces entirely to their semantic owners', () => {
    const managed = event('managed', text('Managed'), { onClick: 'open', onMouseEnter: 'enter', onMouseLeave: 'leave' });
    const spatial = event('spatial', text('Spatial'), { onRightClick: 'menu' }, { presentation: 'spatial' });
    const managedPlan = planLayout(managed, 10, 1);
    const managedIdle = rasterize(managedPlan);
    expect(applyAutomaticHoverFeedback(managedIdle, collectHitRegions(managedPlan), managed.id)).toBe(managedIdle);

    const spatialPlan = planLayout(spatial, 10, 1);
    const spatialIdle = rasterize(spatialPlan);
    expect(applyAutomaticHoverFeedback(spatialIdle, collectHitRegions(spatialPlan), spatial.id)).toBe(spatialIdle);
  });
});
