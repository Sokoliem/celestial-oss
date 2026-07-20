/**
 * Shared test helpers for `@celestial/gravity` consumers and contributors.
 * Imported via the secondary entry: `import {...} from '@celestial/gravity/testing'`.
 *
 * These wrap patterns that surfaced across multiple test files in the
 * package — keep them dependency-light and side-effect-free so they can be
 * pulled into downstream packages' tests as well.
 */

import type { ComponentRenderContext, VNode } from '@celestial/nebula';
import type { SplitterController } from './splitter-controller-types.js';
import type { ScrollController } from './virtual-list.js';

// ─── Measurement context ─────────────────────────────────────────────────

export interface MockMeasurementOptions {
  /** Default 80. */
  cols?: number;
  /** Default 24. */
  rows?: number;
  /** Override the `available` space (defaults to terminal). */
  available?: { cols: number; rows: number };
  /** Override the `container` space (defaults to terminal). */
  container?: { cols: number; rows: number };
}

/**
 * Build a `ComponentRenderContext` suitable for invoking
 * `node.render(ctx)` on `kind: 'component'` VNodes in tests.
 *
 * Defaults: 80×24 terminal where `available === container === terminal`.
 */
export function createMockMeasurementContext(opts: MockMeasurementOptions = {}): ComponentRenderContext {
  const cols = Math.max(1, opts.cols ?? 80);
  const rows = Math.max(1, opts.rows ?? 24);
  const terminal = { cols, rows };
  return {
    terminal,
    available: opts.available ?? terminal,
    container: opts.container ?? terminal,
  };
}

// ─── Tree resolution ─────────────────────────────────────────────────────

/**
 * Recursively render `kind: 'component'` VNodes until a static node is
 * reached. Standard helper for inspecting layout output in tests without
 * standing up a full nebula renderer.
 */
export function resolveTree(node: VNode, opts: MockMeasurementOptions = {}): VNode {
  const ctx = createMockMeasurementContext(opts);
  let current: VNode = node;
  // Bound the loop — components that infinitely recurse are bugs, not tests.
  for (let depth = 0; depth < 64; depth++) {
    if (current.kind !== 'component') return current;
    current = current.render(ctx);
  }
  throw new Error('resolveTree exceeded 64 levels of component nesting; check for an infinite render loop.');
}

// ─── Splitter drag simulation ────────────────────────────────────────────

export interface SplitterDragOptions<TId extends string> {
  /** The pane to the LEFT (or ABOVE) of the seam being dragged. */
  leading: TId;
  /** Total cells along the splitter axis (cols for `row`, rows for `column`). */
  totalAxis: number;
  /** Current width of the leading pane in cells (from previous render). */
  fromWidth: number;
  /** Target width after the drag, in cells. */
  toWidth: number;
}

/**
 * Simulate a host-driven drag on a splitter handle. Mirrors how a real host
 * wires `resizeHandleUpdate` from `@celestial/nexus`: compute the new leading
 * width, divide by the axis size, and feed that ratio to `setWeight`.
 *
 * Splitter is render-pure; this helper documents the contract that real
 * hosts must implement.
 */
export function simulateSplitterDrag<TId extends string>(controller: SplitterController<TId>, opts: SplitterDragOptions<TId>): void {
  const total = Math.max(1, opts.totalAxis);
  const target = Math.max(0, Math.min(total, opts.toWidth));
  controller.setWeight(opts.leading, target / total);
}

// ─── Scroll simulation ───────────────────────────────────────────────────

/**
 * Advance a scroll controller by `delta` rows (positive = down, negative =
 * up). Snap-aware controllers will round per their snap mode.
 */
export function simulateScroll(controller: ScrollController, delta: number): void {
  controller.setOffset(controller.offset() + delta);
}

// ─── Animation timing ────────────────────────────────────────────────────

export interface FakeClock {
  /** Current logical timestamp in ms. */
  now(): number;
  /** Move the clock forward by `ms`. */
  advance(ms: number): void;
  /** Reset the clock to a specific value. */
  reset(value?: number): void;
}

/**
 * A monotonic fake clock for spring/tween-driven primitives whose update
 * loops accept an explicit `now`. Replaces the per-test `let now = 0`
 * boilerplate.
 */
export function fakeNow(start = 0): FakeClock {
  let value = start;
  return {
    now: () => value,
    advance: (ms) => {
      value += Math.max(0, ms);
    },
    reset: (next = 0) => {
      value = Math.max(0, next);
    },
  };
}

export interface TickOptions<Model, Msg> {
  /** Total simulated time to advance, in ms. */
  duration: number;
  /** Frame stride in ms. Default 16 (≈60fps). */
  step?: number;
  /** Build the tick message for the model at each frame. */
  tick: (now: number) => Msg;
  /** Reducer applied at each frame. */
  update: (msg: Msg, model: Model) => Model;
  /** Optional clock to share across multiple tickModel calls. */
  clock?: FakeClock;
  /** Predicate to halt early (e.g. animation settled). */
  until?: (model: Model) => boolean;
}

/**
 * Step an Elm-style model forward via repeated tick messages. Useful for
 * spring-driven primitives (`carousel`, `collapsible`) where an animation
 * needs to be advanced over simulated time without a real RAF.
 *
 * Returns the final model and the final clock value.
 */
export function tickModel<Model, Msg>(initial: Model, opts: TickOptions<Model, Msg>): { model: Model; now: number } {
  const step = Math.max(1, opts.step ?? 16);
  const clock = opts.clock ?? fakeNow();
  let model = initial;
  const end = clock.now() + Math.max(0, opts.duration);
  while (clock.now() < end) {
    clock.advance(step);
    model = opts.update(opts.tick(clock.now()), model);
    if (opts.until?.(model)) break;
  }
  return { model, now: clock.now() };
}
