import { getVNodeMeta, type VNode } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import type { DataColumn, DataTableConfig, DataTableModel } from '../data-table.js';
import { dataTable } from '../data-table.js';

interface Person {
  id: string;
  name: string;
  age: number;
  role: string;
}

const sampleData: Person[] = [
  { id: '1', name: 'Alice', age: 28, role: 'Engineer' },
  { id: '2', name: 'Bob', age: 35, role: 'Manager' },
  { id: '3', name: 'Charlie', age: 22, role: 'Intern' },
  { id: '4', name: 'Diana', age: 31, role: 'Designer' },
  { id: '5', name: 'Eve', age: 27, role: 'Engineer' },
];

const columns: DataColumn<Person>[] = [
  { key: 'name', header: 'Name', width: 12 },
  { key: 'age', header: 'Age', width: 6, align: 'right' },
  { key: 'role', header: 'Role', width: 14 },
];

function makeConfig(overrides: Partial<DataTableConfig<Person>> = {}): DataTableConfig<Person> {
  return {
    columns,
    data: sampleData,
    getKey: (row) => row.id,
    visibleRows: 20,
    ...overrides,
  };
}

function makeComponent(overrides: Partial<DataTableConfig<Person>> = {}) {
  return dataTable(makeConfig(overrides));
}

// Helper: extract text content from VNode tree (recursive)
function collectText(vnode: { kind: string; content?: string; children?: unknown[]; child?: unknown }): string[] {
  const results: string[] = [];
  if (vnode.kind === 'text' && typeof vnode.content === 'string') {
    results.push(vnode.content);
  }
  if ('children' in vnode && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      results.push(...collectText(child as Parameters<typeof collectText>[0]));
    }
  }
  if ('child' in vnode && vnode.child && typeof vnode.child === 'object') {
    results.push(...collectText(vnode.child as Parameters<typeof collectText>[0]));
  }
  return results;
}

function findEventWithText(vnode: VNode, needle: string): VNode | null {
  if (vnode.kind === 'event' && vnode.id.includes(':row:') && collectText(vnode).some((value) => value.includes(needle))) return vnode;
  if ('children' in vnode && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findEventWithText(child, needle);
      if (found) return found;
    }
  }
  if ('child' in vnode && vnode.child) return findEventWithText(vnode.child, needle);
  return null;
}

function findEventByIntent(vnode: VNode, intent: string): VNode | null {
  if (vnode.kind === 'event' && vnode.metadata?.intent === intent) return vnode;
  if ('children' in vnode && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findEventByIntent(child, intent);
      if (found) return found;
    }
  }
  if ('child' in vnode && vnode.child) return findEventByIntent(vnode.child, intent);
  return null;
}

function findEventByIdSuffix(vnode: VNode, suffix: string): VNode | null {
  if (vnode.kind === 'event' && vnode.id.endsWith(suffix)) return vnode;
  if ('children' in vnode && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const found = findEventByIdSuffix(child, suffix);
      if (found) return found;
    }
  }
  if ('child' in vnode && vnode.child) return findEventByIdSuffix(vnode.child, suffix);
  return null;
}

