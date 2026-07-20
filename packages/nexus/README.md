# @celestial/nexus

Terminal interaction primitives: mouse tracking, hit testing, drag-and-drop, sortable lists, gesture recognition, text selection, hover intent, spatial navigation, resize handles, scroll physics, pointer cursors, hyperlinks, clipboard, terminal-focus reporting, kitty keyboard, synchronized output, cursor shape, window title, bell, external-drop parsing, and capability detection.

## Who this package is for

`@celestial/nexus` ships **two kinds of primitives**, surfacing to two distinct audiences:

- **Stateless emitters / parsers** (this is most of the package). Cross-platform, browser-safe, never spawn anything, and importable from the root barrel without paying for `node:child_process`.
- **Node-only IO primitives** behind the `@celestial/nexus/native` subpath: `writeClipboard` / `readClipboard` (parallel OSC 52 + native shell-out), `openUrl`, and the `detectClipboardTools` / `isSshSession` probes. These shell out to OS tools (`pbcopy`, `clip`, `wl-copy`, `xclip`, `xsel`, `open`, `xdg-open`, `start`, `wslview`, `powershell`). Browser / rift consumers should not import this subpath; review your threat model before using inside a sandboxed context.

The split means:

| Audience | Import from | Typical use |
|---|---|---|
| In-repo apps (`claude-wrapper`, `solaris`, `genesis`, `forge`) | root + `./native` as needed | full surface |
| In-repo render packages (`nebula`, `constellation`, `horizon`, `aether`) | root only | parsers / emitters |
| Browser-side renderers (`rift`, `portal` browser chunks) | root only | parsers / emitters |
| External framework consumers | root + `./native` as needed | both, but document the threat model |

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Features

- **Mouse Tracking** — SGR 1006 mouse mode parsing with modifier keys
- **Hit Testing** — `HitMap<M>` (O(n) reverse z-order) and `CellHitMap` (O(1) grid-based)
- **Drag and Drop** — pure state machine with typed drag data, drop validation, cancel, and leave
- **Sortable Lists** — list reorder state machine with preview rendering and cancel
- **Gesture Recognition** — double-click, long-press, swipe from raw mouse events
- **Text Selection** — linear and box selection, multi-select, word/line/all, commit/merge
- **Hover Intent** — distinguishes deliberate hovers from fast pass-throughs
- **Spatial Navigation** — 2D directional keyboard focus navigation
- **Resize Handles** — edge/corner detection, cursor mapping, constraints, grid snap
- **Scroll Physics** — momentum, axis locking, overscroll bounce-back, snap points
- **Pointer Cursors** — priority-based cursor resolution with claim/release
- **Hyperlinks** — OSC 8 terminal hyperlinks with fallback
- **Clipboard** — OSC 52 clipboard read/write and bracketed paste parsing
- **Capability Detection** — comprehensive environment-variable detection with fallback chains

---

## Quick Start

```typescript
import {
  detectCapabilities,
  parseMouseEvent,
  mouseEnable,
  mouseDisable,
  HitMap,
  hyperlink,
} from '@celestial/nexus';

const caps = detectCapabilities();

process.stdout.write(mouseEnable);

const hitMap = new HitMap<'btn-click'>();
hitMap.register({ x: 10, y: 5, width: 20, height: 3, onClick: 'btn-click' });

function handleInput(data: string) {
  const event = parseMouseEvent(data);
  if (event?.type === 'press') {
    const region = hitMap.hitTest(event.x, event.y);
    if (region?.onClick) console.log('clicked:', region.onClick);
  }
}

const link = hyperlink('Docs', 'https://example.com', { fallback: true });

process.stdout.write(mouseDisable);
```

---

## API

### Terminal Capabilities

#### `detectCapabilities(): TerminalCapabilities`

Detects all terminal capabilities from environment variables. Call once and pass the result around.

```typescript
interface TerminalCapabilities {
  color: 'none' | '16' | '256' | 'truecolor';
  mouse: boolean;
  hyperlinks: boolean;
  images: 'kitty' | 'iterm2' | 'none';
  kittyKeyboard: boolean;
  synchronizedOutput: boolean;
  unicode: 'none' | 'basic' | 'wide' | 'full';
  bracketedPaste: boolean;
}
```

#### `supportsHyperlinks(): boolean`

Cached convenience check. Equivalent to `detectCapabilities().hyperlinks`.

#### `supportsMouseTracking(): boolean`

Cached convenience check. Equivalent to `detectCapabilities().mouse`.

#### `_resetCache(): void`

Clears the cached detection results so the next call re-reads environment variables.

#### `fallback<T>(): FallbackChain<T>`

Build a fallback chain for graceful degradation:

```typescript
import { fallback } from '@celestial/nexus';

const renderMode = fallback<'rich' | 'plain'>()
  .when('images', 'kitty', 'rich')
  .when('images', 'iterm2', 'rich')
  .otherwise('plain');
```

#### `withCapability<T>(caps, cap, expectedValue, enhanced, fallback): T`

Inline feature flag for view rendering:

```typescript
import { withCapability, detectCapabilities, hyperlink } from '@celestial/nexus';

const caps = detectCapabilities();
const btn = withCapability(
  caps, 'hyperlinks', true,
  hyperlink('Docs', 'https://example.com'),
  'Docs (https://example.com)',
);
```

---

### Mouse Handling

#### `parseMouseEvent(data: string): MouseEvent | null`

Parses an SGR 1006 escape sequence (`\x1b[<btn;x;yM` / `...m`). Returns `null` if the input does not match.

```typescript
interface MouseEvent {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 0 | 1 | 2 | 'none';
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
```

#### `mouseEnable` / `mouseDisable`

ANSI sequences to enable/disable mouse tracking (basic + motion + SGR 1006):

```typescript
process.stdout.write(mouseEnable);
process.stdout.write(mouseDisable);
```

---

### Gesture Recognition

High-level gestures from raw mouse events.

```typescript
import {
  createGestureState,
  processGesture,
  checkLongPress,
  resolveGestureConfig,
  DEFAULT_GESTURE_CONFIG,
  type GestureConfig,
  type GestureEvent,
  type GestureState,
  type MouseEventData,
} from '@celestial/nexus';

let state = createGestureState();
const config = resolveGestureConfig({ doubleClickMs: 250 });

const result = processGesture(state, mouseEvent, config);
// Optional 4th param: now (number) — override timestamp for deterministic testing
state = result.state;
for (const g of result.gestures) {
  if (g.gesture === 'double-click') { /* ... */ }
  if (g.gesture === 'swipe') { /* g.direction, g.distance, g.velocity */ }
}

// Optional 3rd param: now (number) — override timestamp for deterministic testing
const lp = checkLongPress(state, config);
if (lp) { /* long-press detected */ }
```

