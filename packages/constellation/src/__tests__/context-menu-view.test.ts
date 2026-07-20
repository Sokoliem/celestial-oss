import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import type { ContextMenuState, MenuItem } from '../context-menu.js';
import { type ContextMenuViewTokens, contextMenuView, measureContextMenuItemWidth } from '../context-menu-view.js';

const palette = color.rgb(26, 26, 26);
const tokens: ContextMenuViewTokens = {
  background: palette,
  border: palette,
  text: palette,
  textMuted: palette,
  selectedBackground: palette,
  selectedText: palette,
  separator: palette,
  shortcut: palette,
};

function stateOf<M>(partial: Partial<ContextMenuState<M>> & { items: MenuItem<M>[] }): ContextMenuState<M> {
  return {
    open: true,
    x: 0,
    y: 0,
    selectedIndex: 0,
    submenuStack: [],
    ...partial,
  };
}

// Walk any VNode tree collecting text content so assertions can look for a
// label regardless of nesting (box → stack → row → text). `stack` returns a
// ComponentNode — we have to invoke its render callback to see inside.
function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as {
    kind?: string;
    content?: unknown;
    children?: unknown[];
    child?: unknown;
    entry?: unknown;
    render?: (ctx?: unknown) => unknown;
  };
  if (n.kind === 'text') {
    const content = typeof n.content === 'function' ? (n.content as () => string)() : n.content;
    return typeof content === 'string' ? content : '';
  }
  if (n.kind === 'component' && typeof n.render === 'function') {
    return collectText(n.render());
  }
  let out = '';
  if (Array.isArray(n.children)) for (const c of n.children) out += collectText(c);
  if (n.child) out += collectText(n.child);
  if (n.entry) out += collectText(n.entry);
  return out;
}

