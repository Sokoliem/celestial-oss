/**
 * Cell geometry for a variable-height notification list.
 *
 * Rendering and measurement deliberately live outside this module. Callers
 * provide the measured row heights for the current width, then use this
 * immutable snapshot for windowing and keyboard navigation.
 */

export interface MeasuredNotificationRow<Id extends number = number> {
  readonly id: Id;
  readonly height: number;
}

export interface NotificationRowGeometry<Id extends number = number> {
  readonly id: Id;
  readonly top: number;
  readonly height: number;
  readonly bottom: number;
}

export interface NotificationGeometry<Id extends number = number> {
  readonly rows: readonly NotificationRowGeometry<Id>[];
  readonly totalHeight: number;
}

export interface NotificationWindow<Id extends number = number> {
  /** First included row index. */
  readonly startIndex: number;
  /** Exclusive end of the included row range. */
  readonly endIndex: number;
  readonly rows: readonly NotificationRowGeometry<Id>[];
  /** Exact number of cells represented by the spacer above `rows`. */
  readonly spacerAbove: number;
  /** Exact number of cells represented by the spacer below `rows`. */
  readonly spacerBelow: number;
  /** Validated and clamped offset used to select the window. */
  readonly scrollOffset: number;
}

export type NotificationPageDirection = 'up' | 'down';

function safeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a finite safe integer; received ${String(value)}`);
  }
  return value;
}

function positiveRowCount(value: number, label: string): number {
  const result = safeInteger(value, label);
  if (result <= 0) {
    throw new RangeError(`${label} must be a positive integer; received ${String(value)}`);
  }
  return result;
}

function nonNegativeRowCount(value: number, label: string): number {
  const result = safeInteger(value, label);
  if (result < 0) {
    throw new RangeError(`${label} must be a non-negative integer; received ${String(value)}`);
  }
  return result;
}

function findRowIndex<Id extends number>(geometry: NotificationGeometry<Id>, id: Id): number {
  safeInteger(id, 'notification id');
  const index = geometry.rows.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new RangeError(`Unknown notification id: ${String(id)}`);
  }
  return index;
}

/** Find the first row whose bottom edge is strictly after `coordinate`. */
function firstRowEndingAfter<Id extends number>(rows: readonly NotificationRowGeometry<Id>[], coordinate: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const row = rows[middle];
    if (row !== undefined && row.bottom <= coordinate) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Find the first row whose top edge is at or beyond `coordinate`. */
function firstRowStartingAtOrAfter<Id extends number>(rows: readonly NotificationRowGeometry<Id>[], coordinate: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const row = rows[middle];
    if (row !== undefined && row.top < coordinate) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function addCapped(value: number, amount: number, cap: number): number {
  return amount >= cap - value ? cap : value + amount;
}

/**
 * Build an immutable prefix geometry from stable IDs and premeasured heights.
 */
export function buildNotificationGeometry<Id extends number>(
  measurements: readonly MeasuredNotificationRow<Id>[],
): NotificationGeometry<Id> {
  const seenIds = new Set<number>();
  const rows: NotificationRowGeometry<Id>[] = [];
  let top = 0;

  for (const [index, measurement] of measurements.entries()) {
    const id = safeInteger(measurement.id, `notification row ${index} id`) as Id;
    if (seenIds.has(id)) {
      throw new RangeError(`Notification row IDs must be unique; duplicate id ${String(id)}`);
    }
    seenIds.add(id);

    const height = positiveRowCount(measurement.height, `notification row ${index} height`);
    if (height > Number.MAX_SAFE_INTEGER - top) {
      throw new RangeError('Notification geometry total height exceeds Number.MAX_SAFE_INTEGER');
    }
    const bottom = top + height;
    rows.push(Object.freeze({ id, top, height, bottom }));
    top = bottom;
  }

  return Object.freeze({
    rows: Object.freeze(rows),
    totalHeight: top,
  });
}

/**
 * Validate and clamp a cell-row offset to the scrollable extent.
 */
export function clampNotificationOffset<Id extends number>(
  geometry: NotificationGeometry<Id>,
  offset: number,
  viewportHeight: number,
): number {
  const validOffset = safeInteger(offset, 'notification scroll offset');
  const validViewportHeight = positiveRowCount(viewportHeight, 'notification viewport height');
  const maxOffset = Math.max(0, geometry.totalHeight - validViewportHeight);
  return Math.min(maxOffset, Math.max(0, validOffset));
}

/**
 * Select the rows intersecting the viewport plus a cell-row overscan margin.
 *
 * Spacer heights are derived from the prefix geometry, so they remain exact
 * even when wrapped or expanded rows have different heights.
 */
export function selectNotificationWindow<Id extends number>(
  geometry: NotificationGeometry<Id>,
  offset: number,
  viewportHeight: number,
  overscanRows = 0,
): NotificationWindow<Id> {
  const validOverscan = nonNegativeRowCount(overscanRows, 'notification overscan rows');
  const scrollOffset = clampNotificationOffset(geometry, offset, viewportHeight);

  if (geometry.rows.length === 0) {
    return Object.freeze({
      startIndex: 0,
      endIndex: 0,
      rows: Object.freeze([]) as readonly NotificationRowGeometry<Id>[],
      spacerAbove: 0,
      spacerBelow: 0,
      scrollOffset,
    });
  }

  const overscanTop = Math.max(0, scrollOffset - validOverscan);
  const viewportBottom = addCapped(scrollOffset, viewportHeight, geometry.totalHeight);
  const overscanBottom = addCapped(viewportBottom, validOverscan, geometry.totalHeight);
  const startIndex = firstRowEndingAfter(geometry.rows, overscanTop);
  const endIndex = firstRowStartingAtOrAfter(geometry.rows, overscanBottom);
  const rows = Object.freeze(geometry.rows.slice(startIndex, endIndex));
  const first = rows[0];
  const last = rows[rows.length - 1];

  return Object.freeze({
    startIndex,
    endIndex,
    rows,
    spacerAbove: first?.top ?? geometry.totalHeight,
    spacerBelow: geometry.totalHeight - (last?.bottom ?? geometry.totalHeight),
    scrollOffset,
  });
}

/**
 * Return an offset that fully exposes an item when possible.
 *
 * A row taller than the viewport is aligned to its top so its beginning is
 * deterministic and reachable.
 */
export function ensureNotificationVisible<Id extends number>(
  geometry: NotificationGeometry<Id>,
  id: Id,
  offset: number,
  viewportHeight: number,
): number {
  const index = findRowIndex(geometry, id);
  const row = geometry.rows[index];
  if (row === undefined) {
    throw new RangeError(`Unknown notification id: ${String(id)}`);
  }
  const currentOffset = clampNotificationOffset(geometry, offset, viewportHeight);

  if (row.height > viewportHeight || row.top < currentOffset) {
    return clampNotificationOffset(geometry, row.top, viewportHeight);
  }

  const viewportBottom = addCapped(currentOffset, viewportHeight, geometry.totalHeight);
  if (row.bottom <= viewportBottom) {
    return currentOffset;
  }

  return clampNotificationOffset(geometry, row.bottom - viewportHeight, viewportHeight);
}

/**
 * Move selection by terminal rows instead of assuming a uniform item height.
 *
 * Page movement always advances by at least one item in the requested
 * direction, which keeps rows following an over-height item reachable.
 */
export function moveNotificationSelectionByViewportRows<Id extends number>(
  geometry: NotificationGeometry<Id>,
  selectedId: Id | undefined,
  direction: NotificationPageDirection,
  viewportHeight: number,
): Id | undefined {
  positiveRowCount(viewportHeight, 'notification viewport height');
  if (direction !== 'up' && direction !== 'down') {
    throw new RangeError(`notification page direction must be "up" or "down"; received ${String(direction)}`);
  }

  const { rows } = geometry;
  if (rows.length === 0) return undefined;
  if (selectedId === undefined) {
    return direction === 'down' ? rows[0]?.id : rows[rows.length - 1]?.id;
  }

  const currentIndex = findRowIndex(geometry, selectedId);
  const current = rows[currentIndex];
  if (current === undefined) return undefined;

  if (direction === 'down') {
    if (currentIndex === rows.length - 1) return current.id;
    const targetRow = addCapped(current.top, viewportHeight, Math.max(0, geometry.totalHeight - 1));
    const targetIndex = firstRowEndingAfter(rows, targetRow);
    return rows[Math.max(currentIndex + 1, Math.min(rows.length - 1, targetIndex))]?.id;
  }

  if (currentIndex === 0) return current.id;
  const targetRow = Math.max(0, current.top - viewportHeight);
  const targetIndex = firstRowEndingAfter(rows, targetRow);
  return rows[Math.min(currentIndex - 1, targetIndex)]?.id;
}
