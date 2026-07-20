import { color, defaultTheme } from '@celestial/core/corona';
import type { RowNode, TextNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import * as SurfaceContainer from '../surface-container.js';
import type { ConstellationThemeInput } from '../theme.js';
import { measureTooltipBubble, tooltip, tooltipContract, tooltipGroup } from '../tooltip.js';

function isTextNode(node: VNode, content?: string): node is TextNode {
  if (node.kind !== 'text') return false;
  if (content !== undefined) return (node as TextNode).content === content;
  return true;
}

function isRowNode(node: VNode): node is RowNode {
  return node.kind === 'row';
}

describe('tooltip', () => {
  it('initializes with visible false', () => {
    const comp = tooltip({ content: 'Help text' });
    const [model] = comp.init();
    expect(model.visible).toBe(false);
    expect(model.triggered).toBe(false);
  });

  it('shows tooltip on show message', () => {
    const comp = tooltip({ content: 'Help text' });
    const [model] = comp.init();
    const [shown] = comp.update({ type: 'show' }, model);
    expect(shown.visible).toBe(true);
  });

  it('hides tooltip on hide message', () => {
    const comp = tooltip({ content: 'Help text' });
    const [model] = comp.init();
    const [shown] = comp.update({ type: 'show' }, model);
    const [hidden] = comp.update({ type: 'hide' }, shown);
    expect(hidden.visible).toBe(false);
  });

  it('toggles tooltip visibility', () => {
    const comp = tooltip({ content: 'Help text' });
    const [model] = comp.init();
    const [toggled1] = comp.update({ type: 'toggle' }, model);
    expect(toggled1.visible).toBe(true);
    const [toggled2] = comp.update({ type: 'toggle' }, toggled1);
    expect(toggled2.visible).toBe(false);
  });

  it('renders view without crashing', () => {
    const comp = tooltip({ content: 'Help text' });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('does not render an unanchored directional caret unless requested', () => {
    const comp = tooltip({ content: 'Help text', position: 'bottom' });
    const [model] = comp.init();
    expect(comp.view({ ...model, visible: true }).kind).toBe('box');

    const anchored = tooltip({ content: 'Help text', position: 'bottom', caret: true });
    const [anchoredModel] = anchored.init();
    expect(anchored.view({ ...anchoredModel, visible: true }).kind).toBe('column');
  });

  it('measures border and vertical padding in bubble height', () => {
    expect(measureTooltipBubble({ content: 'one line' }).height).toBe(5);
  });

  it('accepts theme config and uses it for variant colors', () => {
    const customTheme = {
      colors: { tones: { info: color.rgb(0, 100, 200) } },
    } as ConstellationThemeInput;
    const comp = tooltip({ content: 'Themed', variant: 'info', theme: customTheme });
    const [model] = comp.init();
    const view = comp.view({ ...model, visible: true });
    expect(view).toBeDefined();
  });

  it('uses the floating elevation surface for tooltip backgrounds', () => {
    const bg = tooltipContract.bg(defaultTheme);
    expect(bg.rgb).toEqual((defaultTheme.elevation.floating.surface ?? defaultTheme.colors.surfaceRaised).rgb);
  });
});

// ─── A2 / F-001 — tooltip surface-contract wiring ───────────────────────────
//
// Per follow-up PRD `docs/specs/2026-05-12-design-system-review-followup-prd.md`
// Phase A2. Asserts the surface-contract panic + escape wiring shipped in the
// original plan's Phase 4.2 actually dismisses the tooltip and fans out via the
// module-level broadcaster.

describe('tooltip surface contract', () => {
  // Walk a Sub tree (which may be a Sub.batch) and flatten to leaf Sub nodes,
  // matching the helper used elsewhere in this package's tests.
  const flatten = (s: any): any[] => {
    const k = s?._kind;
    if (!k) return [];
    if (k.kind === 'batch') return (k.subs as any[]).flatMap(flatten);
    return [s];
  };

  it('subscriptions while visible include surfaceContractSubs AND Sub.key("escape")', () => {
    const comp = tooltip({ content: 'Help text' });
    const [initial] = comp.init();
    const [shown] = comp.update({ type: 'show' }, initial);
    const sub = comp.subscriptions!(shown);
    const leaves = flatten(sub) as Array<{ _kind: { kind: string; key?: string } }>;

    const keys = leaves.map((l) => l._kind.key).filter(Boolean);
    expect(keys).toContain('escape');
    // surfaceContractSubs contributes a Ctrl+Shift+Backspace keyWithModifiers
    // sub plus a panic-broadcast stream sub; assert both leaf kinds are present.
    expect(leaves.some((l) => l._kind.kind === 'keyWithModifiers')).toBe(true);
    expect(leaves.some((l) => l._kind.kind === 'stream')).toBe(true);
  });

  it('panic dismisses a visible tooltip and invokes broadcastSurfacePanic()', () => {
    const spy = vi.spyOn(SurfaceContainer, 'broadcastSurfacePanic');
    try {
      const comp = tooltip({ content: 'Help text' });
      const [initial] = comp.init();
      const [shown] = comp.update({ type: 'show' }, initial);
      expect(shown.visible).toBe(true);
      spy.mockClear();

      const [hidden] = comp.update({ type: 'panic' }, shown);
      expect(hidden.visible).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('escape dismisses a visible tooltip independently of panic', () => {
    const spy = vi.spyOn(SurfaceContainer, 'broadcastSurfacePanic');
    try {
      const comp = tooltip({ content: 'Help text' });
      const [initial] = comp.init();
      const [shown] = comp.update({ type: 'show' }, initial);
      spy.mockClear();

      const [hidden] = comp.update({ type: 'hide' }, shown);
      expect(hidden.visible).toBe(false);
      // Escape closes locally — it should NOT trigger a cross-surface broadcast.
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('panic and escape are no-ops when the tooltip is not visible', () => {
    const spy = vi.spyOn(SurfaceContainer, 'broadcastSurfacePanic');
    try {
      const comp = tooltip({ content: 'Help text' });
      const [initial] = comp.init();
      expect(initial.visible).toBe(false);

      const [afterPanic] = comp.update({ type: 'panic' }, initial);
      expect(afterPanic.visible).toBe(false);
      expect(spy).not.toHaveBeenCalled();

      const [afterEscape] = comp.update({ type: 'hide' }, initial);
      expect(afterEscape.visible).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('subscriptions while hidden return Sub.none (no leaked panic listener)', () => {
    const comp = tooltip({ content: 'Help text' });
    const [initial] = comp.init();
    const sub = comp.subscriptions!(initial);
    expect((sub as any)._kind.kind).toBe('none');
  });
});

describe('tooltipGroup', () => {
  it('returns a VNode directly (not a ComponentDescriptor)', () => {
    const result = tooltipGroup({
      items: [
        { trigger: 'A', content: 'Content A' },
        { trigger: 'B', content: 'Content B' },
      ],
    });
    // Should be a VNode, not an object with init/update/view
    expect(result).toBeDefined();
    expect(result).toHaveProperty('kind');
    expect((result as any).init).toBeUndefined();
    expect((result as any).update).toBeUndefined();
  });

  it('renders trigger labels in a row', () => {
    const result = tooltipGroup({
      items: [
        { trigger: 'A', content: 'Content A' },
        { trigger: 'B', content: 'Content B' },
      ],
    });
    expect(isRowNode(result)).toBe(true);
    const rowNode = result as RowNode;
    const textNodes = rowNode.children.filter((c) => isTextNode(c));
    expect(textNodes.length).toBeGreaterThanOrEqual(2);
    expect(textNodes.some((n) => (n as TextNode).content === 'A')).toBe(true);
    expect(textNodes.some((n) => (n as TextNode).content === 'B')).toBe(true);
  });

  it('renders all items', () => {
    const result = tooltipGroup({
      items: [
        { trigger: 'X', content: 'Content X' },
        { trigger: 'Y', content: 'Content Y' },
        { trigger: 'Z', content: 'Content Z' },
      ],
    });
    expect(isRowNode(result)).toBe(true);
    const rowNode = result as RowNode;
    const textNodes = rowNode.children.filter((c) => isTextNode(c));
    expect(textNodes.length).toBeGreaterThanOrEqual(3);
  });
});