describe('contextMenuView', () => {
  it('returns null when the menu is closed', () => {
    const node = contextMenuView({
      state: stateOf({ open: false, items: [{ label: 'Cut', msg: 'cut' }] }),
      tokens,
    });
    expect(node).toBeNull();
  });

  it('returns null when the menu has no items (never renders empty shell)', () => {
    const node = contextMenuView({ state: stateOf({ items: [] }), tokens });
    expect(node).toBeNull();
  });

  it('renders every item label in the returned tree', () => {
    const node = contextMenuView({
      state: stateOf({
        items: [
          { label: 'Cut', msg: 'cut' },
          { label: 'Copy', msg: 'copy' },
          { label: 'Paste', msg: 'paste' },
        ],
      }),
      tokens,
    });
    expect(node).not.toBeNull();
    const text = collectText(node);
    expect(text).toContain('Cut');
    expect(text).toContain('Copy');
    expect(text).toContain('Paste');
  });

  it('returns an overlay whose declared position is clamped inside the viewport', () => {
    const node = contextMenuView({
      state: stateOf({ x: 500, y: 500, items: [{ label: 'Only', msg: 'only' }] }),
      tokens,
      viewport: { cols: 30, rows: 8 },
    });
    expect(node).not.toBeNull();
    const overlayNode = node as { kind: string; x: number; y: number; width: number; height: number };
    expect(overlayNode.kind).toBe('overlay');
    // Menu is wider than 30 - 500 → must snap to 0 rather than produce negative x.
    expect(overlayNode.x).toBeGreaterThanOrEqual(0);
    expect(overlayNode.x + overlayNode.width).toBeLessThanOrEqual(30);
    expect(overlayNode.y + overlayNode.height).toBeLessThanOrEqual(8);
  });

  it('does not render a submenu arrow for plain items', () => {
    const node = contextMenuView({
      state: stateOf({ items: [{ label: 'Plain', msg: 'plain' }] }),
      tokens,
    });
    expect(collectText(node)).not.toContain('▸');
  });

  it('renders a ▸ arrow for items that carry a non-empty submenu', () => {
    const node = contextMenuView({
      state: stateOf({
        items: [{ label: 'Nested', msg: 'nested', submenu: [{ label: 'Inner', msg: 'inner' }] }],
      }),
      tokens,
    });
    expect(collectText(node)).toContain('▸');
  });

  it('honors an explicit width override', () => {
    const node = contextMenuView({
      state: stateOf({ items: [{ label: 'A', msg: 'a' }] }),
      tokens,
      width: 50,
    });
    expect((node as { width: number }).width).toBe(50);
  });

  it('renders MenuItem.hint as a third column between label and shortcut (P0-1)', () => {
    const node = contextMenuView({
      state: stateOf({
        items: [{ label: 'Open', msg: 'open', hint: 'in pane' }],
      }),
      tokens,
    });
    const txt = collectText(node);
    expect(txt).toContain('Open');
    expect(txt).toContain('in pane');
  });

  it('keeps measureItemWidth honoring the hint column', () => {
    // Two items: first with a hint, second without. The first's hint must
    // contribute to the measured inner width so the rendered cells fit.
    const node = contextMenuView({
      state: stateOf({
        items: [
          { label: 'Short', msg: 'a', hint: 'a-long-hint-that-takes-space' },
          { label: 'Other', msg: 'b' },
        ],
      }),
      tokens,
    });
    const txt = collectText(node);
    expect(txt).toContain('a-long-hint-that-takes-space');
  });

  it('measureContextMenuLayout returns the geometry contextMenuView paints at', async () => {
    const { measureContextMenuLayout } = await import('../context-menu-view.js');
    const state = stateOf({
      items: [
        { label: 'Open', msg: 'open' },
        { label: 'Delete', msg: 'delete' },
        { label: 'Rename', msg: 'rename' },
      ],
      x: 5,
      y: 7,
    });
    const layout = measureContextMenuLayout({ state });
    expect(layout).not.toBeNull();
    expect(layout?.x).toBe(5);
    expect(layout?.y).toBe(7);
    expect(layout?.rowCount).toBe(3);
    expect(layout?.firstItemIndex).toBe(0);
    expect(layout?.totalRowCount).toBe(3);
    expect(layout?.height).toBe(5); // 3 rows + 2 borders
    expect(layout?.innerHeight).toBe(3);
    expect(layout?.innerWidth).toBe(layout!.width - 2);
  });

  it('measureContextMenuLayout returns null when the menu is closed or empty', async () => {
    const { measureContextMenuLayout } = await import('../context-menu-view.js');
    expect(measureContextMenuLayout({ state: stateOf({ items: [] }) })).toBeNull();
    expect(measureContextMenuLayout({ state: stateOf({ items: [{ label: 'A', msg: 'a' }], open: false }) })).toBeNull();
  });

  it('measureContextMenuLayout clamps against the viewport', async () => {
    const { measureContextMenuLayout } = await import('../context-menu-view.js');
    const state = stateOf({ items: [{ label: 'A', msg: 'a' }], x: 100, y: 100 });
    const layout = measureContextMenuLayout({ state, viewport: { cols: 20, rows: 10 } });
    expect(layout?.x).toBeLessThanOrEqual(20 - layout!.width);
    expect(layout?.y).toBeLessThanOrEqual(10 - layout!.height);
  });

  it('windows tall menus and keeps the keyboard selection visible', async () => {
    const { measureContextMenuLayout } = await import('../context-menu-view.js');
    const items = Array.from({ length: 12 }, (_, index) => ({ label: `Item ${index}`, msg: index }));
    const state = stateOf({ items, selectedIndex: 11 });
    const layout = measureContextMenuLayout({ state, viewport: { cols: 30, rows: 6 } });
    const node = contextMenuView({ state, tokens, viewport: { cols: 30, rows: 6 } });

    expect(layout?.height).toBe(6);
    expect(layout?.rowCount).toBe(4);
    expect(layout?.firstItemIndex).toBe(8);
    expect(layout?.totalRowCount).toBe(12);
    expect(collectText(node)).toContain('Item 11');
    expect(collectText(node)).not.toContain('Item 0 ');
  });

  it('normalizes non-finite geometry and width overrides', async () => {
    const { measureContextMenuLayout } = await import('../context-menu-view.js');
    const state = stateOf({ items: [{ label: 'Safe', msg: 'safe' }], x: Number.NaN, y: Number.POSITIVE_INFINITY });
    const layout = measureContextMenuLayout({ state, viewport: { cols: 20, rows: 8 }, width: Number.POSITIVE_INFINITY });

    expect(layout?.x).toBe(0);
    expect(layout?.y).toBe(0);
    expect(layout?.width).toBeGreaterThan(0);
    expect(layout?.width).toBeLessThanOrEqual(20);
  });

  it('clampBounds restricts placement inside a sub-region of the viewport', async () => {
    const { measureContextMenuLayout } = await import('../context-menu-view.js');
    const state = stateOf({ items: [{ label: 'Open', msg: 'open' }], x: 2, y: 2 });
    const layout = measureContextMenuLayout({
      state,
      viewport: { cols: 80, rows: 24 },
      clampBounds: { minX: 10, maxX: 40, minY: 5, maxY: 20 },
    });
    expect(layout?.x).toBeGreaterThanOrEqual(10);
    expect(layout?.y).toBeGreaterThanOrEqual(5);
  });

  it('clampBounds applies to the rendered overlay', () => {
    const state = stateOf({ items: [{ label: 'Open', msg: 'open' }], x: 2, y: 2 });
    const node = contextMenuView({
      state,
      tokens,
      viewport: { cols: 80, rows: 24 },
      clampBounds: { minX: 10, minY: 5 },
    });
    const overlayNode = node as { x: number; y: number };
    expect(overlayNode.x).toBeGreaterThanOrEqual(10);
    expect(overlayNode.y).toBeGreaterThanOrEqual(5);
  });

  it('visibleHeight clips the rendered frame height for open/close animations', () => {
    const state = stateOf({
      items: [
        { label: 'A', msg: 'a' },
        { label: 'B', msg: 'b' },
        { label: 'C', msg: 'c' },
      ],
    });
    const fullHeight = (contextMenuView({ state, tokens }) as { height: number }).height;
    const clipped = contextMenuView({ state, tokens, visibleHeight: 2 }) as { height: number };
    expect(clipped.height).toBe(2);
    expect(fullHeight).toBeGreaterThan(clipped.height);
  });

  it('visibleHeight <= 0 returns null (menu fully collapsed during animation)', () => {
    const state = stateOf({ items: [{ label: 'A', msg: 'a' }] });
    expect(contextMenuView({ state, tokens, visibleHeight: 0 })).toBeNull();
    expect(contextMenuView({ state, tokens, visibleHeight: -2 })).toBeNull();
  });

  it('keeps a hovered disabled row on the selected background while dimming the text', () => {
    function findRowMatching(node: unknown, fragment: string): { style?: { bgRgb?: readonly [number, number, number]; dim?: boolean } } | null {
      if (!node || typeof node !== 'object') return null;
      const n = node as {
        kind?: string;
        content?: unknown;
        style?: { bgRgb?: readonly [number, number, number]; dim?: boolean };
        children?: unknown[];
        child?: unknown;
        render?: () => unknown;
        entry?: unknown;
      };
      if (n.kind === 'text') {
        const content = typeof n.content === 'function' ? (n.content as () => string)() : n.content;
        if (typeof content === 'string' && content.includes(fragment)) return n;
      }
      if (n.kind === 'component' && typeof n.render === 'function') {
        const match = findRowMatching(n.render(), fragment);
        if (match) return match;
      }
      if (n.child) {
        const match = findRowMatching(n.child, fragment);
        if (match) return match;
      }
      if (n.entry) {
        const match = findRowMatching(n.entry, fragment);
        if (match) return match;
      }
      if (Array.isArray(n.children))
        for (const c of n.children) {
          const match = findRowMatching(c, fragment);
          if (match) return match;
        }
      return null;
    }
    const accent = color.rgb(80, 120, 200);
    const themedTokens: ContextMenuViewTokens = {
      ...tokens,
      selectedBackground: accent,
      selectedText: color.rgb(245, 247, 250),
      textMuted: color.rgb(120, 124, 128),
      text: color.rgb(220, 224, 228),
      background: color.rgb(20, 20, 20),
    };
    const state = stateOf({
      items: [
        { label: 'Open', msg: 'open' },
        { label: 'Disabled', msg: 'd', disabled: true },
      ],
      selectedIndex: 1,
    });
    const node = contextMenuView({ state, tokens: themedTokens });
    const row = findRowMatching(node, 'Disabled');
    expect(row?.style?.bgRgb).toEqual(accent.rgb);
    expect(row?.style?.dim).toBe(true);
  });

  it('visibleHeight above the natural height does not expand past it', () => {
    const state = stateOf({ items: [{ label: 'A', msg: 'a' }] });
    const node = contextMenuView({ state, tokens, visibleHeight: 999 }) as { height: number };
    // Natural height = 1 row + 2 borders = 3.
    expect(node.height).toBe(3);
  });
});

