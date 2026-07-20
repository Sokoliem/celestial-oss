// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { type AutomationActionSnapshot, type AutomationSnapshot, fingerprintAutomationSnapshot } from '../../automation.js';
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

function _textNode(content: string): TextNode {
  return { kind: 'text', content };
}

function _focusNode(id: string, child: VNode, focused: boolean): FocusNode {
  return { kind: 'focus', id, child, focused };
}

function _rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function _columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function _emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── fingerprintAutomationSnapshot ──────────────────────────────────────────

describe('fingerprintAutomationSnapshot', () => {
  it('returns a hex string', () => {
    const snap: AutomationSnapshot = {
      text: 'Hello',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const fp = fingerprintAutomationSnapshot(snap);
    expect(fp).toMatch(/^[a-f0-9]{40}$/);
  });

  it('produces same fingerprint for identical snapshots', () => {
    const snap1: AutomationSnapshot = {
      text: 'Hello',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const snap2: AutomationSnapshot = {
      text: 'Hello',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    expect(fingerprintAutomationSnapshot(snap1)).toBe(fingerprintAutomationSnapshot(snap2));
  });

  it('produces different fingerprint for different text', () => {
    const base: AutomationSnapshot = {
      text: 'Hello',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const different: AutomationSnapshot = {
      ...base,
      text: 'World',
    };
    expect(fingerprintAutomationSnapshot(base)).not.toBe(fingerprintAutomationSnapshot(different));
  });

  it('produces different fingerprint for different focusedActionId', () => {
    const base: AutomationSnapshot = {
      text: 'Same',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const withFocus: AutomationSnapshot = {
      ...base,
      focusedActionId: 'focus:btn-1',
    };
    expect(fingerprintAutomationSnapshot(base)).not.toBe(fingerprintAutomationSnapshot(withFocus));
  });

  it('produces different fingerprint for different actions', () => {
    const action: AutomationActionSnapshot = {
      id: 'focus:a1',
      label: 'Click',
      text: 'Click',
      row: 0,
      col: 0,
      width: 5,
      height: 1,
      role: 'button',
      focused: false,
      source: 'focus',
    };
    const snap1: AutomationSnapshot = {
      text: 'Click',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [action],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const snap2: AutomationSnapshot = {
      text: 'Click',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [{ ...action, focused: true }],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    expect(fingerprintAutomationSnapshot(snap1)).not.toBe(fingerprintAutomationSnapshot(snap2));
  });

  it('ignores audit differences in fingerprint', () => {
    const base: AutomationSnapshot = {
      text: 'Same',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const withAudit: AutomationSnapshot = {
      ...base,
      audit: {
        violations: [
          {
            rule: 'focus-visible',
            message: 'test',
            element: 'test',
            severity: 'warning',
          },
        ],
        passes: ['interactive-elements-have-labels'],
      },
    };
    // Audit data is not included in fingerprint hash
    expect(fingerprintAutomationSnapshot(base)).toBe(fingerprintAutomationSnapshot(withAudit));
  });

  it('ignores size and element differences in fingerprint', () => {
    const base: AutomationSnapshot = {
      text: 'Same',
      size: { cols: 10, rows: 1 },
      elements: [],
      actions: [],
      focusedActionId: null,
      audit: { violations: [], passes: [] },
    };
    const different: AutomationSnapshot = {
      ...base,
      size: { cols: 80, rows: 24 },
      elements: [
        {
          id: 'test',
          text: 'test',
          row: 0,
          col: 0,
          width: 4,
          height: 1,
          focused: false,
        },
      ],
    };
    expect(fingerprintAutomationSnapshot(base)).toBe(fingerprintAutomationSnapshot(different));
  });
});