**`GestureState` fields:**

```typescript
interface GestureState {
  lastPressTime: number;
  lastPressX: number;
  lastPressY: number;
  pressStartTime: number | null;
  pressStartX: number;
  pressStartY: number;
  hasMoved: boolean;
}
```

**`GestureEvent` variants:**

```typescript
type GestureEvent =
  | { gesture: 'double-click'; x: number; y: number }
  | { gesture: 'long-press'; x: number; y: number; durationMs: number }
  | { gesture: 'swipe'; direction: 'up' | 'down' | 'left' | 'right'; distance: number; velocity: number };
```

**`MouseEventData` shape** (structurally compatible with `MouseEvent`):

```typescript
interface MouseEventData {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 0 | 1 | 2 | 'none';
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}
```

**`DEFAULT_GESTURE_CONFIG`:**

```typescript
const DEFAULT_GESTURE_CONFIG = {
  doubleClickMs: 300,
  longPressMs: 500,
  swipeMinDistance: 3,
  swipeMaxDurationMs: 300,
};
```

---

### Hit Testing

#### `HitMap<M>` — O(n) region-based

```typescript
import { HitMap, type HitRegion } from '@celestial/nexus';

const hitMap = new HitMap<'save' | 'cancel'>();

hitMap.register({
  x: 10, y: 5, width: 10, height: 1,
  onClick: 'save',
  onHover: { enter: 'save', exit: 'save' },
  cursor: 'pointer',
});

const region = hitMap.hitTest(mouseX, mouseY);
if (region?.onClick) dispatch(region.onClick);

const all = hitMap.getAll();

hitMap.clear();
```

**`HitRegion<M>` interface:**

```typescript
interface HitRegion<M> {
  x: number; y: number; width: number; height: number;
  onClick?: M;
  onHover?: { enter?: M; exit?: M };
  cursor?: 'pointer' | 'default';
}
```

#### `CellHitMap` — O(1) grid-based

Paints element IDs into cells at register time for direct-lookup hit testing.

```typescript
import { CellHitMap, type ElementRegion, type EventHandlers } from '@celestial/nexus';

const cellMap = new CellHitMap(80, 24);

cellMap.register({
  id: 'submit-btn',
  handlers: { onClick: 'submit', onMouseEnter: 'btn-hover' },
  x: 30, y: 10, width: 15, height: 3,
});

const region = cellMap.hitTest(35, 11);
if (region?.handlers.onClick) dispatch(region.handlers.onClick);

const all = cellMap.hitTestAll(35, 11);
```

**Maintenance methods:** `unregister(id)` removes a single region (returns `true` if removed). `clear()` resets the map. `getRegion(id)` returns a registered region without hit-testing. `getAll()` returns every registered region in registration order.

Re-registering an existing id (same `id`, different bounds) erases the previously painted cells before painting the new bounds, so a shrunken or moved region never leaves stale hit cells outside its new footprint.

**`EventHandlers` interface:**

> **Note:** This `EventHandlers` is defined locally in `@celestial/nexus` and is a subset of `@celestial/nebula`'s `EventHandlers`. The nebula version adds capture-phase handlers (`onClickCapture`, `onRightClickCapture`, `onMouseDownCapture`, `onMouseUpCapture`, `onMouseMoveCapture`, `onScrollCapture`). The nexus version is structurally compatible with the nebula version for non-capture handlers, so you can use either interchangeably when only bubble-phase events are needed.

```typescript
interface EventHandlers {
  readonly onClick?: string;
  readonly onRightClick?: string;
  readonly onDoubleClick?: string;
  readonly onMouseEnter?: string;
  readonly onMouseLeave?: string;
  readonly onMouseDown?: string;
  readonly onMouseUp?: string;
  readonly onMouseMove?: string;
  readonly onScroll?: string;
}
```

---

### Drag and Drop

Pure state machine. No side effects.

```typescript
import {
  createDragState,
  dragUpdate,
  isDragging,
  getDragOffset,
  type DragState,
  type DragMsg,
  type DropTarget,
} from '@celestial/nexus';

interface Item { id: string; label: string }

let state = createDragState<Item>();

const targets: DropTarget<Item>[] = [
  { id: 'trash', canDrop: () => true },
  { id: 'archive', canDrop: (item) => item.label !== 'Important' },
];

state = dragUpdate({ type: 'drag-start', sourceId: 'item-1', data: { id: 'item-1', label: 'File' }, x: 10, y: 5 }, state, targets);
state = dragUpdate({ type: 'drag-move', x: 20, y: 8 }, state, targets);
state = dragUpdate({ type: 'drag-over', targetId: 'trash' }, state, targets);
state = dragUpdate({ type: 'drag-leave' }, state, targets);
state = dragUpdate({ type: 'drag-cancel' }, state, targets);
state = dragUpdate({ type: 'drop', targetId: 'trash' }, state, targets);

// After the consumer has read the drop result, acknowledge it and return to idle:
const dropped = getDroppedResult(state); // { sourceId, targetId, data } or null
if (dropped) {
  state = dragUpdate({ type: 'drag-reset' }, state, targets);
}
```

**`DragMsg<D>` union:**

```typescript
type DragMsg<D> =
  | { type: 'drag-start'; sourceId: string; data: D; x: number; y: number }
  | { type: 'drag-move'; x: number; y: number }
  | { type: 'drag-over'; targetId: string }
  | { type: 'drag-leave' }
  | { type: 'drop'; targetId: string }
  | { type: 'drag-cancel' }
  | { type: 'drag-reset' };
```

After a successful `drop` the state stays in the `'dropped'` phase until the
consumer acknowledges it with `'drag-reset'` (or with a fresh `createDragState`).
This gives view code one frame to read the result before another drag can start.

**`DragState<D>` union:**

```typescript
type DragState<D> =
  | { phase: 'idle' }
  | { phase: 'dragging'; sourceId: string; data: D; startX: number; startY: number; currentX: number; currentY: number; hoveredTargetId: string | null }
  | { phase: 'dropped'; sourceId: string; targetId: string; data: D };
```

