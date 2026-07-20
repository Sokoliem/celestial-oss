import { planLayout } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { analyzeGrid } from '../grid.js';
import { absolute, aspectRatio, breakpoint, containerQuery, traceResponsive, when } from '../index.js';
import { traceLayout } from '../trace.js';

describe('gravity diagnostics', () => {
  it('analyzeGrid returns clean result for valid layout', () => {
    const diagnostics = analyzeGrid({
      cols: 2,
      rows: 2,
      areas: ['hero side', 'hero side'],
      children: [
        { node: { kind: 'text', content: 'hero' }, options: { area: 'hero' } },
        { node: { kind: 'text', content: 'side' }, options: { area: 'side' } },
      ],
    });

    expect(diagnostics.issues).toEqual([]);
  });

  it('traceResponsive reports matched breakpoint', () => {
    const trace = traceResponsive(
      { cols: 80, rows: 24 },
      {
        compact: { kind: 'text', content: 'compact' },
        standard: { kind: 'text', content: 'standard' },
        wide: { kind: 'text', content: 'wide' },
      },
    );

    expect(trace.matchedBreakpoint).toBe('standard');
    expect(trace.selected.kind).toBe('text');
  });

  it('traceResponsive reports fallback when no breakpoint matches', () => {
    breakpoint.mega = { min: 200 };
    const trace = traceResponsive(
      { cols: 120, rows: 24 },
      {
        mega: { kind: 'text', content: 'mega' },
        default: { kind: 'text', content: 'default' },
      },
    );

    expect(trace.reason).toBe('fallback');
    expect(trace.selected).toEqual({ kind: 'text', content: 'default' });
    delete breakpoint.mega;
  });

  it('absolute positions overlays against terminal bounds', () => {
    const overlay = absolute({ kind: 'text', content: 'tip' }, { top: 1, right: 2 });
    const rendered = overlay.render({
      terminal: { cols: 20, rows: 10 },
      available: { cols: 20, rows: 10 },
      container: { cols: 10, rows: 5 },
    });

    expect(rendered).toMatchObject({ kind: 'overlay', x: 15, y: 1, width: 3, height: 1 });
  });

  it('aspectRatio derives height from container width', () => {
    const ratio = aspectRatio(2, { kind: 'text', content: 'chart' });
    const rendered = ratio.render({
      terminal: { cols: 40, rows: 20 },
      available: { cols: 20, rows: 20 },
      container: { cols: 12, rows: 8 },
    });

    expect(rendered).toMatchObject({ kind: 'box', width: 12, height: 6 });
  });

  it('containerQuery matches against container width', () => {
    const queried = containerQuery({ kind: 'text', content: 'default' }, [{ when: when({ max: 60 }), node: { kind: 'text', content: 'narrow' } }]);
    const rendered = queried.render({
      terminal: { cols: 120, rows: 24 },
      available: { cols: 80, rows: 24 },
      container: { cols: 50, rows: 10 },
    });

    expect(rendered).toEqual({ kind: 'text', content: 'narrow' });
  });

  it('traceLayout reports reuse stats for stable layout ids', () => {
    const node = {
      kind: 'column' as const,
      layoutId: 'root',
      children: [{ kind: 'text' as const, content: 'stable', layoutId: 'child' }],
    };

    const firstPlan = planLayout(node, 40, 10);
    const first = traceLayout(node, { width: 40, height: 10 });
    const second = traceLayout(node, { width: 40, height: 10, previousPlan: firstPlan });

    expect(first.trace.length).toBeGreaterThan(0);
    expect(second.stats?.reusedEntries).toBeGreaterThan(0);
  });
});
