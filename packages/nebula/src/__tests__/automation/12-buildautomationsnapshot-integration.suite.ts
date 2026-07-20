// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildAutomationSnapshot, fingerprintAutomationSnapshot, setVNodeMeta } from '../../automation.js';
import type { BoxNode, Cell, CellGrid, ColumnNode, EmptyNode, FocusNode, RowNode, TextNode, VNode } from '../../vdom.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeCell(char: string): Cell {
  return { char, style: {} };
}

function makeCellGrid(lines: string[], width?: number): CellGrid {
  const maxWidth = width ?? Math.max(...lines.map((l) => l.length), 1);
  const cells: Cell[][] = lines.map((line) => {
    const row: Cell[] = [];
    for (let i = 0; i < maxWidth; i++) {
      row.push(makeCell(line[i] ?? ' '));
    }
    return row;
  });
  return { cells, width: maxWidth, height: lines.length };
}

function textNode(content: string): TextNode {
  return { kind: 'text', content };
}

function focusNode(id: string, child: VNode, focused: boolean): FocusNode {
  return { kind: 'focus', id, child, focused };
}

function _rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── Full integration snapshot test ─────────────────────────────────────────

describe('buildAutomationSnapshot integration', () => {
  it('produces a complete snapshot with all fields', () => {
    const title = textNode('My App');
    setVNodeMeta(title, { a11y: { role: 'heading', level: 1, label: 'My App' } });

    const btn = textNode('▸ Submit ◂');
    setVNodeMeta(btn, { testId: 'submit', a11y: { role: 'button', label: 'Submit' } });
    const focusedBtn = focusNode('submit-f', btn, true);

    const tree = columnNode(title, focusedBtn);
    const grid = makeCellGrid(['My App    ', '▸ Submit ◂']);
    const snap = buildAutomationSnapshot(tree, grid, 10, 2);

    // Text
    expect(snap.text).toContain('My App');
    expect(snap.text).toContain('Submit');

    // Size
    expect(snap.size).toEqual({ cols: 10, rows: 2 });

    // Elements
    expect(snap.elements.length).toBeGreaterThanOrEqual(2);
    const heading = snap.elements.find((e) => e.role === 'heading');
    expect(heading).toBeDefined();
    const button = snap.elements.find((e) => e.testId === 'submit');
    expect(button).toBeDefined();

    // Actions
    expect(snap.actions.length).toBeGreaterThanOrEqual(1);
    const submitAction = snap.actions.find((a) => a.focusId === 'submit-f');
    expect(submitAction).toBeDefined();
    expect(submitAction!.focused).toBe(true);

    // Focused action id
    expect(snap.focusedActionId).toBe('focus:submit-f');

    // Audit — heading level and interactive labels should pass
    expect(snap.audit.passes).toContain('heading-levels-sequential');

    // Fingerprint should be stable
    const fp1 = fingerprintAutomationSnapshot(snap);
    const fp2 = fingerprintAutomationSnapshot(snap);
    expect(fp1).toBe(fp2);
  });

  it('handles empty tree gracefully', () => {
    const tree = emptyNode();
    const grid: CellGrid = { cells: [], width: 0, height: 0 };
    const snap = buildAutomationSnapshot(tree, grid, 0, 0);

    expect(snap.text).toBe('');
    expect(snap.elements).toEqual([]);
    expect(snap.actions).toEqual([]);
    expect(snap.focusedActionId).toBeNull();
    expect(snap.audit).toBeDefined();
  });

  it('handles scroll nodes in tree', () => {
    const child = textNode('Scrolled');
    const scroll: VNode = { kind: 'scroll', child, offset: 0, height: 1 };

    const grid = makeCellGrid(['Scrolled']);
    const snap = buildAutomationSnapshot(scroll, grid, 8, 1);

    expect(snap.text).toBe('Scrolled');
  });

  it('handles event nodes in tree', () => {
    const child = textNode('Evented');
    const ev: VNode = {
      kind: 'event',
      id: 'ev-1',
      child,
      handlers: { onClick: 'click' },
    };

    const grid = makeCellGrid(['Evented']);
    const snap = buildAutomationSnapshot(ev, grid, 7, 1);

    expect(snap.text).toBe('Evented');
  });

  it('handles hover nodes in tree', () => {
    const child = textNode('Hovered');
    const hov: VNode = { kind: 'hover', id: 'hov-1', child, hovered: false };

    const grid = makeCellGrid(['Hovered']);
    const snap = buildAutomationSnapshot(hov, grid, 7, 1);

    expect(snap.text).toBe('Hovered');
  });

  it('handles overlay nodes in tree', () => {
    const child = textNode('Overlay');
    const overlay: VNode = { kind: 'overlay', child, x: 0, y: 0 };

    const grid = makeCellGrid(['Overlay']);
    const snap = buildAutomationSnapshot(overlay, grid, 7, 1);

    expect(snap.text).toBe('Overlay');
  });

  it('handles flex nodes in tree', () => {
    const child = textNode('Flex');
    const flex: VNode = { kind: 'flex', child };

    const grid = makeCellGrid(['Flex']);
    const snap = buildAutomationSnapshot(flex, grid, 4, 1);

    expect(snap.text).toBe('Flex');
  });
});