**`DropTarget<D>` interface:**

```typescript
interface DropTarget<D> {
  id: string;
  canDrop: (data: D) => boolean;
}
```

**`getDragOffset(state): { dx: number; dy: number } | null`** — returns `null` when not dragging.

**`isDropped(state): boolean`** — true once a drop has been committed and is awaiting `drag-reset`.

**`getDroppedResult(state): { sourceId; targetId; data } | null`** — extract the result of a completed drop. Returns `null` outside the `'dropped'` phase.

---

### Sortable Lists

```typescript
import {
  createSortableState,
  sortableUpdate,
  reorder,
  getPreviewOrder,
  type SortableState,
  type SortableMsg,
} from '@celestial/nexus';

const items = ['A', 'B', 'C', 'D'];
let state = createSortableState();

state = sortableUpdate({ type: 'sort-start', index: 1 }, state);
state = sortableUpdate({ type: 'sort-over', index: 3 }, state);

const preview = getPreviewOrder(items, state);

state = sortableUpdate({ type: 'sort-cancel' }, state);

state = sortableUpdate({ type: 'sort-start', index: 1 }, state);
state = sortableUpdate({ type: 'sort-over', index: 3 }, state);
state = sortableUpdate({ type: 'sort-end' }, state);

const final = reorder(items, 1, 3);
```

**`SortableMsg` union:**

```typescript
type SortableMsg =
  | { type: 'sort-start'; index: number }
  | { type: 'sort-over'; index: number }
  | { type: 'sort-end' }
  | { type: 'sort-cancel' };
```

**`SortableState` interface:**

```typescript
interface SortableState {
  draggingIndex: number | null;
  overIndex: number | null;
}
```

---

### Text Selection

Linear and box selection with multi-select support.

```typescript
import {
  createSelectionState,
  selectionUpdate,
  normalizeRange,
  isCellSelected,
  getSelectedText,
  mergeOverlappingRanges,
  type SelectionMode,
  type SelectionAnchor,
  type SelectionRange,
  type NormalizedRange,
  type MultiSelectState,
  type SelectionMsg,
} from '@celestial/nexus';

let state = createSelectionState();

state = selectionUpdate({ type: 'select-start', row: 2, col: 5 }, state);
state = selectionUpdate({ type: 'select-extend', row: 4, col: 20 }, state);
state = selectionUpdate({ type: 'select-commit' }, state);

state = selectionUpdate({ type: 'select-add', row: 7, col: 0 }, state);
state = selectionUpdate({ type: 'select-extend', row: 7, col: 10 }, state);
state = selectionUpdate({ type: 'select-commit' }, state);

state = selectionUpdate({ type: 'select-all', rowCount: 24, colCount: 80 }, state);
state = selectionUpdate({ type: 'select-word', row: 3, col: 10, word: [8, 14] }, state);
state = selectionUpdate({ type: 'select-line', row: 3, colCount: 80 }, state);
state = selectionUpdate({ type: 'select-start', row: 1, col: 2, mode: 'box' }, state);
state = selectionUpdate({ type: 'select-clear' }, state);
```

**`SelectionMsg` union:**

```typescript
type SelectionMsg =
  | { type: 'select-start'; row: number; col: number; mode?: SelectionMode }
  | { type: 'select-extend'; row: number; col: number }
  | { type: 'select-add'; row: number; col: number }
  | { type: 'select-all'; rowCount: number; colCount: number }
  | { type: 'select-word'; row: number; col: number; word: [number, number] }
  | { type: 'select-line'; row: number; colCount: number }
  | { type: 'select-clear' }
  | { type: 'select-commit' };
```

**`MultiSelectState` interface:**

```typescript
interface MultiSelectState {
  ranges: SelectionRange[];
  activeRange: SelectionRange | null;
  mode: SelectionMode;
}
```

**`SelectionRange` interface:**

```typescript
interface SelectionRange {
  anchor: SelectionAnchor;
  focus: SelectionAnchor;
  mode: SelectionMode;
}

type SelectionMode = 'linear' | 'box';

interface SelectionAnchor {
  row: number;
  col: number;
}
```

**`normalizeRange(range: SelectionRange): NormalizedRange`** — returns start/end coordinates regardless of anchor/focus direction.

```typescript
interface NormalizedRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  mode: SelectionMode;
}
```

**`isCellSelected(state, row, col): boolean`** — checks committed ranges and active range.

**`getSelectedText(state, getCell, colCount?): string`** — extracts selected text by calling `getCell(row, col)` for each cell in the selected ranges. Joins rows with newlines. The optional `colCount` avoids scanning for row ends in linear mode.

**`mergeOverlappingRanges(ranges: SelectionRange[]): SelectionRange[]`** — merges overlapping or adjacent ranges of the same mode.

---

### Hover Intent

Distinguishes deliberate hovers from fast pass-throughs. Pure state machine — no timers or side effects. The caller sends `hover-tick` messages periodically and `hover-cursor-move` on mouse events.

```typescript
import {
  createHoverIntentState,
  resolveHoverIntentConfig,
  hoverIntentUpdate,
  DEFAULT_HOVER_INTENT_CONFIG,
  type HoverIntentConfig,
  type HoverPhase,
  type HoverIntentState,
  type HoverIntentMsg,
  type HoverIntentEvent,
} from '@celestial/nexus';

let state = createHoverIntentState();
const config = resolveHoverIntentConfig({ dwellMs: 200 });

const { state: newState, events } = hoverIntentUpdate(
  { type: 'hover-cursor-move', x: 15, y: 8, regionId: 'tooltip-area', timestamp: Date.now() },
  state,
  config,
);
state = newState;

const { state: ticked, events: tickEvents } = hoverIntentUpdate(
  { type: 'hover-tick', timestamp: Date.now() },
  state,
  config,
);
state = ticked;
for (const e of tickEvents) {
  if (e.event === 'hover-enter') { /* e.regionId */ }
  if (e.event === 'hover-exit') { /* e.regionId */ }
  if (e.event === 'hover-move') { /* e.regionId, e.x, e.y */ }
}
```

**`HoverIntentMsg` union:**

```typescript
type HoverIntentMsg =
  | { type: 'hover-cursor-move'; x: number; y: number; regionId: string | null; timestamp: number }
  | { type: 'hover-tick'; timestamp: number };
```

**`HoverIntentEvent` union:**