describe('measureContextMenuItemWidth', () => {
  it('returns the default minimum (12) when items are narrower than it', () => {
    const items: MenuItem<string>[] = [
      { label: 'A', msg: 'a' },
      { label: 'BC', msg: 'b' },
    ];
    expect(measureContextMenuItemWidth(items)).toBe(12);
  });

  it('returns labelLen + 4 (1 leading + 1 trailing + 2 border) when wider than min', () => {
    const items: MenuItem<string>[] = [{ label: 'Open file', msg: 'open' }]; // 9 chars
    expect(measureContextMenuItemWidth(items)).toBe(9 + 4); // 13
  });

  it('respects custom min/max bounds', () => {
    const items: MenuItem<string>[] = [{ label: 'Open file', msg: 'open' }];
    expect(measureContextMenuItemWidth(items, { min: 20 })).toBe(20);
    expect(measureContextMenuItemWidth(items, { max: 10 })).toBe(10);
  });

  it('measures wide and combined Unicode labels in terminal cells', () => {
    const items: MenuItem<string>[] = [{ label: '界界界界界', msg: 'wide' }];
    expect(measureContextMenuItemWidth(items)).toBe(14);
  });

  it('does not split a grapheme when a narrow override clips a row', () => {
    const items: MenuItem<string>[] = [{ label: `A👩‍🚀B`, msg: 'unicode', shortcut: 'x' }];
    const node = contextMenuView({ state: stateOf({ items }), tokens, width: 7 });
    const rendered = collectText(node);
    expect(rendered).not.toContain('‍');
    expect(rendered).toContain('x');
  });

  it('ignores separators when computing width', () => {
    const items: MenuItem<string>[] = [
      { label: 'very-long-label-no-cap', msg: 'a' }, // 22 chars → 26
      { label: '', separator: true },
      { label: 'B', msg: 'b' },
    ];
    expect(measureContextMenuItemWidth(items)).toBe(22 + 4); // 26
  });

  it('accounts for shortcut, hint, and submenu when sizing rows', () => {
    const items: MenuItem<string>[] = [
      { label: 'Open', shortcut: 'Ctrl+O', msg: 'open' }, // 4 + (6+2) = 12 → +4 = 16
      { label: 'Sort', hint: 'by date', msg: 'sort' }, // 4 + (7+1) = 12 → +4 = 16
      { label: 'Nest', submenu: [{ label: 'Inner', msg: 'inner' }], msg: 'nest' }, // 4 + 2 = 6 → +4 = 10
    ];
    expect(measureContextMenuItemWidth(items)).toBe(16);
  });

  it('matches the width contextMenuView would auto-measure when used as override', () => {
    const items: MenuItem<string>[] = [{ label: 'Open file', msg: 'open' }];
    const state = stateOf({ items });
    const autoNode = contextMenuView({ state, tokens });
    const autoWidth = (autoNode as { width: number }).width;
    const overrideWidth = measureContextMenuItemWidth(items);
    expect(overrideWidth).toBe(autoWidth);
  });
});
