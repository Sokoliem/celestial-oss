import { selectListRange } from '@celestial/core';
import type { Color, SemanticTheme, StateToken, TableTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { alignmentForType, autoSizeColumns, border, formatCell as coronaFormatCell, detectColumnType, style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { padCellText } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, MAX_RENDER_CELLS, positiveInteger } from './internal.js';
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

function fitColumnWidths(widths: readonly number[], overhead: number): number[] {
  const budget = Math.max(widths.length, MAX_RENDER_CELLS - overhead);
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= budget) return [...widths];
  const scale = budget / total;
  const fitted = widths.map((width) => Math.max(1, Math.floor(width * scale)));
  let remaining = budget - fitted.reduce((sum, width) => sum + width, 0);
  for (let index = 0; index < fitted.length && remaining > 0; index++, remaining--) fitted[index]! += 1;
  return fitted;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function dataTable<T>(config: DataTableConfig<T>): ComponentDescriptor<DataTableModel, DataTableMsg> {
  const columns = config.columns.map((column) => ({ ...column }));
  const data = [...config.data];
  const { getKey, selectable = true, multiSelect = false, filterable = false, onSelect, onSort } = config;
  if (columns.length === 0) throw new Error('DataTable requires at least one column.');
  if (columns.length > 1_000) throw new RangeError('DataTable supports at most 1,000 columns.');
  const visibleRows = positiveInteger(config.visibleRows, 20);
  const interactionId = generateFocusGroupId('data-table');
  const rowTag = `${interactionId}:row`;
  const sortTag = `${interactionId}:sort`;
  const scrollTag = `${interactionId}:scroll`;
  const hoverRowTag = `${interactionId}:hover-row`;
  const hoverHeaderTag = `${interactionId}:hover-header`;
  const leaveHoverTag = `${interactionId}:leave-hover`;

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
        },
        Cmd.none(),
      ];
    },

    update(msg: DataTableMsg, model: DataTableModel): [DataTableModel, Cmd<DataTableMsg>] {
      const processedRows = getProcessedRows(data, columns, model.filterQuery, model.sortState);
      const maxRow = Math.max(0, processedRows.length - 1);
      const maxCol = Math.max(0, columns.length - 1);

      switch (msg.type) {
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
          return [{ ...model, hoveredRow: null, hoveredHeader: null }, Cmd.none()];

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
      let colWidths: number[];
      if (config.autoSize) {
        const headerLabels = columns.map((c) => c.header);
        const stringRows = processedRows.map((r) =>
          columns.map((col, ci) => {
            let cellText = formatCell(col, r);
            if (config.formatNumbers && columnTypes) {
              cellText = coronaFormatCell(cellText, columnTypes[ci]!, {
                digits: config.numberDigits ?? 3,
                placeholder: config.emptyPlaceholder ?? '—',
              });
            }
            return cellText;
          }),
        );
        const sizing = autoSizeColumns(headerLabels, stringRows, 120);
        colWidths = sizing.finalWidths;
      } else {
        colWidths = columns.map((c) => positiveInteger(c.width, 10));
      }
      const tableOverhead = (columns.length - 1) * 3 + 2 + (config.rowNumbers ? 7 : 0);
      colWidths = fitColumnWidths(colWidths, tableOverhead);

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
            intent: 'select',
            affordances: col.sortable === false ? [] : ['click'],
            cursor: col.sortable === false ? undefined : 'pointer',
            keyboardHint: col.sortable === false ? undefined : 'Enter or S',
          },
        );
        setVNodeMeta(headerNode, { a11y: { role: 'button', label: `Sort by ${col.header}` } });
        headerCells.push(headerNode);
        if (ci < columns.length - 1) {
          headerCells.push(text(' │ ', dividerStyle));
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
        if (mouseEvent.handlerTag === leaveHoverTag) return { type: 'leave-hover' };
        if (mouseEvent.handlerTag === sortTag && mouseEvent.elementId.startsWith(`${interactionId}:header:`)) {
          return { type: 'sort-at', index: Number(mouseEvent.elementId.slice(`${interactionId}:header:`.length)) };
        }
        if (mouseEvent.handlerTag === scrollTag && mouseEvent.elementId === interactionId) {
          return mouseEvent.deltaY === -1 ? { type: 'cursor-up' } : { type: 'cursor-down' };
        }
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;

      // Filter mode: capture printable keys for the filter
      if (model.isFiltering) {
        return Sub.batch<DataTableMsg>(
          mouse,
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
        mouse,
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