```typescript
type HoverIntentEvent =
  | { event: 'hover-enter'; regionId: string }
  | { event: 'hover-exit'; regionId: string }
  | { event: 'hover-move'; regionId: string; x: number; y: number };
```

**`HoverPhase`:** `'idle' | 'entering' | 'active' | 'exiting'`

**`HoverIntentState` interface:**

```typescript
interface HoverIntentState {
  phase: HoverPhase;
  regionId: string | null;
  enterX: number;
  enterY: number;
  enterTime: number;
  exitTime: number;
}
```

**`HoverIntentConfig` interface:**

```typescript
interface HoverIntentConfig {
  dwellMs?: number;
  exitGraceMs?: number;
  movementTolerance?: number;
}

const DEFAULT_HOVER_INTENT_CONFIG = {
  dwellMs: 300,
  exitGraceMs: 100,
  movementTolerance: 1,
};
```

### Hover Intent Subpath

The `@celestial/nexus/hover-intent` subpath adds a tooltip-to-overlay progression plus explicit scroll restoration.

```typescript
import {
  hoverIntent,
  hoverIntentKeys,
  preserveScroll,
  type HoverTarget,
} from '@celestial/nexus/hover-intent';

const target: HoverTarget = {
  id: 'help-panel',
  contains: (x, y) => x >= 10 && x < 30 && y >= 5 && y < 12,
  scrollPreservation: preserveScroll({ scrollTop: 8, scrollLeft: 0 }),
};

const handle = hoverIntent({
  target,
  tooltip: {
    onEnter: () => ({ type: 'tooltip-enter' }),
    onLeave: () => ({ type: 'tooltip-leave' }),
  },
  overlay: {
    dwellMs: 800,
    preserveScroll: true,
    onOpen: () => ({ type: 'overlay-open' }),
    onClose: () => ({ type: 'overlay-close' }),
  },
});

const keyboard = hoverIntentKeys(handle, {
  tooltipKey: 't',
  overlayKey: 'o',
  closeKey: 'escape',
});
```

Drive the controller with `handle.dispatch(...)`, then subscribe to `handle.subscription` if you want the lifecycle callbacks to flow through Nebula as messages. `hoverIntentKeys(...)` adds keyboard parity for the same progression and uses Nebula's normalized lowercase key names.

---

### Spatial Navigation

2D directional keyboard focus navigation using Euclidean distance and cross-axis overlap scoring.

```typescript
import {
  createSpatialNavState,
  buildSpatialNavMap,
  spatialNavUpdate,
  findSpatialNeighbor,
  type SpatialDirection,
  type SpatialRegion,
  type SpatialNavMap,
  type SpatialNavState,
  type SpatialNavMsg,
} from '@celestial/nexus';

const regions: SpatialRegion[] = [
  { id: 'ok', x: 20, y: 10, width: 8, height: 1 },
  { id: 'cancel', x: 30, y: 10, width: 8, height: 1 },
  { id: 'help', x: 20, y: 12, width: 8, height: 1 },
  { id: 'settings', x: 30, y: 12, width: 10, height: 1, disabled: true },
];

const navMap = buildSpatialNavMap(regions);
let state: SpatialNavState = { focusedId: 'ok', navMap };

state = spatialNavUpdate({ type: 'spatial-move', direction: 'right' }, state);
state = spatialNavUpdate({ type: 'spatial-focus', id: 'help' }, state);
state = spatialNavUpdate({ type: 'spatial-blur' }, state);

const neighbor = findSpatialNeighbor('ok', 'down', regions);
```

**`SpatialNavMsg` union:**

```typescript
type SpatialNavMsg =
  | { type: 'spatial-focus'; id: string }
  | { type: 'spatial-move'; direction: SpatialDirection }
  | { type: 'spatial-activate' }
  | { type: 'spatial-blur' };
```

**`SpatialDirection`:** `'up' | 'down' | 'left' | 'right'`

**`SpatialRegion` interface:**

```typescript
interface SpatialRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  disabled?: boolean;
}
```

**`SpatialNavMap`:** `Readonly<Record<string, { up: string | null; down: string | null; left: string | null; right: string | null }>>`

---

### Resize Handles

Edge and corner detection with constraints, cursor mapping, grid snapping, and keyboard resize.

```typescript
import {
  createResizeHandleState,
  resizeHandleUpdate,
  detectEdge,
  applyConstraints,
  edgeToCursor,
  type ResizeEdge,
  type ResizeCursor,
  type ResizeConstraints,
  type ResizableRect,
  type ResizePhase,
  type ResizeHandleState,
  type ResizeHandleMsg,
} from '@celestial/nexus';

const rect: ResizableRect = { x: 5, y: 3, width: 40, height: 10 };
let state = createResizeHandleState(rect);

const edge = detectEdge(6, 3, rect, 1);
const cursor = edge ? edgeToCursor(edge) : 'default';

const constraints: ResizeConstraints = {
  minWidth: 20,
  minHeight: 5,
  maxWidth: 80,
  snapGridX: 4,
  snapGridY: 2,
};

state = resizeHandleUpdate({ type: 'resize-move', x: 6, y: 3 }, state, constraints, 1);
state = resizeHandleUpdate({ type: 'resize-start', x: 6, y: 3 }, state, constraints, 1);
state = resizeHandleUpdate({ type: 'resize-drag', x: 10, y: 3 }, state, constraints, 1);
state = resizeHandleUpdate({ type: 'resize-end' }, state, constraints, 1);
state = resizeHandleUpdate({ type: 'resize-cancel' }, state, constraints, 1);

state = resizeHandleUpdate({ type: 'resize-key', edge: 'right', delta: 4 }, state, constraints);

const clamped = applyConstraints({ x: 0, y: 0, width: 5, height: 2 }, constraints);
```

**`ResizeHandleMsg` union:**

```typescript
type ResizeHandleMsg =
  | { type: 'resize-move'; x: number; y: number }
  | { type: 'resize-start'; x: number; y: number }
  | { type: 'resize-drag'; x: number; y: number }
  | { type: 'resize-end' }
  | { type: 'resize-cancel' }
  | { type: 'resize-key'; edge: ResizeEdge; delta: number };
```

**`ResizeEdge`:** `'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`

**`ResizeCursor`:** `'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' | 'default'`

**`ResizePhase`:** `'idle' | 'hovering' | 'resizing'`

**`ResizeHandleState` interface:**

