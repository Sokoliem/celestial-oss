// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { auditA11yTree, setVNodeMeta } from '../../automation.js';
import type { BoxNode, Cell, CellGrid, ColumnNode, EmptyNode, FocusNode, RowNode, TextNode, VNode } from '../../vdom.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeCell(char: string): Cell {
  return { char, style: {} };
}

function _makeCellGrid(lines: string[], width?: number): CellGrid {
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

function boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── auditA11yTree ──────────────────────────────────────────────────────────

describe('auditA11yTree', () => {
  it('passes all rules for a simple text node', () => {
    const node = textNode('Simple text');
    const result = auditA11yTree(node);

    expect(result.violations).toEqual([]);
    expect(result.passes.length).toBeGreaterThan(0);
  });

  it('passes interactive-elements-have-labels for labeled button', () => {
    const node = textNode('Submit');
    setVNodeMeta(node, { a11y: { role: 'button', label: 'Submit' } });

    const result = auditA11yTree(node);
    expect(result.passes).toContain('interactive-elements-have-labels');
  });

  it('reports violation for interactive element without label or text', () => {
    const node = emptyNode();
    setVNodeMeta(node, { a11y: { role: 'button' } });

    const result = auditA11yTree(node);
    const violation = result.violations.find((v) => v.rule === 'interactive-elements-have-labels');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
  });

  it('still audits disabled interactive elements for accessible labels', () => {
    const node = emptyNode();
    setVNodeMeta(node, { a11y: { role: 'menuitem', disabled: true } });

    const result = auditA11yTree(node);
    expect(result.violations.some((violation) => violation.rule === 'interactive-elements-have-labels')).toBe(true);
  });

  it('no interactive-labels violation when element has visible text', () => {
    const node = textNode('Click me');
    setVNodeMeta(node, { a11y: { role: 'button' } });

    const result = auditA11yTree(node);
    expect(result.passes).toContain('interactive-elements-have-labels');
  });

  it('reports heading level skip', () => {
    const h1 = textNode('Title');
    setVNodeMeta(h1, { a11y: { role: 'heading', level: 1 } });
    const h3 = textNode('SubTitle');
    setVNodeMeta(h3, { a11y: { role: 'heading', level: 3 } });

    const tree = columnNode(h1, h3);
    const result = auditA11yTree(tree);

    const violation = result.violations.find((v) => v.rule === 'heading-levels-sequential');
    expect(violation).toBeDefined();
    expect(violation!.message).toContain('1');
    expect(violation!.message).toContain('3');
  });

  it('passes heading-levels-sequential for sequential headings', () => {
    const h1 = textNode('Title');
    setVNodeMeta(h1, { a11y: { role: 'heading', level: 1 } });
    const h2 = textNode('Section');
    setVNodeMeta(h2, { a11y: { role: 'heading', level: 2 } });

    const tree = columnNode(h1, h2);
    const result = auditA11yTree(tree);

    expect(result.passes).toContain('heading-levels-sequential');
  });

  it('passes heading-levels-sequential for a single heading', () => {
    const h1 = textNode('Only One');
    setVNodeMeta(h1, { a11y: { role: 'heading', level: 1 } });

    const result = auditA11yTree(h1);
    expect(result.passes).toContain('heading-levels-sequential');
  });

  it('passes live-regions-have-politeness for valid live regions', () => {
    const node = textNode('Update');
    setVNodeMeta(node, { a11y: { live: 'polite' } });

    const result = auditA11yTree(node);
    expect(result.passes).toContain('live-regions-have-politeness');
  });

  it('skips hidden elements in interactive label check', () => {
    const node = emptyNode();
    setVNodeMeta(node, { a11y: { role: 'button', hidden: true } });

    const result = auditA11yTree(node);
    // Hidden elements should not trigger violations
    expect(result.violations.filter((v) => v.rule === 'interactive-elements-have-labels')).toEqual([]);
  });

  it('detects focus-visible issue for focused element with no content', () => {
    const child = emptyNode();
    const focus = focusNode('empty-focus', child, true);

    const result = auditA11yTree(focus);
    const violation = result.violations.find((v) => v.rule === 'focus-visible');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('warning');
  });

  it('passes focus-visible for focus node with styled text', () => {
    const child = textNode('> Item <');
    const focus = focusNode('styled-focus', child, true);

    const result = auditA11yTree(focus);
    expect(result.passes).toContain('focus-visible');
  });

  it('passes focus-visible with bracket indicators', () => {
    const child = textNode('[ Item ]');
    const focus = focusNode('bracket-focus', child, true);

    const result = auditA11yTree(focus);
    expect(result.passes).toContain('focus-visible');
  });

  it('passes focus-visible with arrow indicators', () => {
    const child = textNode('→ Item ←');
    const focus = focusNode('arrow-focus', child, true);

    const result = auditA11yTree(focus);
    expect(result.passes).toContain('focus-visible');
  });

  it('passes focus-visible with triangle indicators', () => {
    const child = textNode('▸ Item ◂');
    const focus = focusNode('tri-focus', child, true);

    const result = auditA11yTree(focus);
    expect(result.passes).toContain('focus-visible');
  });

  it('passes focus-visible for styled text nodes with bold/underline', () => {
    const child: TextNode = { kind: 'text', content: 'Styled', style: { bold: true } };
    const focus = focusNode('styled-f', child, true);

    const result = auditA11yTree(focus);
    expect(result.passes).toContain('focus-visible');
  });

  it('audits nested structures', () => {
    const btn = emptyNode();
    setVNodeMeta(btn, { a11y: { role: 'button' } });

    const wrapper = boxNode(columnNode(btn));
    const result = auditA11yTree(wrapper);

    expect(result.violations.some((v) => v.rule === 'interactive-elements-have-labels')).toBe(true);
  });

  it('does not apply a container foreground to descendant contrast checks', () => {
    const child: TextNode = { kind: 'text', content: 'Readable', style: { fg: '\x1b[37m' } };
    const tree: BoxNode = {
      kind: 'box',
      children: [child],
      style: { fg: '\x1b[30m', bg: '\x1b[40m' },
    };

    const result = auditA11yTree(tree);
    expect(result.violations.filter((violation) => violation.rule === 'color-contrast')).toEqual([]);
  });

  it('reports low contrast on an actual text leaf', () => {
    const tree: BoxNode = {
      kind: 'box',
      children: [{ kind: 'text', content: 'Low contrast', style: { fg: '\x1b[30m' } }],
      style: { bg: '\x1b[40m' },
    };

    const result = auditA11yTree(tree);
    expect(result.violations.filter((violation) => violation.rule === 'color-contrast')).toHaveLength(1);
  });

  it('audits inline ANSI foregrounds against an inherited box background', () => {
    const tree: BoxNode = {
      kind: 'box',
      children: [{ kind: 'text', content: '\x1b[37mReadable\x1b[0m' }],
      style: { fg: '\x1b[30m', bg: '\x1b[40m' },
    };

    const result = auditA11yTree(tree);
    expect(result.violations.filter((violation) => violation.rule === 'color-contrast')).toEqual([]);
  });

  it('handles heading levels going same or down', () => {
    const h2 = textNode('First');
    setVNodeMeta(h2, { a11y: { role: 'heading', level: 2 } });
    const h2b = textNode('Second');
    setVNodeMeta(h2b, { a11y: { role: 'heading', level: 2 } });
    const h1 = textNode('Third');
    setVNodeMeta(h1, { a11y: { role: 'heading', level: 1 } });

    const tree = columnNode(h2, h2b, h1);
    const result = auditA11yTree(tree);

    expect(result.passes).toContain('heading-levels-sequential');
  });
});
