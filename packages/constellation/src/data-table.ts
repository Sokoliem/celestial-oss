import { selectListRange } from '@celestial/core';
import type { Color, SemanticTheme, StateToken, TableTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { alignmentForType, autoSizeColumns, border, formatCell as coronaFormatCell, detectColumnType, style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { padCellText } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, MAX_RENDER_CELLS, positiveInteger, wheelDirection } from './internal.js';
import { applyState, applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface DataTableTokens {
  header: Color;
  row: Color;
  altRow: Color;
  altBg: Color;
  border: Color;
  divider: Color;
  selected: Color;
  sortIndicator: Color;
  headerStyle: TypographyToken;
  captionStyle: TypographyToken;
  hoverState: StateToken;
  selectedState: StateToken;
  rangeState: StateToken;
}

export const dataTableContract: TokenContract<DataTableTokens> = {
  header: (t: SemanticTheme) => t.colors.text,
  row: (t: SemanticTheme) => t.colors.text,
  altRow: (t: SemanticTheme) => t.colors.textSoft,
  altBg: (t: SemanticTheme) => t.colors.surfaceAlt,
  border: (t: SemanticTheme) => t.colors.border,
  divider: (t: SemanticTheme) => t.colors.divider,
  selected: (t: SemanticTheme) => t.colors.highlight,
  sortIndicator: (t: SemanticTheme) => t.colors.highlight,
  headerStyle: (t: SemanticTheme) => t.typography.label,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
  hoverState: (t: SemanticTheme) => t.states.hover,
  selectedState: (t: SemanticTheme) => t.states.selected,
  rangeState: (t: SemanticTheme) => t.states.active,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DataColumn<T> {
  key: string;
  header: string;
  width?: number;
  /** Minimum interactive width in cells. Defaults to 1. */
  minWidth?: number;
  /** Maximum interactive width in cells. Defaults to the render budget. */
  maxWidth?: number;
  /** Override table-level column resizing for this column. */
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (value: unknown, row: T) => string;
  sortFn?: (a: T, b: T) => number;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface DataTableConfig<T> {
  columns: DataColumn<T>[];
  data: T[];
  getKey: (row: T) => string;
  visibleRows?: number;
  selectable?: boolean;
  multiSelect?: boolean;
  filterable?: boolean;
  onSelect?: (rows: T[]) => void;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
  /** Table title displayed above the header */
  title?: string;
  /** Enable zebra striping (alternating row backgrounds) */
  zebra?: boolean;
  /** Show row numbers as the first column */
  rowNumbers?: boolean;
  /** Auto-calculate column widths from data (default: false) */
  autoSize?: boolean;
  /** Placeholder for empty cells (default: '—') */
  emptyPlaceholder?: string;
  /** Cycle header colors across columns */
  cyclingHeaderColors?: boolean;
  /** Auto-detect numeric columns and format them */
  formatNumbers?: boolean;
  /** Decimal places for float formatting (default: 3) */
  numberDigits?: number;
  /** Table theme with cycling colors (overrides token colors) */
  tableTheme?: TableTheme;
  /** Enable pointer and keyboard column resizing. Defaults to false. */
  resizableColumns?: boolean;
  /** Keyboard resize stride in cells. Defaults to 1. */
  columnResizeStep?: number;
  /** Optional total table-width cap, including dividers and row chrome. */
  maxWidth?: number;
  /** Called after a constrained width change. */
  onColumnResize?: (column: string, width: number, widths: Readonly<Record<string, number>>) => void;
}

export interface DataTableColumnResize {
  readonly index: number;
  readonly startX: number;
  readonly startWidth: number;
  readonly originalWidths: readonly number[];
}

export interface DataTableModel {
  cursorRow: number;
  cursorCol: number;
  selectedKeys: Set<string>;
  sortState: SortState | null;
  filterQuery: string;
  isFiltering: boolean;
  scrollOffset: number;
  focused: boolean;
  hoveredRow?: number | null;
  hoveredHeader?: number | null;
  /** Stable row key that anchors the next Shift+click range. */
  selectionAnchorKey: string | null;
  /** Keys added by the latest contiguous range gesture. */
  rangeSelectionKeys: Set<string>;
  /** Controlled widths keyed by the stable column order. */
  columnWidths: readonly number[];
  /** Active pointer resize session, captured until release or Escape. */
  columnResize: DataTableColumnResize | null;
  hoveredResizeHandle?: number | null;
}

export type DataTableMsg =
  | Msg<'cursor-down'>
  | Msg<'cursor-up'>
  | Msg<'cursor-left'>
  | Msg<'cursor-right'>
  | Msg<'page-down'>
  | Msg<'page-up'>
  | Msg<'goto-first'>
  | Msg<'goto-last'>
  | Msg<'toggle-select'>
  | Msg<'activate-row', { index: number; shift?: boolean; additive?: boolean }>
  | Msg<'hover-row', { index: number }>
  | Msg<'hover-header', { index: number }>
  | Msg<'hover-resize-handle', { index: number }>
  | Msg<'resize-column-start', { index: number; x: number }>
  | Msg<'resize-column-pointer', { x: number; end?: boolean }>
  | Msg<'resize-column-key', { index: number; delta: number }>
  | Msg<'resize-column-cancel'>
  | Msg<'reset-column-widths'>
  | Msg<'leave-hover'>
  | Msg<'select-all'>
  | Msg<'clear-selection'>
  | Msg<'sort-column'>
  | Msg<'sort-at', { index: number }>
  | Msg<'start-filter'>
  | Msg<'filter-char', { char: string }>
  | Msg<'filter-backspace'>
  | Msg<'end-filter'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : min;
}

/** Get the value of a column key from a row object */
function getCellValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/** Format a cell value as a string */
function formatCell<T>(col: DataColumn<T>, row: T): string {
  const value = getCellValue(row, col.key);
  if (col.render) return String(col.render(value, row) ?? '');
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Filter data rows by substring match across all columns (case-insensitive) */
function filterRows<T>(data: T[], columns: DataColumn<T>[], query: string): T[] {
  if (!query) return data;
  const lowerQuery = query.toLowerCase();
  return data.filter((row) =>
    columns.some((col) => {
      const cellText = formatCell(col, row);
      return cellText.toLowerCase().includes(lowerQuery);
    }),
  );
}

/** Sort data rows by a column */
function sortRows<T>(data: T[], columns: DataColumn<T>[], sortState: SortState): T[] {
  const col = columns.find((c) => c.key === sortState.column);
  if (!col) return data;

  const sorted = [...data];
  const dir = sortState.direction === 'asc' ? 1 : -1;

  if (col.sortFn) {
    sorted.sort((a, b) => dir * col.sortFn!(a, b));
  } else {
    sorted.sort((a, b) => {
      const av = getCellValue(a, col.key);
      const bv = getCellValue(b, col.key);
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir * (av - bv);
      }
      return dir * String(av ?? '').localeCompare(String(bv ?? ''));
    });
  }

  return sorted;
}

/** Get the processed (filtered + sorted) rows */
function getProcessedRows<T>(data: T[], columns: DataColumn<T>[], filterQuery: string, sortState: SortState | null): T[] {
  let rows = filterRows(data, columns, filterQuery);
  if (sortState) {
    rows = sortRows(rows, columns, sortState);
  }
  return rows;
}

/** Ensure scrollOffset keeps cursor visible within the viewport */
function ensureCursorVisible(cursorRow: number, scrollOffset: number, visibleRows: number): number {
  if (cursorRow < scrollOffset) return cursorRow;
  if (cursorRow >= scrollOffset + visibleRows) return cursorRow - visibleRows + 1;
  return scrollOffset;
}

/** Pad or truncate a string to a specific width, respecting alignment */
function padCell(content: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  return padCellText(content, positiveInteger(width, 1), { align });
}

function fitColumnWidths(widths: readonly number[], minimums: readonly number[], overhead: number, maxTotalWidth = MAX_RENDER_CELLS): number[] {
  const budget = Math.max(0, Math.min(MAX_RENDER_CELLS, positiveInteger(maxTotalWidth, MAX_RENDER_CELLS)) - overhead);
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= budget) return [...widths];
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0);
  if (minimumTotal > budget) {
    throw new RangeError(`DataTable maxWidth cannot fit the configured column minimums (${minimumTotal + overhead} cells required).`);
  }
  const fitted = [...widths];
  let excess = total - budget;
  const shrinkable = widths.map((width, index) => Math.max(0, width - minimums[index]!));
  const shrinkableTotal = shrinkable.reduce((sum, width) => sum + width, 0);
  for (let index = 0; index < fitted.length; index++) {
    const reduction = Math.min(shrinkable[index]!, Math.floor((excess * shrinkable[index]!) / shrinkableTotal));
    fitted[index]! -= reduction;
  }
  excess = fitted.reduce((sum, width) => sum + width, 0) - budget;
  for (let index = 0; index < fitted.length && excess > 0; index++) {
    const reduction = Math.min(excess, fitted[index]! - minimums[index]!);
    fitted[index]! -= reduction;
    excess -= reduction;
  }
  return fitted;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function dataTable<T>(config: DataTableConfig<T>): ComponentDescriptor<DataTableModel, DataTableMsg> {
  const columns = config.columns.map((column) => ({ ...column }));
  const data = [...config.data];
  const { getKey, selectable = true, multiSelect = false, filterable = false, onSelect, onSort, onColumnResize } = config;
  if (columns.length === 0) throw new Error('DataTable requires at least one column.');
  if (columns.length > 1_000) throw new RangeError('DataTable supports at most 1,000 columns.');
  const columnKeys = new Set<string>();
  for (const column of columns) {
    if (column.key.length === 0) throw new Error('DataTable column keys must not be empty.');
    if (columnKeys.has(column.key)) throw new Error(`DataTable column key "${column.key}" is duplicated.`);
    columnKeys.add(column.key);
  }
  const visibleRows = positiveInteger(config.visibleRows, 20);
  const interactionId = generateFocusGroupId('data-table');
  const rowTag = `${interactionId}:row`;
  const sortTag = `${interactionId}:sort`;
  const scrollTag = `${interactionId}:scroll`;
  const hoverRowTag = `${interactionId}:hover-row`;
  const hoverHeaderTag = `${interactionId}:hover-header`;
  const leaveHoverTag = `${interactionId}:leave-hover`;
  const resizeStartTag = `${interactionId}:resize-start`;
  const hoverResizeTag = `${interactionId}:hover-resize`;
  const resizableColumns = config.resizableColumns === true;
  const resizeStep = positiveInteger(config.columnResizeStep, 1);
  const tableOverhead = (columns.length - 1) * 3 + 2 + (config.rowNumbers ? 7 : 0);
  const renderWidthLimit = positiveInteger(config.maxWidth, MAX_RENDER_CELLS);

  function columnBounds(index: number): { min: number; max: number } {
    const column = columns[index]!;
    const min = positiveInteger(column.minWidth, 1);
    const max = Math.max(min, positiveInteger(column.maxWidth, MAX_RENDER_CELLS));
    return { min, max };
  }

  function canResizeColumn(index: number): boolean {
    const column = columns[index];
    return Boolean(column && (column.resizable ?? resizableColumns));
  }

  function initialColumnWidths(): number[] {
    let widths: number[];
    if (config.autoSize) {
      const autoColumnTypes = config.formatNumbers
        ? columns.map((column) => detectColumnType(data.map((rowData) => String(getCellValue(rowData, column.key) ?? ''))))
        : null;
      widths = autoSizeColumns(
        columns.map((column) => column.header),
        data.map((rowData) =>
          columns.map((column, index) => {
            const cellText = formatCell(column, rowData);
            return autoColumnTypes
              ? coronaFormatCell(cellText, autoColumnTypes[index]!, {
                  digits: config.numberDigits ?? 3,
                  placeholder: config.emptyPlaceholder ?? '—',
                })
              : cellText;
          })),
        Math.min(120, positiveInteger(config.maxWidth, 120)),
      ).finalWidths;
    } else {
      widths = columns.map((column) => positiveInteger(column.width, 10));
    }
    const bounded = widths.map((width, index) => {
      const bounds = columnBounds(index);
      return clamp(width, bounds.min, bounds.max);
    });
    return fitColumnWidths(bounded, columns.map((_, index) => columnBounds(index).min), tableOverhead, renderWidthLimit);
  }

  const defaultColumnWidths = initialColumnWidths();

  function normalizeColumnWidths(widths: readonly number[] | undefined): number[] {
    const bounded = columns.map((_, index) => {
      const bounds = columnBounds(index);
      return clamp(widths?.[index] ?? defaultColumnWidths[index]!, bounds.min, bounds.max);
    });
    return fitColumnWidths(bounded, columns.map((_, index) => columnBounds(index).min), tableOverhead, renderWidthLimit);
  }

  function widthSnapshot(widths: readonly number[]): Readonly<Record<string, number>> {
    return Object.freeze(Object.fromEntries(columns.map((column, index) => [column.key, widths[index]!])) as Record<string, number>);
  }

  function resizeColumn(model: DataTableModel, index: number, requested: number): DataTableModel {
    if (!canResizeColumn(index)) return model;
    const widths = normalizeColumnWidths(model.columnWidths);
    const bounds = columnBounds(index);
    const available = renderWidthLimit - tableOverhead - widths.reduce((sum, width, widthIndex) => widthIndex === index ? sum : sum + width, 0);
    const nextWidth = clamp(requested, bounds.min, Math.max(bounds.min, Math.min(bounds.max, available)));
    if (widths[index] === nextWidth) return model;
    widths[index] = nextWidth;
    onColumnResize?.(columns[index]!.key, nextWidth, widthSnapshot(widths));
    return { ...model, columnWidths: widths };
  }

  /** Find the index of a row key in the processed row list */
  function findRowIndex(rows: T[], key: string): number {
    const idx = rows.findIndex((r) => getKey(r) === key);
    return idx >= 0 ? idx : 0;
  }

  return {
    init(): [DataTableModel, Cmd<DataTableMsg>] {
      return [
        {
          cursorRow: 0,
          cursorCol: 0,
          selectedKeys: new Set(),
          sortState: null,
          filterQuery: '',
          isFiltering: false,
          scrollOffset: 0,
          focused: false,
          selectionAnchorKey: null,
          rangeSelectionKeys: new Set(),
          columnWidths: [...defaultColumnWidths],
          columnResize: null,
        },
        Cmd.none(),
      ];
    },

    update(msg: DataTableMsg, model: DataTableModel): [DataTableModel, Cmd<DataTableMsg>] {
      const processedRows = getProcessedRows(data, columns, model.filterQuery, model.sortState);
      const maxRow = Math.max(0, processedRows.length - 1);
      const maxCol = Math.max(0, columns.length - 1);

      switch (msg.type) {
        case 'resize-column-start': {
          if (!canResizeColumn(msg.index) || !Number.isFinite(msg.x)) return [model, Cmd.none()];
          const widths = normalizeColumnWidths(model.columnWidths);
          const index = clamp(msg.index, 0, maxCol);
          return [
            {
              ...model,
              focused: true,
              cursorCol: index,
              columnWidths: widths,
              columnResize: {
                index,
                startX: Math.trunc(msg.x),
                startWidth: widths[index]!,
                originalWidths: [...widths],
              },
            },
            Cmd.none(),
          ];
        }

        case 'resize-column-pointer': {
          const session = model.columnResize;
          if (!session || !Number.isFinite(msg.x)) return [model, Cmd.none()];
          const next = resizeColumn(model, session.index, session.startWidth + Math.trunc(msg.x) - session.startX);
          return [{ ...next, columnResize: msg.end ? null : session }, Cmd.none()];
        }

        case 'resize-column-key': {
          if (!Number.isFinite(msg.delta)) return [model, Cmd.none()];
          const index = clamp(msg.index, 0, maxCol);
          return [resizeColumn(model, index, normalizeColumnWidths(model.columnWidths)[index]! + Math.trunc(msg.delta)), Cmd.none()];
        }

        case 'resize-column-cancel':
          if (model.columnResize) {
            const widths = normalizeColumnWidths(model.columnResize.originalWidths);
            const current = normalizeColumnWidths(model.columnWidths);
            for (let index = 0; index < columns.length; index++) {
              if (widths[index] !== current[index] && canResizeColumn(index)) {
                onColumnResize?.(columns[index]!.key, widths[index]!, widthSnapshot(widths));
              }
            }
            return [{ ...model, columnWidths: widths, columnResize: null }, Cmd.none()];
          }
          return [model, Cmd.none()];

        case 'reset-column-widths': {
          const widths = [...defaultColumnWidths];
          for (let index = 0; index < columns.length; index++) {
            if (widths[index] !== model.columnWidths[index] && canResizeColumn(index)) {
              onColumnResize?.(columns[index]!.key, widths[index]!, widthSnapshot(widths));
            }
          }
          return [{ ...model, columnWidths: widths, columnResize: null }, Cmd.none()];
        }

        case 'hover-resize-handle':
          if (!Number.isFinite(msg.index) || !canResizeColumn(msg.index)) return [model, Cmd.none()];
          return [{ ...model, hoveredResizeHandle: clamp(msg.index, 0, maxCol), hoveredHeader: null }, Cmd.none()];

        case 'cursor-down': {
          const newRow = clamp(model.cursorRow + 1, 0, maxRow);
          const newOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, scrollOffset: newOffset }, Cmd.none()];
        }

        case 'cursor-up': {
          const newRow = clamp(model.cursorRow - 1, 0, maxRow);
          const newOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, scrollOffset: newOffset }, Cmd.none()];
        }

        case 'cursor-left': {
          const newCol = clamp(model.cursorCol - 1, 0, maxCol);
          return [{ ...model, cursorCol: newCol }, Cmd.none()];
        }

        case 'cursor-right': {
          const newCol = clamp(model.cursorCol + 1, 0, maxCol);
          return [{ ...model, cursorCol: newCol }, Cmd.none()];
        }

        case 'page-down': {
          const newRow = clamp(model.cursorRow + visibleRows, 0, maxRow);
          const newOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, scrollOffset: newOffset }, Cmd.none()];
        }

        case 'page-up': {
          const newRow = clamp(model.cursorRow - visibleRows, 0, maxRow);
          const newOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, scrollOffset: newOffset }, Cmd.none()];
        }

        case 'goto-first': {
          return [{ ...model, cursorRow: 0, scrollOffset: 0 }, Cmd.none()];
        }

        case 'goto-last': {
          const newOffset = ensureCursorVisible(maxRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: maxRow, scrollOffset: newOffset }, Cmd.none()];
        }

        case 'toggle-select': {
          if (!selectable) return [model, Cmd.none()];
          const cursorRowData = processedRows[model.cursorRow];
          if (!cursorRowData) return [model, Cmd.none()];
          const key = getKey(cursorRowData);
          const newSelected = new Set(model.selectedKeys);
          if (newSelected.has(key)) {
            newSelected.delete(key);
          } else {
            if (!multiSelect) newSelected.clear();
            newSelected.add(key);
          }
          const selectedData = data.filter((r) => newSelected.has(getKey(r)));
          onSelect?.(selectedData);
          return [{ ...model, selectedKeys: newSelected, selectionAnchorKey: key, rangeSelectionKeys: new Set() }, Cmd.none()];
        }

        case 'activate-row': {
          if (processedRows.length === 0) return [model, Cmd.none()];
          const index = clamp(msg.index, 0, maxRow);
          const rowData = processedRows[index];
          if (!rowData) return [model, Cmd.none()];
          const nextModel = {
            ...model,
            cursorRow: index,
            scrollOffset: ensureCursorVisible(index, model.scrollOffset, visibleRows),
            focused: true,
          };
          if (!selectable) return [nextModel, Cmd.none()];
          const key = getKey(rowData);

          if (multiSelect && msg.shift && model.selectionAnchorKey) {
            const anchorIndex = processedRows.findIndex((candidate) => getKey(candidate) === model.selectionAnchorKey);
            if (anchorIndex >= 0) {
              const start = Math.min(anchorIndex, index);
              const end = Math.max(anchorIndex, index);
              const rangeKeys = new Set(
                selectListRange(
                  processedRows.map((candidate) => ({ id: getKey(candidate) })),
                  start,
                  end,
                ),
              );
              const newSelected = msg.additive ? new Set(model.selectedKeys) : new Set<string>();
              for (const rangeKey of rangeKeys) newSelected.add(rangeKey);
              onSelect?.(data.filter((rowDataItem) => newSelected.has(getKey(rowDataItem))));
              return [{ ...nextModel, selectedKeys: newSelected, rangeSelectionKeys: rangeKeys }, Cmd.none()];
            }
          }

          const newSelected = new Set(model.selectedKeys);
          if (newSelected.has(key)) newSelected.delete(key);
          else {
            if (!multiSelect) newSelected.clear();
            newSelected.add(key);
          }
          onSelect?.(data.filter((rowDataItem) => newSelected.has(getKey(rowDataItem))));
          return [{ ...nextModel, selectedKeys: newSelected, selectionAnchorKey: key, rangeSelectionKeys: new Set() }, Cmd.none()];
        }

        case 'hover-row':
          return [{ ...model, hoveredRow: clamp(msg.index, 0, maxRow) }, Cmd.none()];

        case 'hover-header':
          return [{ ...model, hoveredHeader: clamp(msg.index, 0, maxCol) }, Cmd.none()];

        case 'leave-hover':
          return [{ ...model, hoveredRow: null, hoveredHeader: null, hoveredResizeHandle: null }, Cmd.none()];

        case 'select-all': {
          if (!multiSelect) return [model, Cmd.none()];
          const newSelected = new Set<string>();
          for (const row of processedRows) {
            newSelected.add(getKey(row));
          }
          const selectedData = data.filter((r) => newSelected.has(getKey(r)));
          onSelect?.(selectedData);
          return [
            {
              ...model,
              selectedKeys: newSelected,
              selectionAnchorKey: processedRows[0] ? getKey(processedRows[0]) : null,
              rangeSelectionKeys: new Set(newSelected),
            },
            Cmd.none(),
          ];
        }

        case 'clear-selection': {
          onSelect?.([]);
          return [{ ...model, selectedKeys: new Set(), selectionAnchorKey: null, rangeSelectionKeys: new Set() }, Cmd.none()];
        }

        case 'sort-column':
        case 'sort-at': {
          const columnIndex = msg.type === 'sort-at' ? clamp(msg.index, 0, maxCol) : model.cursorCol;
          const colKey = columns[columnIndex]?.key;
          if (!colKey) return [model, Cmd.none()];
          const col = columns[columnIndex]!;
          if (col.sortable === false) return [model, Cmd.none()];

          let newDirection: 'asc' | 'desc' = 'asc';
          if (model.sortState && model.sortState.column === colKey) {
            newDirection = model.sortState.direction === 'asc' ? 'desc' : 'asc';
          }
          const newSortState: SortState = { column: colKey, direction: newDirection };

          // Maintain cursor position on the same row by key
          const currentRowData = processedRows[model.cursorRow];
          const currentRowKey = currentRowData ? getKey(currentRowData) : null;

          const newProcessedRows = getProcessedRows(data, columns, model.filterQuery, newSortState);
          let newCursorRow = model.cursorRow;
          if (currentRowKey !== null) {
            newCursorRow = findRowIndex(newProcessedRows, currentRowKey);
          }
          const newOffset = ensureCursorVisible(newCursorRow, model.scrollOffset, visibleRows);

          onSort?.(colKey, newDirection);
          return [
            {
              ...model,
              sortState: newSortState,
              cursorRow: newCursorRow,
              cursorCol: columnIndex,
              scrollOffset: newOffset,
              focused: true,
              rangeSelectionKeys: new Set(),
            },
            Cmd.none(),
          ];
        }

        case 'start-filter': {
          if (!filterable) return [model, Cmd.none()];
          return [{ ...model, isFiltering: true }, Cmd.none()];
        }

        case 'filter-char': {
          if (!model.isFiltering) return [model, Cmd.none()];
          const newQuery = model.filterQuery + (msg as Msg<'filter-char', { char: string }>).char;
          return [{ ...model, filterQuery: newQuery, cursorRow: 0, scrollOffset: 0, rangeSelectionKeys: new Set() }, Cmd.none()];
        }

        case 'filter-backspace': {
          if (!model.isFiltering) return [model, Cmd.none()];
          const newQuery = model.filterQuery.slice(0, -1);
          return [{ ...model, filterQuery: newQuery, cursorRow: 0, scrollOffset: 0, rangeSelectionKeys: new Set() }, Cmd.none()];
        }

        case 'end-filter': {
          return [{ ...model, isFiltering: false }, Cmd.none()];
        }

        case 'focus': {
          return [{ ...model, focused: true }, Cmd.none()];
        }

        case 'blur': {
          return [{ ...model, focused: false }, Cmd.none()];
        }

        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: DataTableModel): VNode {
      const tokens = useTokens(dataTableContract, config, 'DataTable');
      const processedRows = getProcessedRows(data, columns, model.filterQuery, model.sortState);
      const totalRows = processedRows.length;
      const headerBaseStyle = applyTypography(tokens.headerStyle, { bold: true });
      const dividerStyle = style({ color: tokens.divider });
      const textSoftStyle = applyTypography(tokens.captionStyle, { color: tokens.altRow, dim: false });
      const cursorStyle = style({ bold: true, color: tokens.selected });
      const hoverStyle = applyState(tokens.hoverState, { bold: true });
      const selectedRowStyle = applyState(tokens.selectedState);
      const rangeRowStyle = applyState(tokens.rangeState, { bold: true });
      const selectedStyle = style({ color: tokens.selected });
      const borderStyle = style({ border: border.rounded, color: tokens.border });
      const filterStyle = style({ color: tokens.sortIndicator });
      const altBgStyle = style({ color: tokens.altRow, background: tokens.altBg });

      // ─── Resolve column types for auto-formatting ──────────────
      const columnTypes = config.formatNumbers
        ? columns.map((col) => {
            const values = data.map((r) => String(getCellValue(r, col.key) ?? ''));
            return detectColumnType(values);
          })
        : null;

      // ─── Resolve column widths ─────────────────────────────────
      let colWidths = normalizeColumnWidths(model.columnWidths);
      colWidths = fitColumnWidths(colWidths, columns.map((_, index) => columnBounds(index).min), tableOverhead, renderWidthLimit);

      // ─── Resolve column alignments (auto from type or explicit) ──
      const colAligns = columns.map((col, ci) => {
        if (col.align) return col.align;
        if (columnTypes) return alignmentForType(columnTypes[ci]!);
        return 'left' as const;
      });

      // ─── Header color cycling ──────────────────────────────────
      const headerColors = config.cyclingHeaderColors && config.tableTheme?.headerColors?.length ? config.tableTheme.headerColors : undefined;

      const elements: VNode[] = [];

      // ─── Title ─────────────────────────────────────────────────
      if (config.title) {
        const titleStyle = config.tableTheme?.title ? style({ color: config.tableTheme.title, bold: true }) : style({ bold: true });
        elements.push(text(config.title, titleStyle));
      }

      // ─── Filter bar ────────────────────────────────────────────
      if (model.isFiltering || model.filterQuery) {
        const filterIcon = '🔍 ';
        const filterText = model.isFiltering ? filterIcon + (model.filterQuery || 'filter...') : filterIcon + model.filterQuery;
        elements.push(text(filterText, model.isFiltering ? filterStyle : textSoftStyle));
      }

      // ─── Header row ────────────────────────────────────────────
      const headerCells: VNode[] = [];
      // Cursor prefix column
      headerCells.push(text('  ', headerBaseStyle));
      // Row number header
      if (config.rowNumbers) {
        headerCells.push(text(padCell('#', 4, 'right'), headerBaseStyle));
        headerCells.push(text(' │ ', dividerStyle));
      }
      for (let ci = 0; ci < columns.length; ci++) {
        const col = columns[ci]!;
        let headerText = col.header;
        if (model.sortState && model.sortState.column === col.key) {
          headerText += model.sortState.direction === 'asc' ? ' ▲' : ' ▼';
        }
        const width = colWidths[ci]!;
        const hStyle =
          model.hoveredHeader === ci ? hoverStyle : headerColors ? style({ color: headerColors[ci % headerColors.length], bold: true }) : headerBaseStyle;
        const headerNode = event(
          `${interactionId}:header:${ci}`,
          text(padCell(headerText, width, colAligns[ci]), hStyle),
          col.sortable === false ? {} : { onClick: sortTag, onMouseEnter: hoverHeaderTag, onMouseLeave: leaveHoverTag },
          {
            label: col.header,
            intent: col.sortable === false ? 'observe' : 'select',
            affordances: col.sortable === false ? [] : ['click'],
            cursor: col.sortable === false ? undefined : 'pointer',
            keyboardHint: col.sortable === false ? undefined : 'Enter or S',
          },
        );
        setVNodeMeta(headerNode, {
          a11y: col.sortable === false
            ? { label: col.header }
            : { role: 'button', label: `Sort by ${col.header}` },
        });
        headerCells.push(headerNode);
        if (ci < columns.length - 1) {
          const separatorResizable = canResizeColumn(ci);
          if (separatorResizable) {
            const bounds = columnBounds(ci);
            const separator = event(
              `${interactionId}:resize:${ci}`,
              text(model.hoveredResizeHandle === ci || model.columnResize?.index === ci ? ' ┃ ' : ' │ ', dividerStyle),
              { onMouseDown: resizeStartTag, onMouseEnter: hoverResizeTag, onMouseLeave: leaveHoverTag },
              {
                label: `Resize ${col.header}`,
                intent: 'resize-column',
                affordances: ['hover', 'drag', 'resize'],
                cursor: 'ew-resize',
                keyboardHint: 'Alt+Left/Right; Ctrl+0 resets',
                extra: { column: col.key, index: ci, width, minWidth: bounds.min, maxWidth: bounds.max },
              },
            );
            setVNodeMeta(separator, {
              a11y: { role: 'separator', label: `Resize ${col.header}`, valueNow: width, valueMin: bounds.min, valueMax: bounds.max },
            });
            headerCells.push(separator);
          } else {
            headerCells.push(text(' │ ', dividerStyle));
          }
        }
      }
      elements.push(row(...headerCells));

      // ─── Separator ─────────────────────────────────────────────
      const rnExtra = config.rowNumbers ? 4 + 3 : 0;
      const totalWidth = boundedInteger(colWidths.reduce((sum, w) => sum + w, 0) + (columns.length - 1) * 3 + 2 + rnExtra, 1, 1);
      elements.push(text('─'.repeat(totalWidth), dividerStyle));

      // ─── Scroll indicator (top) ────────────────────────────────
      if (model.scrollOffset > 0) {
        elements.push(text('  ▲ more above', textSoftStyle));
      }

      // ─── Data rows ─────────────────────────────────────────────
      const startIdx = model.scrollOffset;
      const endIdx = Math.min(startIdx + visibleRows, totalRows);
      const placeholder = config.emptyPlaceholder ?? '—';

      for (let i = startIdx; i < endIdx; i++) {
        const rowData = processedRows[i]!;
        const rowKey = getKey(rowData);
        const isCursor = i === model.cursorRow;
        const isSelected = model.selectedKeys.has(rowKey);
        const isRangeSelected = model.rangeSelectionKeys.has(rowKey);
        const isZebraRow = config.zebra && i % 2 === 1;
        const isHovered = model.hoveredRow === i;
        const interactionStyle = isHovered ? hoverStyle : isRangeSelected ? rangeRowStyle : isSelected ? selectedRowStyle : undefined;
        const interactionDividerStyle = isHovered
          ? applyState(tokens.hoverState, { color: tokens.divider, bold: true })
          : isRangeSelected
            ? applyState(tokens.rangeState, { color: tokens.divider, bold: true })
            : isSelected
              ? applyState(tokens.selectedState, { color: tokens.divider })
              : dividerStyle;

        const rowCells: VNode[] = [];
        const prefix = isCursor ? '► ' : '  ';
        rowCells.push(text(prefix, interactionStyle ?? (isCursor ? cursorStyle : undefined)));

        // Row number
        if (config.rowNumbers) {
          const rnStyle = interactionStyle ?? (isCursor ? cursorStyle : isZebraRow ? altBgStyle : textSoftStyle);
          rowCells.push(text(padCell(String(i + 1), 4, 'right'), rnStyle));
          rowCells.push(text(' │ ', interactionDividerStyle));
        }

        for (let ci = 0; ci < columns.length; ci++) {
          const col = columns[ci]!;
          let cellText = formatCell(col, rowData);

          // Auto-format numbers
          if (config.formatNumbers && columnTypes) {
            cellText = coronaFormatCell(cellText, columnTypes[ci]!, {
              digits: config.numberDigits ?? 3,
              placeholder,
            });
          } else if (cellText.trim() === '') {
            cellText = placeholder;
          }

          const width = colWidths[ci]!;
          const paddedText = padCell(cellText, width, colAligns[ci]);
          const cellStyle = interactionStyle ?? (isCursor ? cursorStyle : isZebraRow ? altBgStyle : undefined);
          rowCells.push(text(paddedText, cellStyle));
          if (ci < columns.length - 1) {
            rowCells.push(text(' │ ', interactionDividerStyle));
          }
        }

        if (isSelected) {
          rowCells.push(text(' ✓', interactionStyle ?? selectedStyle));
        }

        const dataRow = event(
          `${interactionId}:row:${i}`,
          row(...rowCells),
          { onClick: rowTag, onMouseEnter: hoverRowTag, onMouseLeave: leaveHoverTag },
          {
            label: `Row ${i + 1}`,
            intent: selectable ? 'select' : 'navigate',
            affordances: ['hover', 'click'],
            cursor: 'pointer',
            keyboardHint: selectable ? (multiSelect ? 'Space; Shift+click selects a range' : 'Space') : 'Up/Down',
          },
        );
        setVNodeMeta(dataRow, {
          states: [isHovered ? 'hovered' : '', isSelected ? 'selected' : '', isRangeSelected ? 'range-selected' : ''].filter(Boolean),
          a11y: { role: 'listitem', label: `Row ${i + 1}`, selected: isSelected },
        });
        elements.push(dataRow);
      }

      // ─── Scroll indicator (bottom) ─────────────────────────────
      const remaining = totalRows - endIdx;
      if (remaining > 0) {
        elements.push(text(`  ▼ (${remaining} more)`, textSoftStyle));
      }

      // ─── Status bar ────────────────────────────────────────────
      const statusParts: string[] = [];
      statusParts.push(`${totalRows} rows`);
      if (model.selectedKeys.size > 0) {
        statusParts.push(`${model.selectedKeys.size} selected`);
      }
      if (model.rangeSelectionKeys.size > 1) {
        const rangeIndexes = processedRows.map((rowData, index) => (model.rangeSelectionKeys.has(getKey(rowData)) ? index : -1)).filter((index) => index >= 0);
        if (rangeIndexes.length > 1) statusParts.push(`range ${rangeIndexes[0]! + 1}-${rangeIndexes[rangeIndexes.length - 1]! + 1}`);
      }
      if (model.sortState) {
        const sortCol = columns.find((c) => c.key === model.sortState!.column);
        const sortLabel = sortCol?.header ?? model.sortState.column;
        const arrow = model.sortState.direction === 'asc' ? '↑' : '↓';
        statusParts.push(`sorted by ${sortLabel} ${arrow}`);
      }
      elements.push(text(statusParts.join(' │ '), textSoftStyle));

      return event(
        interactionId,
        box(column(...elements), borderStyle),
        { onScroll: scrollTag },
        { label: config.title ?? 'Data table', intent: 'scroll', affordances: ['scroll'], cursor: 'default' },
      );
    },

    subscriptions(model: DataTableModel): Sub<DataTableMsg> {
      const mouse = Sub.elementMouse<DataTableMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === rowTag && mouseEvent.elementId.startsWith(`${interactionId}:row:`)) {
          return {
            type: 'activate-row',
            index: Number(mouseEvent.elementId.slice(`${interactionId}:row:`.length)),
            shift: mouseEvent.shift,
            additive: mouseEvent.ctrl,
          };
        }
        if (mouseEvent.handlerTag === hoverRowTag && mouseEvent.elementId.startsWith(`${interactionId}:row:`)) {
          return { type: 'hover-row', index: Number(mouseEvent.elementId.slice(`${interactionId}:row:`.length)) };
        }
        if (mouseEvent.handlerTag === hoverHeaderTag && mouseEvent.elementId.startsWith(`${interactionId}:header:`)) {
          return { type: 'hover-header', index: Number(mouseEvent.elementId.slice(`${interactionId}:header:`.length)) };
        }
        if (mouseEvent.handlerTag === hoverResizeTag && mouseEvent.elementId.startsWith(`${interactionId}:resize:`)) {
          return { type: 'hover-resize-handle', index: Number(mouseEvent.elementId.slice(`${interactionId}:resize:`.length)) };
        }
        if (mouseEvent.handlerTag === resizeStartTag && mouseEvent.elementId.startsWith(`${interactionId}:resize:`)) {
          return {
            type: 'resize-column-start',
            index: Number(mouseEvent.elementId.slice(`${interactionId}:resize:`.length)),
            x: mouseEvent.x,
          };
        }
        if (mouseEvent.handlerTag === leaveHoverTag) return { type: 'leave-hover' };
        if (mouseEvent.handlerTag === sortTag && mouseEvent.elementId.startsWith(`${interactionId}:header:`)) {
          return { type: 'sort-at', index: Number(mouseEvent.elementId.slice(`${interactionId}:header:`.length)) };
        }
        if (mouseEvent.handlerTag === scrollTag && mouseEvent.elementId === interactionId) {
          const direction = wheelDirection(mouseEvent.deltaY);
          return direction < 0 ? { type: 'cursor-up' } : direction > 0 ? { type: 'cursor-down' } : { type: 'noop' };
        }
        return { type: 'noop' };
      });
      const activeResize = model.columnResize
        ? Sub.batch<DataTableMsg>(
            Sub.mouse((eventData) => {
              if (eventData.type === 'move') return { type: 'resize-column-pointer', x: eventData.x };
              if (eventData.type === 'release') return { type: 'resize-column-pointer', x: eventData.x, end: true };
              return { type: 'noop' };
            }),
            Sub.key('escape', { type: 'resize-column-cancel' }),
          )
        : Sub.none<DataTableMsg>();
      const pointer = model.columnResize ? Sub.batch<DataTableMsg>(mouse, activeResize) : mouse;
      if (!model.focused) return pointer;

      // Filter mode: capture printable keys for the filter
      if (model.isFiltering) {
        return Sub.batch<DataTableMsg>(
          pointer,
          Sub.key('escape', { type: 'end-filter' }),
          Sub.key('enter', { type: 'end-filter' }),
          Sub.key('backspace', { type: 'filter-backspace' }),
          Sub.keyEvent((event) => {
            // Only handle single printable characters
            if (event.key.length === 1 && !event.ctrl && !event.alt) {
              return { type: 'filter-char', char: event.key } as DataTableMsg;
            }
            // Ignore non-printable in filter mode
            return { type: 'end-filter' } as DataTableMsg;
          }),
        );
      }

      // Normal navigation mode
      const subs: Sub<DataTableMsg>[] = [
        pointer,
        Sub.key('down', { type: 'cursor-down' }),
        Sub.key('up', { type: 'cursor-up' }),
        Sub.key('left', { type: 'cursor-left' }),
        Sub.key('right', { type: 'cursor-right' }),
        Sub.key('pagedown', { type: 'page-down' }),
        Sub.key('pageup', { type: 'page-up' }),
        Sub.key('home', { type: 'goto-first' }),
        Sub.key('end', { type: 'goto-last' }),
        Sub.key('s', { type: 'sort-column' }),
        Sub.key('enter', { type: 'sort-column' }),
        Sub.keyWithModifiers('left', { alt: true, ctrl: false, shift: false }, { type: 'resize-column-key', index: model.cursorCol, delta: -resizeStep }),
        Sub.keyWithModifiers('right', { alt: true, ctrl: false, shift: false }, { type: 'resize-column-key', index: model.cursorCol, delta: resizeStep }),
        Sub.keyWithModifiers('0', { ctrl: true, alt: false, shift: false }, { type: 'reset-column-widths' }),
      ];

      if (selectable) {
        subs.push(Sub.key('space', { type: 'toggle-select' }));
      }

      if (multiSelect) {
        subs.push(Sub.keyWithModifiers('a', { ctrl: true, shift: false }, { type: 'select-all' }));
      }

      subs.push(Sub.key('escape', { type: 'clear-selection' }));

      if (filterable) {
        subs.push(Sub.key('/', { type: 'start-filter' }));
      }

      return Sub.batch<DataTableMsg>(...subs);
    },
  };
}
