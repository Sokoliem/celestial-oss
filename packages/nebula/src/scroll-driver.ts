/**
 * Scroll-driven animation utilities for celesTUI framework.
 *
 * Pure functions to compute scroll progress, viewport intersections,
 * parallax offsets, sticky positioning, momentum scrolling,
 * snap points, scroll indicators, and virtual viewport support.
 */

// ─── Core types ─────────────────────────────────────────────────────────────

export interface ScrollInfo {
  offset: number;
  maxOffset: number;
  progress: number; // 0..1
  viewportHeight: number;
}

export interface IntersectionEntry {
  id: string;
  y: number;
  height: number;
  ratio: number; // 0..1 (how much of element is visible)
  isIntersecting: boolean; // true if any part is visible
}

// ─── Core scroll computations ───────────────────────────────────────────────

/**
 * Compute scroll metadata from raw scroll state.
 *
 * maxOffset = max(0, contentHeight - viewportHeight).
 * progress = maxOffset > 0 ? offset / maxOffset : 0, clamped to [0, 1].
 */
export function computeScrollInfo(offset: number, contentHeight: number, viewportHeight: number): ScrollInfo {
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  let progress: number;
  if (maxOffset > 0) {
    progress = Math.min(1, Math.max(0, offset / maxOffset));
  } else {
    progress = 0;
  }
  return { offset, maxOffset, progress, viewportHeight };
}

/**
 * Compute intersection entries for a list of elements against the current viewport.
 *
 * The viewport window is [scrollOffset, scrollOffset + viewportHeight].
 * For each element, ratio = visible pixels / element height.
 * isIntersecting = ratio > 0.
 */
export function computeIntersections(
  elements: ReadonlyArray<{ id: string; y: number; height: number }>,
  scrollOffset: number,
  viewportHeight: number,
): IntersectionEntry[] {
  const vpTop = scrollOffset;
  const vpBottom = scrollOffset + viewportHeight;

  return elements.map((el) => {
    const elTop = el.y;
    const elBottom = el.y + el.height;

    const visibleTop = Math.max(elTop, vpTop);
    const visibleBottom = Math.min(elBottom, vpBottom);
    const visiblePixels = Math.max(0, visibleBottom - visibleTop);

    const ratio = el.height > 0 ? visiblePixels / el.height : 0;

    return {
      id: el.id,
      y: el.y,
      height: el.height,
      ratio,
      isIntersecting: ratio > 0,
    };
  });
}

/**
 * Compute a parallax offset for a scroll position.
 *
 * Returns Math.round(scrollOffset * speed).
 * speed 1 = normal scroll, 0.5 = half speed (parallax background), 2 = double speed.
 */
export function parallaxOffset(scrollOffset: number, speed: number): number {
  return Math.round(scrollOffset * speed);
}

/**
 * Compute a sticky position for an element.
 *
 * If elementY - scrollOffset >= stickyAt, the element is at its normal position.
 * Otherwise it is pinned at scrollOffset + stickyAt.
 */
export function stickyPosition(elementY: number, scrollOffset: number, stickyAt: number): number {
  if (elementY - scrollOffset >= stickyAt) {
    return elementY;
  }
  return scrollOffset + stickyAt;
}

// ─── Momentum / Inertia scrolling ───────────────────────────────────────────

export interface MomentumState {
  velocity: number;
  offset: number;
  lastTimestamp: number;
  isAnimating: boolean;
}

/**
 * Create initial momentum state.
 */
export function createMomentumState(initialOffset: number = 0): MomentumState {
  return {
    velocity: 0,
    offset: initialOffset,
    lastTimestamp: 0,
    isAnimating: false,
  };
}

/**
 * Apply a scroll delta (e.g., from mouse wheel or key press) and track velocity.
 * Returns new state with updated offset and velocity.
 */
export function applyScrollDelta(state: MomentumState, delta: number, timestamp: number, maxOffset: number): MomentumState {
  const dt = state.lastTimestamp > 0 ? Math.max(1, timestamp - state.lastTimestamp) : 16;
  const newVelocity = (delta / dt) * 16; // normalize to ~60fps
  const newOffset = clampOffset(state.offset + delta, maxOffset);

  return {
    velocity: newVelocity,
    offset: newOffset,
    lastTimestamp: timestamp,
    isAnimating: Math.abs(newVelocity) > 0.1,
  };
}

/**
 * Advance momentum by one frame. Applies friction to decelerate.
 * Returns new state. When velocity drops below threshold, animation stops.
 */
export function tickMomentum(state: MomentumState, maxOffset: number, friction: number = 0.92): MomentumState {
  if (!state.isAnimating) return state;

  const newVelocity = state.velocity * friction;
  const newOffset = clampOffset(state.offset + newVelocity, maxOffset);

  if (Math.abs(newVelocity) < 0.5) {
    return {
      velocity: 0,
      offset: newOffset,
      lastTimestamp: state.lastTimestamp,
      isAnimating: false,
    };
  }

  return {
    velocity: newVelocity,
    offset: newOffset,
    lastTimestamp: state.lastTimestamp,
    isAnimating: true,
  };
}

function clampOffset(offset: number, maxOffset: number): number {
  return Math.max(0, Math.min(offset, maxOffset));
}

// ─── Scroll snap ────────────────────────────────────────────────────────────

export interface SnapPoint {
  offset: number;
  id?: string;
}

/**
 * Find the nearest snap point to the given offset.
 * Returns the snap point offset, or the original offset if no snap points exist.
 */