```typescript
interface ResizeHandleState {
  phase: ResizePhase;
  activeEdge: ResizeEdge | null;
  hoveredEdge: ResizeEdge | null;
  original: ResizableRect;
  current: ResizableRect;
  startX: number;
  startY: number;
  cursor: ResizeCursor;
}
```

- `phase` — current lifecycle phase
- `activeEdge` — edge/corner being actively dragged (`null` when idle)
- `hoveredEdge` — edge/corner under the cursor (`null` when not near an edge)
- `original` — rectangle snapshot at drag start (used by cancel to revert)
- `current` — live rectangle after applying drag deltas and constraints
- `startX` / `startY` — mouse position at drag start
- `cursor` — resolved cursor type based on hovered/active edge

**`ResizableRect` interface:**

```typescript
interface ResizableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

**`ResizeConstraints` interface:**

```typescript
interface ResizeConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
  snapGridX?: number;
  snapGridY?: number;
}
```

**`detectEdge(x, y, rect, handleZone): ResizeEdge | null`** — returns which edge or corner the point is near, or `null` if not near any edge. Corners take priority when near two edges simultaneously.

**`edgeToCursor(edge): ResizeCursor`** — maps an edge to the appropriate cursor type.

---

### Scroll Physics

2D scroll with momentum, axis locking, overscroll bounce-back, and snap points. Wraps nebula's scroll-driver utilities.

```typescript
import {
  createScrollPhysicsState,
  scrollPhysicsUpdate,
  isScrollAnimating,
  getScrollPosition,
  type AxisLock,
  type OverscrollConfig,
  type ScrollPhysicsConfig,
  type ScrollPhysicsState,
  type ScrollPhysicsMsg,
} from '@celestial/nexus';

const config: ScrollPhysicsConfig = {
  maxX: 500,
  maxY: 200,
  friction: 0.92,
  axisLock: 'auto',
  overscroll: { elasticity: 0.3, maxOverscroll: 10, bounceBackMs: 300 },
  snapPointsY: [{ offset: 0 }, { offset: 100 }, { offset: 200 }],
};

let state = createScrollPhysicsState(config);

state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 5, dy: 20, timestamp: Date.now() }, state, config);
state = scrollPhysicsUpdate({ type: 'scroll-tick' }, state, config);
state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 15, vy: 40 }, state, config);
state = scrollPhysicsUpdate({ type: 'scroll-snap' }, state, config);
state = scrollPhysicsUpdate({ type: 'scroll-to', x: 100, y: 50 }, state, config);
state = scrollPhysicsUpdate({ type: 'scroll-reset' }, state, config);

const animating = isScrollAnimating(state);
const pos = getScrollPosition(state);
```

**`ScrollPhysicsMsg` union:**

```typescript
type ScrollPhysicsMsg =
  | { type: 'scroll-delta'; dx: number; dy: number; timestamp: number }
  | { type: 'scroll-tick' }
  | { type: 'scroll-fling'; vx: number; vy: number }
  | { type: 'scroll-snap' }
  | { type: 'scroll-to'; x: number; y: number }
  | { type: 'scroll-reset' };
```

**`ScrollPhysicsConfig` interface:**

```typescript
interface ScrollPhysicsConfig {
  maxX: number;
  maxY: number;
  friction?: number;
  snapPointsX?: SnapPoint[];
  snapPointsY?: SnapPoint[];
  axisLock?: AxisLock;
  overscroll?: OverscrollConfig;
}
```

**`AxisLock`:** `'none' | 'horizontal' | 'vertical' | 'auto'`

**`OverscrollConfig` interface:**

```typescript
interface OverscrollConfig {
  elasticity: number;
  maxOverscroll: number;
  bounceBackMs: number;
}
```

**`ScrollPhysicsState` interface:**

```typescript
interface ScrollPhysicsState {
  x: MomentumState;
  y: MomentumState;
  axisLock: AxisLock;
  resolvedAxis: 'horizontal' | 'vertical' | null;
  overscrollX: number;
  overscrollY: number;
  isBouncing: boolean;
}
```

Re-exported types from `@celestial/nebula`: `MomentumState`, `SnapPoint`.

---

### Pointer Cursors

Priority-based cursor resolution. Multiple sources (drag, resize, system, regions) can claim a cursor; the highest priority wins.

```typescript
import {
  createPointerState,
  pointerUpdate,
  resolvedCursor,
  claimFromHitRegion,
  type CursorType,
  type CursorPriority,
  type CursorClaim,
  type PointerState,
  type PointerMsg,
} from '@celestial/nexus';

let state = createPointerState();

state = pointerUpdate({ type: 'pointer-claim', claim: { cursor: 'pointer', priority: 'region', source: 'btn-1' } }, state);
state = pointerUpdate({ type: 'pointer-claim', claim: { cursor: 'grabbing', priority: 'drag', source: 'drag-1' } }, state);

const cursor = resolvedCursor(state);

state = pointerUpdate({ type: 'pointer-release', source: 'drag-1' }, state);
state = pointerUpdate({ type: 'pointer-release-priority', priority: 'region' }, state);
state = pointerUpdate({ type: 'pointer-clear' }, state);
```

**`CursorType`:** `'default' | 'pointer' | 'text' | 'grab' | 'grabbing' | 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' | 'crosshair' | 'not-allowed' | 'wait'`

**`CursorPriority` ranking** (highest to lowest): `'drag' (5) > 'resize' (4) > 'system' (3) > 'region' (2) > 'default' (1)`. Ties are broken by last-added wins.

**`CursorClaim` interface:**

```typescript
interface CursorClaim {
  cursor: CursorType;
  priority: CursorPriority;
  source: string;
}
```

**`PointerMsg` union:**

```typescript
type PointerMsg =
  | { type: 'pointer-claim'; claim: CursorClaim }
  | { type: 'pointer-release'; source: string }
  | { type: 'pointer-release-priority'; priority: CursorPriority }
  | { type: 'pointer-clear' };
```

**`claimFromHitRegion<M>(region, source?): CursorClaim | null`** — creates a `CursorClaim` from a `HitRegion`'s cursor field. Returns `null` if the region has no cursor or has `'default'`. The optional `source` defaults to `'hitregion'`; callers with multiple regions must provide distinct sources.

---

### Hyperlinks

#### `hyperlink(text, url, opts?): string`

Generates an OSC 8 escape sequence. Format: `\x1b]8;params;url\x07text\x1b]8;;\x07`