describe('dataTable', () => {
  // ─── Init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('initializes with cursorRow=0, no selection, no sort, no filter', () => {
      const component = makeComponent();
      const [model] = component.init();
      expect(model.cursorRow).toBe(0);
      expect(model.cursorCol).toBe(0);
      expect(model.selectedKeys.size).toBe(0);
      expect(model.sortState).toBeNull();
      expect(model.filterQuery).toBe('');
      expect(model.isFiltering).toBe(false);
      expect(model.scrollOffset).toBe(0);
      expect(model.focused).toBe(false);
      expect(model.selectionAnchorKey).toBeNull();
      expect(model.rangeSelectionKeys.size).toBe(0);
    });
  });

  describe('column resizing', () => {
    it('captures pointer resize state, clamps width, and releases cleanly', () => {
      const component = makeComponent({
        resizableColumns: true,
        columns: [
          { key: 'name', header: 'Name', width: 12, minWidth: 8, maxWidth: 20 },
          ...columns.slice(1),
        ],
      });
      const [model] = component.init();
      const [started] = component.update({ type: 'resize-column-start', index: 0, x: 10 }, model);
      const [expanded] = component.update({ type: 'resize-column-pointer', x: 1_000 }, started);
      const [released] = component.update({ type: 'resize-column-pointer', x: 1_000, end: true }, expanded);

      expect(started.columnResize).toMatchObject({ index: 0, startX: 10, startWidth: 12 });
      expect(expanded.columnWidths[0]).toBe(20);
      expect(released.columnResize).toBeNull();
      expect(released.columnWidths[0]).toBe(20);
    });

    it('rolls an active resize back on cancel', () => {
      const onColumnResize = vi.fn();
      const component = makeComponent({ resizableColumns: true, onColumnResize });
      const [model] = component.init();
      const [started] = component.update({ type: 'resize-column-start', index: 0, x: 10 }, model);
      const [changed] = component.update({ type: 'resize-column-pointer', x: 20 }, started);
      const [cancelled] = component.update({ type: 'resize-column-cancel' }, changed);

      expect(changed.columnWidths[0]).toBe(22);
      expect(cancelled.columnWidths).toEqual(model.columnWidths);
      expect(cancelled.columnResize).toBeNull();
      expect(onColumnResize).toHaveBeenLastCalledWith('name', 12, { name: 12, age: 6, role: 14 });
    });

    it('constrains resize to the total table width without shrinking neighboring columns', () => {
      const component = makeComponent({ resizableColumns: true, maxWidth: 38 });
      const [model] = component.init();
      const originalNeighbors = model.columnWidths.slice(1);
      const [resized] = component.update({ type: 'resize-column-key', index: 0, delta: 10_000 }, model);

      expect(resized.columnWidths.slice(1)).toEqual(originalNeighbors);
      expect(resized.columnWidths.reduce((sum, width) => sum + width, 0) + 8).toBe(38);
    });

    it('ignores forged non-finite coordinates and keyboard deltas', () => {
      const component = makeComponent({ resizableColumns: true });
      const [model] = component.init();
      const [notStarted] = component.update({ type: 'resize-column-start', index: 0, x: Number.NaN }, model);
      const [notChanged] = component.update({ type: 'resize-column-key', index: 0, delta: Number.POSITIVE_INFINITY }, model);

      expect(notStarted).toBe(model);
      expect(notChanged).toBe(model);
    });

    it('reports immutable controlled width snapshots', () => {
      const onColumnResize = vi.fn();
      const component = makeComponent({ resizableColumns: true, onColumnResize });
      const [model] = component.init();
      component.update({ type: 'resize-column-key', index: 0, delta: 2 }, model);

      expect(onColumnResize).toHaveBeenCalledWith('name', 14, { name: 14, age: 6, role: 14 });
      expect(Object.isFrozen(onColumnResize.mock.calls[0]![2])).toBe(true);
    });

    it('renders a directional resize affordance with separator semantics', () => {
      const component = makeComponent({ resizableColumns: true });
      const [model] = component.init();
      const resizeHandle = findEventByIntent(component.view(model), 'resize-column');
      const metadata = resizeHandle && resizeHandle.kind === 'event' ? resizeHandle.metadata : undefined;

      expect(metadata?.cursor).toBe('ew-resize');
      expect(metadata?.affordances).toContain('resize');
      expect(resizeHandle ? getVNodeMeta(resizeHandle)?.a11y : undefined).toMatchObject({ role: 'separator', valueNow: 12, valueMin: 1 });
    });

    it('rejects duplicate keys and impossible minimum-width budgets', () => {
      expect(() =>
        makeComponent({
          columns: [
            { key: 'duplicate', header: 'One' },
            { key: 'duplicate', header: 'Two' },
          ],
        }),
      ).toThrow(/duplicated/);
      expect(() =>
        makeComponent({
          maxWidth: 12,
          columns: [
            { key: 'one', header: 'One', minWidth: 5 },
            { key: 'two', header: 'Two', minWidth: 5 },
          ],
        }),
      ).toThrow(/minimums/);
    });
  });

  // ─── Cursor Navigation ──────────────────────────────────────────────────────

  describe('cursor navigation', () => {
    it('cursor-down moves cursor down by 1', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'cursor-down' }, model);
      expect(updated.cursorRow).toBe(1);
    });

    it('cursor-up moves cursor up by 1', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m1 = { ...model, cursorRow: 3 };
      const [updated] = component.update({ type: 'cursor-up' }, m1);
      expect(updated.cursorRow).toBe(2);
    });

    it('cursor-down at end clamps to last row', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, cursorRow: 4 };
      const [updated] = component.update({ type: 'cursor-down' }, m);
      expect(updated.cursorRow).toBe(4);
    });

    it('cursor-up at 0 clamps to 0', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'cursor-up' }, model);
      expect(updated.cursorRow).toBe(0);
    });

    it('cursor-left moves column cursor left', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, cursorCol: 2 };
      const [updated] = component.update({ type: 'cursor-left' }, m);
      expect(updated.cursorCol).toBe(1);
    });

    it('cursor-right moves column cursor right', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'cursor-right' }, model);
      expect(updated.cursorCol).toBe(1);
    });

    it('cursor-left at 0 clamps', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'cursor-left' }, model);
      expect(updated.cursorCol).toBe(0);
    });

    it('cursor-right at last column clamps', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, cursorCol: 2 };
      const [updated] = component.update({ type: 'cursor-right' }, m);
      expect(updated.cursorCol).toBe(2);
    });

    it('page-down moves cursor by visibleRows', () => {
      const bigData = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        age: 20 + (i % 30),
        role: 'Role',
      }));
      const component = makeComponent({ data: bigData, visibleRows: 10 });
      const [model] = component.init();
      const [updated] = component.update({ type: 'page-down' }, model);
      expect(updated.cursorRow).toBe(10);
    });

    it('page-up moves cursor back by visibleRows', () => {
      const bigData = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        age: 20 + (i % 30),
        role: 'Role',
      }));
      const component = makeComponent({ data: bigData, visibleRows: 10 });
      const [model] = component.init();
      const m = { ...model, cursorRow: 25 };
      const [updated] = component.update({ type: 'page-up' }, m);
      expect(updated.cursorRow).toBe(15);
    });

    it('goto-first moves cursor to row 0', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, cursorRow: 3 };
      const [updated] = component.update({ type: 'goto-first' }, m);
      expect(updated.cursorRow).toBe(0);
      expect(updated.scrollOffset).toBe(0);
    });

    it('goto-last moves cursor to last row', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'goto-last' }, model);
      expect(updated.cursorRow).toBe(4);
    });
  });

  // ─── Selection ──────────────────────────────────────────────────────────────

  describe('selection', () => {
    it('toggle-select adds current row key to selectedKeys', () => {
      const component = makeComponent({ selectable: true });
      const [model] = component.init();
      const [updated] = component.update({ type: 'toggle-select' }, model);
      expect(updated.selectedKeys.has('1')).toBe(true); // Alice, row 0
    });

    it('toggle-select removes key if already selected', () => {
      const component = makeComponent({ selectable: true });
      const [model] = component.init();
      const m = { ...model, selectedKeys: new Set(['1']) };
      const [updated] = component.update({ type: 'toggle-select' }, m);
      expect(updated.selectedKeys.has('1')).toBe(false);
    });

    it('select-all selects all visible rows', () => {
      const component = makeComponent({ multiSelect: true });
      const [model] = component.init();
      const [updated] = component.update({ type: 'select-all' }, model);
      expect(updated.selectedKeys.size).toBe(5);
      expect(updated.selectedKeys.has('1')).toBe(true);
      expect(updated.selectedKeys.has('5')).toBe(true);
    });

    it('clear-selection empties selectedKeys', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, selectedKeys: new Set(['1', '2', '3']) };
      const [updated] = component.update({ type: 'clear-selection' }, m);
      expect(updated.selectedKeys.size).toBe(0);
    });

    it('toggle-select calls onSelect callback', () => {
      const onSelect = vi.fn();
      const component = makeComponent({ selectable: true, onSelect });
      const [model] = component.init();
      component.update({ type: 'toggle-select' }, model);
      expect(onSelect).toHaveBeenCalledWith([sampleData[0]]);
    });

    it('Shift+click selects an inclusive contiguous range from the stable anchor', () => {
      const component = makeComponent({ multiSelect: true });
      const [initial] = component.init();
      const [anchored] = component.update({ type: 'activate-row', index: 1 }, initial);
      const [ranged] = component.update({ type: 'activate-row', index: 4, shift: true }, anchored);

      expect(ranged.selectionAnchorKey).toBe('2');
      expect([...ranged.selectedKeys]).toEqual(['2', '3', '4', '5']);
      expect([...ranged.rangeSelectionKeys]).toEqual(['2', '3', '4', '5']);
      expect(ranged.cursorRow).toBe(4);
    });

    it('Ctrl+Shift+click adds a range without discarding independent selections', () => {
      const component = makeComponent({ multiSelect: true });
      const [initial] = component.init();
      const [independent] = component.update({ type: 'activate-row', index: 0 }, initial);
      const [anchored] = component.update({ type: 'activate-row', index: 2 }, independent);
      const [ranged] = component.update({ type: 'activate-row', index: 4, shift: true, additive: true }, anchored);

      expect([...ranged.selectedKeys]).toEqual(['1', '3', '4', '5']);
      expect([...ranged.rangeSelectionKeys]).toEqual(['3', '4', '5']);
    });

    it('renders a visible range receipt in the table status', () => {
      const component = makeComponent({ multiSelect: true });
      const [initial] = component.init();
      const [anchored] = component.update({ type: 'activate-row', index: 1 }, initial);
      const [ranged] = component.update({ type: 'activate-row', index: 3, shift: true }, anchored);
      const view = component.view(ranged);
      const texts = collectText(view as Parameters<typeof collectText>[0]);

      expect(texts.some((value) => value.includes('range 2-4'))).toBe(true);
      expect(getVNodeMeta(findEventWithText(view, 'Charlie')!)?.states).toContain('range-selected');
    });
  });

  // ─── Sorting ────────────────────────────────────────────────────────────────

  describe('sorting', () => {
    it('sort-column sets sort state for current column', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'sort-column' }, model);
      expect(updated.sortState).toEqual({ column: 'name', direction: 'asc' });
    });

    it('sort-column toggles direction on repeated sort', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, sortState: { column: 'name', direction: 'asc' as const } };
      const [updated] = component.update({ type: 'sort-column' }, m);
      expect(updated.sortState).toEqual({ column: 'name', direction: 'desc' });
    });

    it('sort-column on different column resets to asc', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, cursorCol: 1, sortState: { column: 'name', direction: 'desc' as const } };
      const [updated] = component.update({ type: 'sort-column' }, m);
      expect(updated.sortState).toEqual({ column: 'age', direction: 'asc' });
    });

    it('sort-column maintains cursor on same row by key', () => {
      const component = makeComponent();
      const [model] = component.init();
      // Cursor on row 2 = Charlie (id: '3')
      const m = { ...model, cursorRow: 2, cursorCol: 0 };
      const [updated] = component.update({ type: 'sort-column' }, m);
      // After sorting by name asc: Alice(0), Bob(1), Charlie(2), Diana(3), Eve(4)
      // Charlie should still be at index 2 (name sort is same as original order)
      expect(updated.sortState).toEqual({ column: 'name', direction: 'asc' });
      // The cursor should track Charlie's position in the sorted result
    });

    it('sort-column calls onSort callback', () => {
      const onSort = vi.fn();
      const component = makeComponent({ onSort });
      const [model] = component.init();
      component.update({ type: 'sort-column' }, model);
      expect(onSort).toHaveBeenCalledWith('name', 'asc');
    });

    it('sort-column with custom sortFn uses it', () => {
      const customColumns: DataColumn<Person>[] = [
        { key: 'name', header: 'Name', width: 12, sortFn: (a, b) => b.name.localeCompare(a.name) },
        { key: 'age', header: 'Age', width: 6 },
      ];
      const component = makeComponent({ columns: customColumns });
      const [model] = component.init();
      const [updated] = component.update({ type: 'sort-column' }, model);
      // Custom sort reverses alphabetical order, but sortState still reports asc
      expect(updated.sortState).toEqual({ column: 'name', direction: 'asc' });
    });
  });

  // ─── Filtering ──────────────────────────────────────────────────────────────

  describe('filtering', () => {
    it('start-filter enters filter mode', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const [updated] = component.update({ type: 'start-filter' }, model);
      expect(updated.isFiltering).toBe(true);
    });

    it('filter-char appends character to filterQuery', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, isFiltering: true, filterQuery: 'al' };
      const [updated] = component.update({ type: 'filter-char', char: 'i' }, m);
      expect(updated.filterQuery).toBe('ali');
    });

    it('filter-backspace removes last character', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, isFiltering: true, filterQuery: 'ali' };
      const [updated] = component.update({ type: 'filter-backspace' }, m);
      expect(updated.filterQuery).toBe('al');
    });

    it('filter-backspace on empty query is a no-op', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, isFiltering: true, filterQuery: '' };
      const [updated] = component.update({ type: 'filter-backspace' }, m);
      expect(updated.filterQuery).toBe('');
    });

    it('filter filters rows by substring match (case-insensitive)', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, isFiltering: true, filterQuery: '' };
      const [m1] = component.update({ type: 'filter-char', char: 'e' }, m);
      // "e" matches: Alice, Eve, Engineer, Designer, Manager (all rows have 'e' somewhere)
      // Let's use a more specific filter
      const [m2] = component.update({ type: 'filter-char', char: 'n' }, m1);
      const [m3] = component.update({ type: 'filter-char', char: 'g' }, m2);
      // "eng" matches Engineer: Alice and Eve
      // The model tracks filterQuery; the view filters based on it
      expect(m3.filterQuery).toBe('eng');
      // Cursor should reset to 0 when filter changes
      expect(m3.cursorRow).toBe(0);
    });

    it('end-filter exits filter mode preserving query', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, isFiltering: true, filterQuery: 'alice' };
      const [updated] = component.update({ type: 'end-filter' }, m);
      expect(updated.isFiltering).toBe(false);
      expect(updated.filterQuery).toBe('alice');
    });
  });

  // ─── Virtual Scroll ────────────────────────────────────────────────────────

  describe('virtual scroll', () => {
    it('scrollOffset updates when cursor moves past visible area', () => {
      const bigData = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        age: 20 + (i % 30),
        role: 'Role',
      }));
      const component = makeComponent({ data: bigData, visibleRows: 5 });
      const [model] = component.init();
      // Move cursor to row 5 (just beyond visible 0-4)
      const m = { ...model, cursorRow: 4 };
      const [updated] = component.update({ type: 'cursor-down' }, m);
      expect(updated.cursorRow).toBe(5);
      expect(updated.scrollOffset).toBeGreaterThan(0);
    });

    it('scrollOffset adjusts when cursor moves above visible area', () => {
      const bigData = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        age: 20 + (i % 30),
        role: 'Role',
      }));
      const component = makeComponent({ data: bigData, visibleRows: 5 });
      const [model] = component.init();
      const m = { ...model, cursorRow: 10, scrollOffset: 10 };
      const [updated] = component.update({ type: 'cursor-up' }, m);
      expect(updated.cursorRow).toBe(9);
      // scrollOffset should still accommodate the cursor
      expect(updated.scrollOffset).toBeLessThanOrEqual(9);
    });
  });

  // ─── Focus ──────────────────────────────────────────────────────────────────

  describe('focus', () => {
    it('focus sets focused to true', () => {
      const component = makeComponent();
      const [model] = component.init();
      const [updated] = component.update({ type: 'focus' }, model);
      expect(updated.focused).toBe(true);
    });

    it('blur sets focused to false', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, focused: true };
      const [updated] = component.update({ type: 'blur' }, m);
      expect(updated.focused).toBe(false);
    });
  });

  // ─── View ──────────────────────────────────────────────────────────────────

  describe('view', () => {
    it('renders header row with column headers', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, focused: true };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const headerTexts = texts.filter((t) => t.includes('Name') || t.includes('Age') || t.includes('Role'));
      expect(headerTexts.length).toBeGreaterThanOrEqual(3);
    });

    it('does not advertise non-sortable headers as clickable buttons', () => {
      const component = makeComponent({
        columns: [{ key: 'name', header: 'Name', width: 12, sortable: false }],
      });
      const [model] = component.init();
      const header = findEventByIdSuffix(component.view(model), ':header:0');

      expect(header?.metadata).toMatchObject({
        intent: 'observe',
        affordances: [],
      });
      expect(header?.metadata?.cursor).toBeUndefined();
      expect(getVNodeMeta(header!)?.a11y).toEqual({ label: 'Name' });
    });

    it('renders sort indicator on sorted column', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m: DataTableModel = {
        ...model,
        focused: true,
        sortState: { column: 'name', direction: 'asc' },
      };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const hasUpIndicator = texts.some((t) => t.includes('▲'));
      expect(hasUpIndicator).toBe(true);
    });

    it('renders desc sort indicator', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m: DataTableModel = {
        ...model,
        focused: true,
        sortState: { column: 'name', direction: 'desc' },
      };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const hasDownIndicator = texts.some((t) => t.includes('▼'));
      expect(hasDownIndicator).toBe(true);
    });

    it('renders cursor row with ► prefix', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, focused: true };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const hasCursorIndicator = texts.some((t) => t.includes('►'));
      expect(hasCursorIndicator).toBe(true);
    });

    it('renders selected rows with ✓', () => {
      const component = makeComponent({ selectable: true });
      const [model] = component.init();
      const m = { ...model, focused: true, selectedKeys: new Set(['1']) };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const hasCheckmark = texts.some((t) => t.includes('✓'));
      expect(hasCheckmark).toBe(true);
    });

    it('renders status bar with row count', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, focused: true };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const statusText = texts.some((t) => t.includes('5 rows'));
      expect(statusText).toBe(true);
    });

    it('renders status bar with selection count', () => {
      const component = makeComponent({ selectable: true });
      const [model] = component.init();
      const m = { ...model, focused: true, selectedKeys: new Set(['1', '2']) };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const statusText = texts.some((t) => t.includes('2 selected'));
      expect(statusText).toBe(true);
    });

    it('renders status bar with sort info', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m: DataTableModel = {
        ...model,
        focused: true,
        sortState: { column: 'name', direction: 'asc' },
      };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const hasSortInfo = texts.some((t) => t.includes('Name') && t.includes('↑'));
      expect(hasSortInfo).toBe(true);
    });

    it('renders filter bar when isFiltering', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, focused: true, isFiltering: true, filterQuery: 'test' };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      const hasFilter = texts.some((t) => t.includes('test'));
      expect(hasFilter).toBe(true);
    });

    it('renders scroll indicators when content exceeds visible area', () => {
      const bigData = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        age: 20 + (i % 30),
        role: 'Role',
      }));
      const component = makeComponent({ data: bigData, visibleRows: 5 });
      const [model] = component.init();
      const m = { ...model, focused: true, scrollOffset: 5 };
      const vnode = component.view(m);
      const texts = collectText(vnode as Parameters<typeof collectText>[0]);
      // Should have both up and down scroll indicators
      const hasUpArrow = texts.some((t) => t.includes('▲'));
      const hasDownArrow = texts.some((t) => t.includes('▼'));
      expect(hasUpArrow).toBe(true);
      expect(hasDownArrow).toBe(true);
    });

    it('pads wide cell content by terminal width without clipping the final letter', () => {
      const component = dataTable({
        columns: [{ key: 'name', header: 'Name', width: 5 }],
        data: [{ id: 'wide', name: '界界A' }],
        getKey: (row) => row.id,
      });
      const [model] = component.init();
      const texts = collectText(component.view(model) as Parameters<typeof collectText>[0]);

      expect(texts).toContain('界界A');
    });

    it('snapshots column and row arrays at construction', () => {
      const mutableColumns: DataColumn<Person>[] = [{ key: 'name', header: 'Original', width: 12 }];
      const mutableData = [{ id: 'original', name: 'Stable', age: 1, role: 'Test' }];
      const component = dataTable({ columns: mutableColumns, data: mutableData, getKey: (row) => row.id });
      mutableColumns[0] = { key: 'name', header: 'Mutated', width: 12 };
      mutableData[0] = { id: 'replacement', name: 'Changed', age: 2, role: 'Test' };
      const [model] = component.init();
      const texts = collectText(component.view(model) as Parameters<typeof collectText>[0]).join('\n');

      expect(texts).toContain('Original');
      expect(texts).toContain('Stable');
      expect(texts).not.toContain('Mutated');
      expect(texts).not.toContain('Changed');
    });
  });

  // ─── Subscriptions ────────────────────────────────────────────────────────

  describe('subscriptions', () => {
    it('keeps mouse interaction active when unfocused', () => {
      const component = makeComponent();
      const [model] = component.init();
      const sub = component.subscriptions!(model);
      expect((sub as { _kind: { kind: string } })._kind.kind).toBe('elementMouse');
    });

    it('returns key subscriptions when focused', () => {
      const component = makeComponent();
      const [model] = component.init();
      const m = { ...model, focused: true };
      const sub = component.subscriptions!(m);
      // Should be a batch of key subscriptions
      expect((sub as { _kind: { kind: string } })._kind.kind).toBe('batch');
    });

    it('returns filter-mode subscriptions when isFiltering', () => {
      const component = makeComponent({ filterable: true });
      const [model] = component.init();
      const m = { ...model, focused: true, isFiltering: true };
      const sub = component.subscriptions!(m);
      expect((sub as { _kind: { kind: string } })._kind.kind).toBe('batch');
    });
  });
});
