// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildAutomationSnapshot, getVNodeMeta, setVNodeMeta } from '../../automation.js';
import { focus } from '../../elements.js';
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

function _focusNode(id: string, child: VNode, focused: boolean): FocusNode {
  return { kind: 'focus', id, child, focused };
}

function rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function _columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── focus() auto-annotation ──────────────────────────────────────────────────

describe('focus() auto-annotation', () => {
  it('auto-annotates focus node with label from child text', () => {
    const node = focus('f1', textNode('Submit'), false);
    const meta = getVNodeMeta(node);
    expect(meta).toBeDefined();
    expect(meta!.a11y?.label).toBe('Submit');
  });

  it('auto-annotates with label from nested child', () => {
    const node = focus('f1', rowNode(textNode('Save'), textNode('Now')), false);
    const meta = getVNodeMeta(node);
    expect(meta).toBeDefined();
    expect(meta!.a11y?.label).toBe('Save Now');
  });

  it('preserves explicit setVNodeMeta annotations', () => {
    const child = textNode('OK');
    setVNodeMeta(child, { testId: 'btn-ok', a11y: { role: 'button', label: 'OK' } });
    const node = focus('f1', child, false);
    const meta = getVNodeMeta(node);
    // Should have auto-annotated the focus node itself, not overwritten the child
    expect(meta!.a11y?.label).toBe('OK');
    // Child's explicit metadata should still be intact
    const childMeta = getVNodeMeta(child);
    expect(childMeta!.testId).toBe('btn-ok');
    expect(childMeta!.a11y?.role).toBe('button');
  });

  it('does not annotate focus nodes with empty text', () => {
    const node = focus('f1', emptyNode(), false);
    const meta = getVNodeMeta(node);
    expect(meta).toBeUndefined();
  });

  it('truncates long labels to 80 characters', () => {
    const longText = 'A'.repeat(120);
    const node = focus('f1', textNode(longText), false);
    const meta = getVNodeMeta(node);
    expect(meta!.a11y?.label).toHaveLength(80);
  });

  it('normalizes whitespace in labels', () => {
    const node = focus('f1', textNode('  Hello   World  '), false);
    const meta = getVNodeMeta(node);
    expect(meta!.a11y?.label).toBe('Hello World');
  });

  it('produces actions with labels from auto-annotated focus nodes', () => {
    const tree = focus('save-btn', textNode('Save'), true);
    const grid = makeCellGrid(['Save']);
    const snap = buildAutomationSnapshot(tree, grid, 4, 1);

    const action = snap.actions.find((a) => a.focusId === 'save-btn');
    expect(action).toBeDefined();
    expect(action!.label).toBe('Save');
  });

  it('works with boolean shorthand focus(id, child, focused)', () => {
    const node = focus('f1', textNode('Click'), true);
    const meta = getVNodeMeta(node);
    expect(meta!.a11y?.label).toBe('Click');
  });
});
