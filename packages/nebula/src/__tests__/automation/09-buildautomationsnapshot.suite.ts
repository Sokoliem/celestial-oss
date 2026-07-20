// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildAutomationSnapshot, setVNodeMeta } from '../../automation.js';
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

function rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function _emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── buildAutomationSnapshot ────────────────────────────────────────────────

describe('buildAutomationSnapshot', () => {
  it('returns correct size', () => {
    const tree = textNode('Hi');
    const grid = makeCellGrid(['Hi']);
    const snap = buildAutomationSnapshot(tree, grid, 80, 24);

    expect(snap.size.cols).toBe(80);
    expect(snap.size.rows).toBe(24);
  });

  it('populates text from grid', () => {
    const tree = textNode('Hello');
    const grid = makeCellGrid(['Hello']);
    const snap = buildAutomationSnapshot(tree, grid, 5, 1);

    expect(snap.text).toBe('Hello');
  });

  it('includes audit result', () => {
    const tree = textNode('Accessible');
    const grid = makeCellGrid(['Accessible']);
    const snap = buildAutomationSnapshot(tree, grid, 10, 1);

    expect(snap.audit).toBeDefined();
    expect(Array.isArray(snap.audit.violations)).toBe(true);
    expect(Array.isArray(snap.audit.passes)).toBe(true);
  });

  it('sets focusedActionId for focused action', () => {
    const child = textNode('Focused');
    const focus = focusNode('f-active', child, true);

    const grid = makeCellGrid(['Focused']);
    const snap = buildAutomationSnapshot(focus, grid, 7, 1);

    expect(snap.focusedActionId).toBe('focus:f-active');
  });

  it('sets focusedActionId to null when nothing focused', () => {
    const child = textNode('Unfocused');
    const focus = focusNode('f-idle', child, false);

    const grid = makeCellGrid(['Unfocused']);
    const snap = buildAutomationSnapshot(focus, grid, 9, 1);

    expect(snap.focusedActionId).toBeNull();
  });

  it('includes elements with roles', () => {
    const child = textNode('Menu Item');
    setVNodeMeta(child, { a11y: { role: 'menuitem', label: 'File' } });
    const focus = focusNode('m1', child, false);

    const grid = makeCellGrid(['Menu Item']);
    const snap = buildAutomationSnapshot(focus, grid, 9, 1);

    expect(snap.elements.some((e) => e.role === 'menuitem')).toBe(true);
  });

  it('uses the layout rectangle for an annotated composite widget', () => {
    const slider = rowNode(textNode('Density '), textNode('###########'), textNode(' 50'));
    setVNodeMeta(slider, { testId: 'density', a11y: { role: 'slider', label: 'Density' } });
    const tree = rowNode(textNode('prefix '), slider, textNode(' trailing'));
    const grid = makeCellGrid(['prefix Density ########### 50 trailing'], 40);
    const snap = buildAutomationSnapshot(tree, grid, 40, 1);
    const element = snap.elements.find((candidate) => candidate.testId === 'density');

    expect(element).toMatchObject({ row: 0, col: 7, width: 22, height: 1 });
  });

  it('treats checkbox, radio, and listbox annotations as actions without focus nodes', () => {
    const checkbox = textNode('[x] Notifications');
    setVNodeMeta(checkbox, { a11y: { role: 'checkbox', label: 'Notifications', checked: true } });

    const radio = textNode('(o) Balanced');
    setVNodeMeta(radio, { a11y: { role: 'radio', label: 'Balanced', selected: true } });

    const listbox = textNode('[ Slow | Balanced | Fast ]');
    setVNodeMeta(listbox, { a11y: { role: 'listbox', label: 'Mode' } });

    const tree = columnNode(checkbox, radio, listbox);
    const grid = makeCellGrid(['[x] Notifications', '(o) Balanced', '[ Slow | Balanced | Fast ]']);
    const snap = buildAutomationSnapshot(tree, grid, 27, 3);

    expect(snap.actions.some((action) => action.role === 'checkbox' && action.label === 'Notifications')).toBe(true);
    expect(snap.actions.some((action) => action.role === 'radio' && action.label === 'Balanced')).toBe(true);
    expect(snap.actions.some((action) => action.role === 'listbox' && action.label === 'Mode')).toBe(true);
  });

  it('handles complex tree with multiple elements and actions', () => {
    const btn1 = textNode('Save');
    setVNodeMeta(btn1, { a11y: { role: 'button', label: 'Save' } });
    const btn2 = textNode('Cancel');
    setVNodeMeta(btn2, { a11y: { role: 'button', label: 'Cancel' } });

    const f1 = focusNode('save-f', btn1, true);
    const f2 = focusNode('cancel-f', btn2, false);

    const tree = rowNode(f1, f2);
    const grid = makeCellGrid(['Save Cancel']);
    const snap = buildAutomationSnapshot(tree, grid, 11, 1);

    expect(snap.elements.length).toBeGreaterThanOrEqual(2);
    expect(snap.actions.length).toBeGreaterThanOrEqual(2);
    expect(snap.focusedActionId).toBe('focus:save-f');
  });
});