export function snapToNearest(offset: number, snapPoints: readonly SnapPoint[]): number {
  if (snapPoints.length === 0) return offset;

  let closest = snapPoints[0]!;
  let minDist = Math.abs(offset - closest.offset);

  for (let i = 1; i < snapPoints.length; i++) {
    const dist = Math.abs(offset - snapPoints[i]!.offset);
    if (dist < minDist) {
      minDist = dist;
      closest = snapPoints[i]!;
    }
  }

  return closest.offset;
}

/**
 * Generate snap points from a list of items with known positions.
 */
export function generateSnapPoints(items: ReadonlyArray<{ id: string; y: number; height: number }>): SnapPoint[] {
  return items.map((item) => ({
    offset: item.y,
    id: item.id,
  }));
}

// ─── Scroll indicators ──────────────────────────────────────────────────────

export interface ScrollIndicator {
  trackStart: number;
  trackEnd: number;
  thumbStart: number;
  thumbEnd: number;
  thumbSize: number;
  visible: boolean;
}

/**
 * Compute scroll indicator (scrollbar) geometry for a viewport.
 *
 * trackHeight = viewportHeight (in rows).
 * thumbSize = max(1, floor(viewportHeight * viewportHeight / contentHeight)).
 * thumbStart = floor(progress * (trackHeight - thumbSize)).
 */
export function computeScrollIndicator(offset: number, contentHeight: number, viewportHeight: number): ScrollIndicator {
  if (contentHeight <= viewportHeight) {
    return {
      trackStart: 0,
      trackEnd: viewportHeight - 1,
      thumbStart: 0,
      thumbEnd: 0,
      thumbSize: 0,
      visible: false,
    };
  }

  const trackHeight = viewportHeight;
  const thumbSize = Math.max(1, Math.floor((viewportHeight * viewportHeight) / contentHeight));
  const maxOffset = contentHeight - viewportHeight;
  const progress = Math.min(1, Math.max(0, offset / maxOffset));
  const thumbStart = Math.floor(progress * (trackHeight - thumbSize));
  const thumbEnd = thumbStart + thumbSize - 1;

  return {
    trackStart: 0,
    trackEnd: trackHeight - 1,
    thumbStart,
    thumbEnd,
    thumbSize,
    visible: true,
  };
}

/**
 * Render a scroll indicator column as an array of characters.
 * Returns one character per viewport row.
 */
export function renderScrollIndicator(
  indicator: ScrollIndicator,
  viewportHeight: number,
  chars: { track: string; thumb: string } = { track: '│', thumb: '█' },
): string[] {
  if (!indicator.visible) return [];

  const result: string[] = [];
  for (let i = 0; i < viewportHeight; i++) {
    if (i >= indicator.thumbStart && i <= indicator.thumbEnd) {
      result.push(chars.thumb);
    } else {
      result.push(chars.track);
    }
  }
  return result;
}

// ─── Virtual viewport ───────────────────────────────────────────────────────

export interface VirtualViewport<T> {
  visibleItems: Array<{ item: T; index: number }>;
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetBefore: number;
  offsetAfter: number;
}

/**
 * Compute which items are visible in a virtual scrolling viewport.
 * Only items within the viewport (plus overscan) are returned.
 *
 * @param items - All items in the list
 * @param itemHeight - Height of each item (uniform)
 * @param scrollOffset - Current scroll position
 * @param viewportHeight - Visible area height
 * @param overscan - Extra items to render above/below (default 2)
 */
export function computeVirtualViewport<T>(
  items: readonly T[],
  itemHeight: number,
  scrollOffset: number,
  viewportHeight: number,
  overscan: number = 2,
): VirtualViewport<T> {
  if (items.length === 0 || itemHeight <= 0) {
    return {
      visibleItems: [],
      startIndex: 0,
      endIndex: 0,
      totalHeight: 0,
      offsetBefore: 0,
      offsetAfter: 0,
    };
  }

  const totalHeight = items.length * itemHeight;
  const rawStart = Math.floor(scrollOffset / itemHeight);
  const rawEnd = Math.ceil((scrollOffset + viewportHeight) / itemHeight);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(items.length, rawEnd + overscan);

  const visibleItems: Array<{ item: T; index: number }> = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleItems.push({ item: items[i]!, index: i });
  }

  return {
    visibleItems,
    startIndex,
    endIndex,
    totalHeight,
    offsetBefore: startIndex * itemHeight,
    offsetAfter: (items.length - endIndex) * itemHeight,
  };
}

// ─── Imperative scroll API ──────────────────────────────────────────────────

/**
 * Compute the new offset to scroll to a specific absolute position.
 * Clamps to [0, maxOffset].
 */
export function scrollTo(targetOffset: number, maxOffset: number): number {
  return clampOffset(targetOffset, maxOffset);
}

/**
 * Compute the new offset after scrolling by a relative delta.
 */
export function scrollBy(currentOffset: number, delta: number, maxOffset: number): number {
  return clampOffset(currentOffset + delta, maxOffset);
}

/**
 * Compute the offset to scroll a specific element into view.
 * If the element is already fully visible, returns the current offset unchanged.
 */
export function scrollToElement(elementY: number, elementHeight: number, currentOffset: number, viewportHeight: number, maxOffset: number): number {
  const viewTop = currentOffset;
  const viewBottom = currentOffset + viewportHeight;
  const elTop = elementY;
  const elBottom = elementY + elementHeight;

  // Already fully visible
  if (elTop >= viewTop && elBottom <= viewBottom) {
    return currentOffset;
  }

  // Element is above the viewport — scroll up to show it at the top
  if (elTop < viewTop) {
    return clampOffset(elTop, maxOffset);
  }

  // Element is below the viewport — scroll down to show it at the bottom
  return clampOffset(elBottom - viewportHeight, maxOffset);
}