```typescript
import { hyperlink, type HyperlinkOpts } from '@celestial/nexus';

const link = hyperlink('Click here', 'https://example.com');
const grouped = hyperlink('Docs', 'https://example.com/docs', { id: 'nav' });
const safe = hyperlink('Link', 'https://example.com', { fallback: true });
```

**`HyperlinkOpts` interface:**

```typescript
interface HyperlinkOpts {
  id?: string;
  fallback?: boolean;
}
```

**Input validation:** `hyperlink` throws if `url` or `id` contain C0 control characters or DEL — those bytes terminate the OSC sequence and would corrupt surrounding output. `id` additionally cannot contain `;` or `:` (reserved as OSC parameter delimiters).

---

### Clipboard

> **Use `writeClipboard` / `readClipboard` for new code.** They handle OSC 52 + native shell-out in parallel, detect SSH sessions, and return a structured result. The lower-level `osc52Write` family below is kept for callers that need pure OSC-52 emission without shell-out.

#### `writeClipboard(text, opts?): Promise<ClipboardResult>` (recommended)

```typescript
import { writeClipboard } from '@celestial/nexus';

const result = await writeClipboard('Hello, clipboard!');
if (!result.ok) console.warn(`clipboard write failed: ${result.error}`);
// result.source: 'osc52' | 'native' | 'both' | 'none'
// result.nativeTool: 'pbcopy' | 'clip' | 'wl-copy' | 'xclip' | 'xsel' (when native ran)
```

Behavior:
- **SSH session** (`SSH_CONNECTION` / `SSH_CLIENT` / `SSH_TTY` set): OSC 52 only — the local clipboard isn't reachable from the remote host, and OSC 52 forwards over the SSH channel.
- **Local session**: OSC 52 + native shell-out fire in parallel. Whichever populates the clipboard first wins. macOS Terminal.app — which silently drops OSC 52 — gets reliable native-tool delivery.
- Tool priority on Linux: `wl-copy` first when `WAYLAND_DISPLAY` is set, otherwise `xclip` → `xsel` → `wl-copy`.
- Windows uses `clip.exe` with UTF-16LE + BOM stdin for emoji / CJK robustness.

Tests / sandboxed runtimes can inject a custom `spawn` + `env` via the `ClipboardWriteOpts` DI surface — see `packages/nexus/src/__tests__/__fixtures__/platform-injection.ts` for the canonical pattern. The injected `spawn` shape lets you stub the shell-out without `vi.mock('node:child_process')`.

#### `readClipboard(opts?): Promise<{ text, source, error? }>` (recommended)

```typescript
import { readClipboard } from '@celestial/nexus';

const { text, source } = await readClipboard({ readEscape: async () => null });
// source: 'osc52' | 'native' | 'none'
```

Reads issue an OSC 52 read request and await `opts.readEscape` with a configurable timeout (`osc52TimeoutMs`, default 250ms). On timeout (most terminals reject OSC 52 reads silently for security), falls through to native: `pbpaste` / `wl-paste` / `xclip -o` / `xsel -o` / `powershell Get-Clipboard`.

#### OSC 52 only (low-level)

```typescript
import { osc52Write, osc52ReadRequest, parseOsc52Response } from '@celestial/nexus';

process.stdout.write(osc52Write('Hello, clipboard!'));
process.stdout.write(osc52ReadRequest());

const text = parseOsc52Response('\x1b]52;c;SGVsbG8=\x07');
```

#### `parseOsc52Response(data: string): string | null`

Parses an OSC 52 clipboard response. Returns `null` if the input does not contain a valid OSC 52 response sequence.

#### Bracketed Paste

```typescript
import { bracketedPaste, parseBracketedPaste } from '@celestial/nexus';

process.stdout.write(bracketedPaste.enable);

const content = parseBracketedPaste('\x1b[200~Hello World\x1b[201~');

process.stdout.write(bracketedPaste.disable);
```

#### `parseBracketedPaste(data: string): string | null`

Extracts pasted content from bracketed paste markers. Returns `null` if the input does not contain a valid bracketed paste sequence.

---

### Cross-platform parity primitives

These primitives translate atlas-detected terminal capabilities into the matching wire sequences. They are all stateless and browser-safe; capability gating happens at the call site.

#### Terminal focus (CSI 1004)

```typescript
import {
  terminalFocusEnable,
  terminalFocusDisable,
  parseTerminalFocusEvent,
} from '@celestial/nexus';

if (caps.focusEvents) process.stdout.write(terminalFocusEnable);

// On stdin data:
const ev = parseTerminalFocusEvent('\x1b[I'); // { type: 'focus-in' }
```

Distinct from `deriveFocusEvents` (UI focus-stack lifecycle inside the running TUI) — this is the **terminal emulator's own** focus state. Pause aether's animation reactor on `focus-out` to save CPU when backgrounded.

#### Kitty keyboard (CSI u)

```typescript
import {
  kittyKeyboardEnable,
  kittyKeyboardDisable,
  kittyKeyboardReset,
  parseKittyKeyboardEvent,
  withKittyKeyboard,
} from '@celestial/nexus';

// Capability-gated — returns empty strings when caps.kittyKeyboard is false.
const { enable, disable } = withKittyKeyboard(caps, { disambiguateEscape: true, reportEvents: true });
process.stdout.write(enable);
// ...later...
process.stdout.write(disable);

// On app exit (defensive — pops up to 5 nested flag sets):
process.stdout.write(kittyKeyboardReset);
```

Flag bits: `disambiguateEscape` (1) | `reportEvents` (2) | `reportAlternateKeys` (4) | `reportAllAsEscape` (8) | `reportAssociatedText` (16). `DEFAULT_KITTY_KEYBOARD_FLAGS` selects 1|2|4. `parseKittyKeyboardEvent` decodes codepoint, modifiers, event type (press/release/repeat), and associated text.

#### Mouse tracking — extended buttons + options

```typescript
import {
  enableMouseTracking,
  disableMouseTracking,
  parseMouseEvent,        // SGR → urxvt → X10 fallback chain
  parseSgrPixelMouseEvent,
} from '@celestial/nexus';

// motion: 'none' | 'button' | 'any'. Default 'button'.
process.stdout.write(enableMouseTracking({ motion: 'any', pixelPrecision: true }));

// MouseEvent.button now includes 3 (back) and 4 (forward).
// MouseEvent.type now includes 'scroll-left' and 'scroll-right'.
// MouseEvent.encoding reports which decoder won.
```

