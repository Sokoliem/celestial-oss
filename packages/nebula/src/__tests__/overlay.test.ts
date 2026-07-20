import { describe, expect, it } from 'vitest';
import { type ColumnNode, layout, measure, type OverlayNode, planLayout } from '../vdom.js';

describe('overlay system', () => {
  describe('measure', () => {
    it('overlay measures as 0x0 (does not affect flow)', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'popup' },
        x: 5,
        y: 3,
      };
      expect(measure(node)).toEqual({ width: 0, height: 0 });
    });
  });

  describe('planLayout', () => {
    it('collects overlay into plan.overlays', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'hi' },
        x: 2,
        y: 1,
      };
      const plan = planLayout(node, 10, 5);

      expect(plan.overlays).toBeDefined();
      expect(plan.overlays.length).toBe(1);
      expect(plan.overlays[0]!.entry.rect.x).toBe(2);
      expect(plan.overlays[0]!.entry.rect.y).toBe(1);
    });

    it('overlay does not affect parent column sizing', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'base' },
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'popup' },
            x: 5,
            y: 3,
          } as OverlayNode,
          { kind: 'text', content: 'after' },
        ],
      };
      const plan = planLayout(node, 20, 10);

      // The overlay should not consume any vertical space
      // 'base' at y=0, 'after' at y=1 (overlay takes 0 height)
      expect(plan.root.children.length).toBe(3);
      const baseRect = plan.root.children[0]!.rect;
      const afterRect = plan.root.children[2]!.rect;
      expect(baseRect.y).toBe(0);
      expect(afterRect.y).toBe(1); // immediately after 'base', no gap from overlay

      // overlay collected separately
      expect(plan.overlays.length).toBe(1);
    });

    it('sorts overlays by zIndex ascending', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'low' },
            x: 0,
            y: 0,
            zIndex: 5,
          } as OverlayNode,
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'high' },
            x: 0,
            y: 0,
            zIndex: 10,
          } as OverlayNode,
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'mid' },
            x: 0,
            y: 0,
            zIndex: 7,
          } as OverlayNode,
        ],
      };
      const plan = planLayout(node, 20, 10);

      expect(plan.overlays.length).toBe(3);
      expect(plan.overlays[0]!.zIndex).toBe(5);
      expect(plan.overlays[1]!.zIndex).toBe(7);
      expect(plan.overlays[2]!.zIndex).toBe(10);
    });

    it('defaults zIndex to 0', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'x' },
        x: 0,
        y: 0,
      };
      const plan = planLayout(node, 10, 5);
      expect(plan.overlays[0]!.zIndex).toBe(0);
    });

    it('overlay child gets its own mini layout at absolute position', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'menu item' },
        x: 10,
        y: 5,
      };
      const plan = planLayout(node, 40, 20);

      const overlayEntry = plan.overlays[0]!.entry;
      // The overlay entry's children should contain the text node
      // positioned at the overlay's absolute coordinates
      expect(overlayEntry.children.length).toBeGreaterThan(0);
    });

    it('overlay with explicit width/height constrains child layout', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'very long text that should be constrained' },
        x: 5,
        y: 3,
        width: 10,
        height: 3,
      };
      const plan = planLayout(node, 80, 24);

      const overlayEntry = plan.overlays[0]!.entry;
      expect(overlayEntry.rect.width).toBeLessThanOrEqual(10);
      expect(overlayEntry.rect.height).toBeLessThanOrEqual(3);
    });

    it('overlay indexed by layoutId', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'popup' },
        x: 0,
        y: 0,
        layoutId: 'my-overlay',
      };
      const plan = planLayout(node, 20, 10);
      expect(plan.index.has('my-overlay')).toBe(true);
    });
  });

  describe('rasterize', () => {
    it('overlay content paints on top of base content', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'AAAAAAAAAA' },
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'BB' },
            x: 3,
            y: 0,
          } as OverlayNode,
        ],
      };
      const grid = layout(node, 10, 1);

      // Base: AAAAAAAAAA
      // Overlay at (3,0): BB
      // Result: AAABBAAAAA
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('A');
      expect(grid.cells[0]![2]!.char).toBe('A');
      expect(grid.cells[0]![3]!.char).toBe('B');
      expect(grid.cells[0]![4]!.char).toBe('B');
      expect(grid.cells[0]![5]!.char).toBe('A');
    });

    it('opaque overlay backgrounds clear underlying characters', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'underlay' },
          {
            kind: 'overlay',
            child: {
              kind: 'box',
              width: 7,
              height: 1,
              style: { bg: '\x1b[40m' },
              children: [],
            },
            x: 0,
            y: 0,
            transparent: false,
          } as OverlayNode,
        ],
      };
      const grid = layout(node, 10, 1);

      expect(
        grid.cells[0]!.slice(0, 7)
          .map((cell) => cell.char)
          .join(''),
      ).toBe('       ');
      expect(grid.cells[0]![0]!.style.bg).toBe('\x1b[40m');
    });

    it('higher zIndex overlay paints on top of lower', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'LLL' },
            x: 0,
            y: 0,
            zIndex: 1,
          } as OverlayNode,
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'H' },
            x: 1,
            y: 0,
            zIndex: 2,
          } as OverlayNode,
        ],
      };
      const grid = layout(node, 5, 1);

      // Low overlay: LLL at (0,0)
      // High overlay: H at (1,0) — overwrites second L
      expect(grid.cells[0]![0]!.char).toBe('L');
      expect(grid.cells[0]![1]!.char).toBe('H');
      expect(grid.cells[0]![2]!.char).toBe('L');
    });

    it('transparent overlay: empty cells show base content through', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'XXXXX' },
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'A C' }, // space at position 1
            x: 0,
            y: 0,
            transparent: true,
          } as OverlayNode,
        ],
      };
      const grid = layout(node, 5, 1);

      // Base: XXXXX
      // Transparent overlay: "A C" at (0,0)
      // Spaces in overlay should show base 'X' through
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('X'); // transparent: space shows base
      expect(grid.cells[0]![2]!.char).toBe('C');
      expect(grid.cells[0]![3]!.char).toBe('X'); // beyond overlay, base shows
    });

    it('non-transparent overlay: spaces overwrite base', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'XXXXX' },
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'A C' },
            x: 0,
            y: 0,
            transparent: false,
          } as OverlayNode,
        ],
      };
      const grid = layout(node, 5, 1);

      // Non-transparent: spaces overwrite base
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe(' '); // space overwrites X
      expect(grid.cells[0]![2]!.char).toBe('C');
    });

    it('overlay clipped to grid bounds', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'HELLO' },
        x: 8,
        y: 0,
      };
      const grid = layout(node, 10, 1);

      // Overlay at x=8, text is 5 chars: only HE fits in 10-wide grid
      expect(grid.cells[0]![8]!.char).toBe('H');
      expect(grid.cells[0]![9]!.char).toBe('E');
      // No crash — LLO is clipped
    });

    it('overlay at out-of-bounds position is silently ignored', () => {
      const node: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'invisible' },
        x: 100,
        y: 100,
      };
      // Should not crash
      const grid = layout(node, 10, 5);
      expect(grid.width).toBe(10);
      expect(grid.height).toBe(5);
    });

    it('nested overlays (overlay inside overlay)', () => {
      const inner: OverlayNode = {
        kind: 'overlay',
        child: { kind: 'text', content: 'I' },
        x: 5,
        y: 0,
      };
      const outer: OverlayNode = {
        kind: 'overlay',
        child: {
          kind: 'column',
          children: [{ kind: 'text', content: 'OOO' }, inner],
        },
        x: 0,
        y: 0,
      };
      const node: ColumnNode = {
        kind: 'column',
        children: [{ kind: 'text', content: 'BASE' }, outer],
      };
      const grid = layout(node, 10, 1);

      // Outer overlay at (0,0): "OOO"
      // Inner overlay at (5,0): "I"
      expect(grid.cells[0]![0]!.char).toBe('O');
      expect(grid.cells[0]![1]!.char).toBe('O');
      expect(grid.cells[0]![2]!.char).toBe('O');
      expect(grid.cells[0]![5]!.char).toBe('I');
    });

    it('multiple overlays render in z-order', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'AAAAAAAAAA' },
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'BBB' },
            x: 0,
            y: 0,
            zIndex: 1,
          } as OverlayNode,
          {
            kind: 'overlay',
            child: { kind: 'text', content: 'CC' },
            x: 1,
            y: 0,
            zIndex: 2,
          } as OverlayNode,
        ],
      };
      const grid = layout(node, 10, 1);

      // Base: AAAAAAAAAA
      // z1: BBB at x=0  → BBBAAAAAAA
      // z2: CC at x=1   → BCCAAAAAAA
      expect(grid.cells[0]![0]!.char).toBe('B');
      expect(grid.cells[0]![1]!.char).toBe('C');
      expect(grid.cells[0]![2]!.char).toBe('C');
      expect(grid.cells[0]![3]!.char).toBe('A');
    });
  });
});