Legacy `mouseEnable` / `mouseDisable` string constants remain byte-identical for v0.0.1 callers.

#### Synchronized output (BSU / ESU)

```typescript
import { withSyncOutput } from '@celestial/nexus';

process.stdout.write(withSyncOutput(caps, frame));
// → frame unchanged when caps.synchronizedOutput is false;
// → '\x1b[?2026h<frame>\x1b[?2026l' when true.
```

#### Cursor shape

```typescript
import { setCursorShape, cursorShow, cursorHide } from '@celestial/nexus';

process.stdout.write(setCursorShape('bar', true));   // blinking bar
process.stdout.write(cursorHide);
```

#### Window title / tab color

```typescript
import { setWindowTitle, setIconAndTitle, setTabColor } from '@celestial/nexus';

process.stdout.write(setWindowTitle('Claude: Compacting…'));
process.stdout.write(setTabColor('#ff8800', { terminalName: caps.terminalName }));
```

`setWindowTitle` / `setIconAndTitle` strip `\x1b` / `\x07` / `\x9c` from the input so a hostile string cannot inject follow-on escapes. `setTabColor` chooses OSC 30 on Windows Terminal / conhost, OSC 6 (iTerm2) elsewhere; `null` resets.

#### Bell

```typescript
import { bell } from '@celestial/nexus';

process.stdout.write(bell());
```

#### External file drop

```typescript
import { parseTerminalFileDrop } from '@celestial/nexus';

const drop = parseTerminalFileDrop(stdinChunk);
// { paths: string[], origin: 'iterm2' | 'kitty' | 'wezterm' | 'generic' } | null
```

Covers iTerm2 (OSC 1337 `DragDrop=Files=`), kitty / WezTerm (OSC 50 `files=`), and a generic bracketed-paste fallback when every line is an absolute path. Returns `{paths: [], origin}` when a sequence is recognised but the payload couldn't be decoded — telemetry signal for "a drop happened, we couldn't read it".

---

### `@celestial/nexus/native` — Node-only IO subpath

```typescript
import { openUrl, isSshSession, detectClipboardTools } from '@celestial/nexus/native';

await openUrl('https://example.com');  // open / start / xdg-open / wslview
if (isSshSession()) { /* skip local-clipboard tools */ }
const probe = detectClipboardTools(); // { pbcopy, clip, wlCopy, xclip, xsel, … }
```

`openUrl` runs the URL through `new URL(url)` before any spawn (malformed → `ok:false, error:'invalid URL: …'`), never uses a shell, and uses `cmd /c start ""` on Windows to avoid the URL-being-parsed-as-title foot-gun.

---

## Complete API Surface

| Export | Kind | Description |
|--------|------|-------------|
| `detectCapabilities` | function | Full capability detection (authoritative) |
| `supportsHyperlinks` | function | Hyperlink support check (cached) |
| `supportsMouseTracking` | function | Mouse support check (cached) |
| `_resetCache` | function | Clear cached detection results |
| `fallback` | function | Build capability fallback chain |
| `withCapability` | function | Inline feature flag helper |
| `TerminalCapabilities` | type | Full capabilities shape |
| `FallbackChain` | type | Fallback chain interface |
| `hyperlink` | function | Generate OSC 8 hyperlink escape sequence |
| `HyperlinkOpts` | type | Hyperlink options |
| `parseMouseEvent` | function | Parse SGR 1006 escape sequence |
| `mouseEnable` | const | Enable mouse tracking sequence |
| `mouseDisable` | const | Disable mouse tracking sequence |
| `MouseEvent` | type | Parsed mouse event |
| `createGestureState` | function | Create gesture tracking state |
| `processGesture` | function | Process mouse event into gestures |
| `checkLongPress` | function | Check for long-press (timer-based) |
| `resolveGestureConfig` | function | Merge gesture config with defaults |
| `DEFAULT_GESTURE_CONFIG` | const | Default gesture thresholds |
| `GestureConfig` | type | Gesture configuration |
| `GestureEvent` | type | Recognized gesture union |
| `GestureState` | type | Internal gesture tracking state |
| `MouseEventData` | type | Mouse event data shape for gesture input |
| `HitMap` | class | O(n) region-based hit testing |
| `HitRegion` | type | Hit region definition |
| `CellHitMap` | class | O(1) grid-based hit testing |
| `ElementRegion` | type | Cell hit map region with event handlers (fields: `id`, `handlers`, `x`, `y`, `width`, `height`) |
| `EventHandlers` | type | Event handler tag interface |
| `writeClipboard` | function | Parallel OSC 52 + native shell-out clipboard write |
| `readClipboard` | function | OSC 52 read + native fallback clipboard read |
| `ClipboardResult` | type | `{ ok, source, error?, nativeTool?, durationMs? }` |
| `ClipboardWriteOpts` | type | DI surface for writeClipboard (spawn, env, recorder…) |
| `ClipboardReadOpts` | type | DI surface for readClipboard |
| `ClipboardSource` | type | `'osc52' \| 'native' \| 'both' \| 'none'` |
| `osc52Write` | function | Clipboard write (OSC 52, low-level) |
| `osc52ReadRequest` | function | Clipboard read request (OSC 52, low-level) |
| `parseOsc52Response` | function | Parse clipboard response |
| `bracketedPaste` | object | Bracketed paste enable/disable sequences |
| `parseBracketedPaste` | function | Extract pasted content |
| `terminalFocusEnable` | const | CSI 1004h |
| `terminalFocusDisable` | const | CSI 1004l |
| `parseTerminalFocusEvent` | function | Parse `\x1b[I` / `\x1b[O` |
| `TerminalFocusEvent` | type | `{ type: 'focus-in' \| 'focus-out' }` |
| `kittyKeyboardEnable` | function | Push kitty keyboard flag set (CSI > n u) |
| `kittyKeyboardDisable` | const | Pop one kitty flag set (CSI < u) |
| `kittyKeyboardReset` | const | Pop up to 5 kitty flag sets |
| `parseKittyKeyboardEvent` | function | Parse CSI u key event |
| `withKittyKeyboard` | function | Capability-gated enable/disable strings |
| `KittyKeyboardFlags` | type | 5-bit flag interface |
| `KittyKeyEvent` | type | Parsed kitty key event |
| `enableMouseTracking` | function | Compose mouse-enable sequence per opts |
| `disableMouseTracking` | function | Compose matching disable sequence |
| `parseSgrMouseEvent` | function | SGR 1006 parser |
| `parseSgrPixelMouseEvent` | function | SGR 1016 pixel-precision parser |
| `parseUrxvt1015MouseEvent` | function | urxvt 1015 parser |
| `parseX10MouseEvent` | function | X10 parser |
| `MouseTrackingOpts` | type | `{ motion, pixelPrecision, focusEvents, sgrEncoding }` |
| `syncOutputBegin` | const | CSI ?2026h (BSU) |
| `syncOutputEnd` | const | CSI ?2026l (ESU) |
| `withSyncOutput` | function | Wrap a frame when caps.synchronizedOutput |
| `setCursorShape` | function | DECSCUSR for block/underline/bar |
| `cursorShow` | const | CSI ?25h |
| `cursorHide` | const | CSI ?25l |
| `CursorShape` | type | `'block' \| 'underline' \| 'bar'` |
| `setWindowTitle` | function | OSC 2 (title only, sanitised) |
| `setIconAndTitle` | function | OSC 0 (icon + title) |
| `setTabColor` | function | OSC 6 (iTerm2) / OSC 30 (Windows Terminal) |
| `bell` | function | Audible BEL (`\x07`) |
| `BellOpts` | type | `{ visual? }` |
| `parseTerminalFileDrop` | function | iTerm2 / kitty / WezTerm / generic file-drop parser |
| `TerminalFileDrop` | type | `{ paths, origin }` |
| `createDragState` | function | Create drag state machine |
| `dragUpdate` | function | Process drag message |
| `isDragging` | function | Check if drag is active |
| `isDropped` | function | Check if a drop is awaiting reset |
| `getDroppedResult` | function | Extract sourceId/targetId/data from a dropped state |
| `getDragOffset` | function | Get drag offset from start |
| `DragPhase` | type | `'idle' | 'dragging' | 'dropped'` |
| `DragState` | type | Drag state union |
| `DragMsg` | type | Drag message union |
| `DropTarget` | type | Drop zone definition |
| `createSortableState` | function | Create sortable list state |
| `sortableUpdate` | function | Process sort message |
| `reorder` | function | Reorder array by moving item |
| `getPreviewOrder` | function | Get reorder preview during drag |
| `SortableState` | type | Sortable state shape |
| `SortableMsg` | type | Sortable message union |
| `createSelectionState` | function | Create multi-select state |
| `selectionUpdate` | function | Process selection message |
| `normalizeRange` | function | Normalize anchor/focus to start/end |
| `isCellSelected` | function | Check if a cell is in any selected range |
| `getSelectedText` | function | Extract text from selected cells |
| `mergeOverlappingRanges` | function | Merge overlapping/adjacent ranges |
| `SelectionMode` | type | `'linear' | 'box'` |
| `SelectionAnchor` | type | Row/col anchor point |
| `SelectionRange` | type | Anchor + focus + mode |
| `NormalizedRange` | type | Start/end row/col + mode |
| `MultiSelectState` | type | Committed ranges + active range |
| `SelectionMsg` | type | Selection message union |
| `createHoverIntentState` | function | Create hover intent state |
| `resolveHoverIntentConfig` | function | Merge config with defaults |
| `hoverIntentUpdate` | function | Process hover intent message |
| `DEFAULT_HOVER_INTENT_CONFIG` | const | Default hover intent thresholds |
| `HoverIntentConfig` | type | Hover intent configuration |
| `HoverPhase` | type | Hover intent phase union |
| `HoverIntentState` | type | Hover intent state shape |
| `HoverIntentMsg` | type | Hover intent message union |
| `HoverIntentEvent` | type | Hover intent event union |
| `createSpatialNavState` | function | Create spatial navigation state |
| `buildSpatialNavMap` | function | Build navigation map from regions |
| `spatialNavUpdate` | function | Process spatial nav message |
| `findSpatialNeighbor` | function | One-off neighbor lookup |
| `SpatialDirection` | type | `'up' | 'down' | 'left' | 'right'` |
| `SpatialRegion` | type | Region definition for nav |
| `SpatialNavMap` | type | Direction-to-ID lookup map |
| `SpatialNavState` | type | Spatial nav state shape |
| `SpatialNavMsg` | type | Spatial nav message union |
| `createResizeHandleState` | function | Create resize handle state |
| `resizeHandleUpdate` | function | Process resize message |
| `detectEdge` | function | Detect edge/corner at point |
| `applyConstraints` | function | Clamp rect to constraints |
| `edgeToCursor` | function | Map edge to cursor type |
| `ResizeEdge` | type | Edge/corner union |
| `ResizeCursor` | type | Resize cursor type union |
| `ResizeConstraints` | type | Resize constraints shape |
| `ResizableRect` | type | Rectangle with x, y, width, height |
| `ResizePhase` | type | `'idle' | 'hovering' | 'resizing'` |
| `ResizeHandleState` | type | Resize handle state shape |
| `ResizeHandleMsg` | type | Resize handle message union |
| `createScrollPhysicsState` | function | Create scroll physics state |
| `scrollPhysicsUpdate` | function | Process scroll message |
| `isScrollAnimating` | function | Check if scroll is in motion |
| `getScrollPosition` | function | Get current scroll offset |
| `AxisLock` | type | Axis lock mode union |
| `OverscrollConfig` | type | Overscroll configuration |
| `ScrollPhysicsConfig` | type | Scroll physics configuration |
| `ScrollPhysicsState` | type | Scroll physics state shape |
| `ScrollPhysicsMsg` | type | Scroll physics message union |
| `MomentumState` | type | Re-exported from @celestial/nebula |
| `SnapPoint` | type | Re-exported from @celestial/nebula |
| `createPointerState` | function | Create pointer/cursor state |
| `pointerUpdate` | function | Process pointer message |
| `resolvedCursor` | function | Get current resolved cursor |
| `claimFromHitRegion` | function | Create cursor claim from HitRegion |
| `CursorType` | type | Cursor type union |
| `CursorPriority` | type | Cursor priority union |
| `CursorClaim` | type | Cursor claim shape |
| `PointerState` | type | Pointer state shape |
| `PointerMsg` | type | Pointer message union |

---

## Related Packages

- **@celestial/nebula** — Core runtime
- **@celestial/constellation** — Clickable components built on nexus
- **Appendix B example** — [`examples/nexus-tooltip-demo/README.md`](../../examples/nexus-tooltip-demo/README.md)

## License

MIT
