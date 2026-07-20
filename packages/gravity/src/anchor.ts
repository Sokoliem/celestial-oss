import { absolute } from './absolute.js';
import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { ComponentNode, MeasurementSpace, VNode } from './types.js';

export type AnchorSide = 'top' | 'bottom' | 'left' | 'right';
export type AnchorAlign = 'start' | 'center' | 'end';

/** All 12 placements: <side>-<align>. */
export type AnchorPlacement =
  | 'top-start'
  | 'top-center'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-center'
  | 'bottom-end'
  | 'left-start'
  | 'left-center'
  | 'left-end'
  | 'right-start'
  | 'right-center'
  | 'right-end';

export interface AnchorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AnchorOptions {
  /** Trigger rect (already known). Either this or `regionId` must resolve. */
  readonly trigger?: AnchorRect;
  /**
   * Trigger by region id; the host supplies a `resolveRegion` callback that
   * returns the rect (or null if the trigger is not currently mounted).
   */
  readonly regionId?: string;
  readonly resolveRegion?: (id: string) => AnchorRect | null;
  readonly placement?: AnchorPlacement;
  /** Auto-flip to the opposite side when the chosen placement overflows. */
  readonly flip?: boolean;
  /** Shift inward to fit when the popover would clip the viewport. */
  readonly shift?: boolean;
  /** Cells between the trigger and the popover. Defaults to 0. */
  readonly offset?: number;
  /** Z-index for the emitted overlay. */
  readonly zIndex?: number;
  /** Marks the overlay transparent for empty cells. */
  readonly transparent?: boolean;
  readonly child: VNode;
}

export interface ResolvedAnchorPlacement {
  readonly placement: AnchorPlacement;
  readonly side: AnchorSide;
  readonly align: AnchorAlign;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_PLACEMENT: AnchorPlacement = 'bottom-start';

function splitPlacement(placement: AnchorPlacement): { side: AnchorSide; align: AnchorAlign } {
  const [side, align] = placement.split('-') as [AnchorSide, AnchorAlign];
  return { side, align };
}

function joinPlacement(side: AnchorSide, align: AnchorAlign): AnchorPlacement {
  return `${side}-${align}` as AnchorPlacement;
}

function flipSide(side: AnchorSide): AnchorSide {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function computeMain(side: AnchorSide, trigger: AnchorRect, popoverSize: { width: number; height: number }, offset: number): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: trigger.x, y: trigger.y - offset - popoverSize.height };
    case 'bottom':
      return { x: trigger.x, y: trigger.y + trigger.height + offset };
    case 'left':
      return { x: trigger.x - offset - popoverSize.width, y: trigger.y };
    case 'right':
      return { x: trigger.x + trigger.width + offset, y: trigger.y };
  }
}

function applyAlignment(
  side: AnchorSide,
  align: AnchorAlign,
  position: { x: number; y: number },
  trigger: AnchorRect,
  popoverSize: { width: number; height: number },
): { x: number; y: number } {
  // Side `top` and `bottom` align along the X axis; `left` and `right` align along Y.
  const horizontalSide = side === 'top' || side === 'bottom';

  if (horizontalSide) {
    let x = position.x;
    if (align === 'center') {
      x = trigger.x + Math.floor((trigger.width - popoverSize.width) / 2);
    } else if (align === 'end') {
      x = trigger.x + trigger.width - popoverSize.width;
    }
    return { x, y: position.y };
  }

  let y = position.y;
  if (align === 'center') {
    y = trigger.y + Math.floor((trigger.height - popoverSize.height) / 2);
  } else if (align === 'end') {
    y = trigger.y + trigger.height - popoverSize.height;
  }
  return { x: position.x, y };
}

function fitsWithin(position: { x: number; y: number }, popoverSize: { width: number; height: number }, terminal: MeasurementSpace): boolean {
  return position.x >= 0 && position.y >= 0 && position.x + popoverSize.width <= terminal.cols && position.y + popoverSize.height <= terminal.rows;
}

function shiftInBounds(
  position: { x: number; y: number },
  popoverSize: { width: number; height: number },
  terminal: MeasurementSpace,
): { x: number; y: number } {
  const x = Math.max(0, Math.min(terminal.cols - popoverSize.width, position.x));
  const y = Math.max(0, Math.min(terminal.rows - popoverSize.height, position.y));
  return { x, y };
}

/**
 * Pure placement math. Computes the (x, y) position for a popover relative
 * to a trigger rect under a target placement, with optional flip-then-shift
 * to keep the popover on-screen.
 *
 * `flip` runs before `shift`: if the desired side overflows, the opposite
 * side is tried; whichever side has more room wins. After the side is
 * locked, `shift` clamps the position into the terminal viewport.
 */
export function resolveAnchorPlacement(
  trigger: AnchorRect,
  popoverSize: { width: number; height: number },
  terminal: MeasurementSpace,
  opts?: { placement?: AnchorPlacement; flip?: boolean; shift?: boolean; offset?: number },
): ResolvedAnchorPlacement {
  const placement = opts?.placement ?? DEFAULT_PLACEMENT;
  const { side: initialSide, align } = splitPlacement(placement);
  const offset = Math.max(0, opts?.offset ?? 0);

  let side = initialSide;
  let main = computeMain(side, trigger, popoverSize, offset);
  let aligned = applyAlignment(side, align, main, trigger, popoverSize);

  if ((opts?.flip ?? false) && !fitsWithin(aligned, popoverSize, terminal)) {
    const flippedSide = flipSide(initialSide);
    const flippedMain = computeMain(flippedSide, trigger, popoverSize, offset);
    const flippedAligned = applyAlignment(flippedSide, align, flippedMain, trigger, popoverSize);

    // Pick whichever side has more in-bounds area along the side axis.
    const initialOverflow = sideAxisOverflow(initialSide, aligned, popoverSize, terminal);
    const flippedOverflow = sideAxisOverflow(flippedSide, flippedAligned, popoverSize, terminal);

    if (flippedOverflow < initialOverflow) {
      side = flippedSide;
      main = flippedMain;
      aligned = flippedAligned;
    }
  }

  let final = aligned;
  if (opts?.shift ?? false) {
    final = shiftInBounds(aligned, popoverSize, terminal);
  }

  return {
    placement: joinPlacement(side, align),
    side,
    align,
    x: final.x,
    y: final.y,
    width: popoverSize.width,
    height: popoverSize.height,
  };
}

function sideAxisOverflow(
  side: AnchorSide,
  position: { x: number; y: number },
  popoverSize: { width: number; height: number },
  terminal: MeasurementSpace,
): number {
  if (side === 'top') return Math.max(0, -position.y);
  if (side === 'bottom') return Math.max(0, position.y + popoverSize.height - terminal.rows);
  if (side === 'left') return Math.max(0, -position.x);
  return Math.max(0, position.x + popoverSize.width - terminal.cols);
}

function resolveTriggerRect(opts: AnchorOptions): AnchorRect | null {
  if (opts.trigger) return opts.trigger;
  if (opts.regionId && opts.resolveRegion) {
    return opts.resolveRegion(opts.regionId);
  }
  return null;
}

export function anchor(options: AnchorOptions): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const trigger = resolveTriggerRect(options);
      if (!trigger) {
        return { kind: 'empty' };
      }

      const measured = measureNodeWithContext(options.child, measurementContext);
      const popoverSize = { width: Math.max(0, measured.width), height: Math.max(0, measured.height) };

      const placement = resolveAnchorPlacement(trigger, popoverSize, measurementContext.terminal, {
        placement: options.placement,
        flip: options.flip,
        shift: options.shift,
        offset: options.offset,
      });

      return absolute(options.child, {
        left: placement.x,
        top: placement.y,
        width: placement.width,
        height: placement.height,
        zIndex: options.zIndex,
        transparent: options.transparent,
      }).render(renderContext);
    },
  };
}

// ─── Popover ─────────────────────────────────────────────────────────────────

export interface PopoverOptions extends Omit<AnchorOptions, 'child'> {
  /**
   * Required. The host routes Esc through `routeKeyboard` (nexus
   * layer-keyboard) using this id; `popover` itself only annotates the
   * region. There is NO non-dismissible surface.
   */
  readonly escapeId: string;
  /**
   * Hardcoded fallback background color for the surface card. Required to
   * satisfy the CLAUDE.md "always opaque" surface invariant — surfaces never
   * rely on theme-variable cascade alone. Defaults to `#000000`.
   */
  readonly background?: string;
  /** Renderable popover body. */
  readonly child: VNode;
  /** Optional label surfaced through the region metadata. */
  readonly label?: string;
}

const DEFAULT_OPAQUE_BACKGROUND = '#000000';

/**
 * Anchored popover surface. Satisfies CLAUDE.md surface invariants:
 *
 *   - Always escapable: emits an event region carrying `metadata.escapeId`
 *     so the host can route Esc through `routeKeyboard` (nexus
 *     layer-keyboard). Caller is responsible for wiring the dismiss handler;
 *     gravity does not own visibility.
 *   - Always opaque: wraps the body in a box with a hardcoded `bg` fallback
 *     (defaults to `#000000`); never relies on CSS-variable cascade alone.
 *   - Client-owned visibility: gravity does not gate display on a server
 *     ack; the host optimistically removes this node from the tree on
 *     dismiss.
 */
export function popover(options: PopoverOptions): ComponentNode {
  const background = options.background ?? DEFAULT_OPAQUE_BACKGROUND;

  const opaqueChild: VNode = {
    kind: 'box',
    style: { bg: background },
    overflow: 'hidden',
    children: [options.child],
  };

  const dismissibleChild: VNode = {
    kind: 'event',
    id: `popover:${options.escapeId}`,
    child: opaqueChild,
    handlers: {},
    metadata: {
      intent: 'dismiss',
      affordances: ['click'],
      label: options.label,
      extra: {
        popover: true,
        escapeId: options.escapeId,
        background,
      },
    },
  };

  return anchor({
    ...options,
    child: dismissibleChild,
  });
}

// ─── Popover caret ───────────────────────────────────────────────────────

export interface PopoverCaretOptions {
  /**
   * The placement returned by `resolveAnchorPlacement`. The caret points
   * back toward the trigger, which sits on the *opposite* side of the
   * popover from `placement`'s side. (E.g. `placement: 'bottom-start'`
   * means the popover is BELOW the trigger; the caret should point UP
   * toward the trigger.)
   */
  placement: AnchorPlacement;
  /**
   * Override the default per-side glyph. When omitted, defaults are
   * `top → ▼`, `bottom → ▲`, `left → ▶`, `right → ◀` — i.e. the glyph
   * points back at the trigger from the popover's perspective.
   */
  glyph?: string;
}

const DEFAULT_CARET_GLYPHS: Record<AnchorSide, string> = {
  // The popover sits below the trigger ⇒ caret on the popover's top edge,
  // pointing up.
  bottom: '▲',
  // Popover above ⇒ caret on its bottom, pointing down.
  top: '▼',
  // Popover to the right ⇒ caret on its left, pointing left.
  right: '◀',
  // Popover to the left ⇒ caret on its right, pointing right.
  left: '▶',
};

/**
 * Single-cell glyph that points back at the trigger from a popover. Compose
 * with `popover()` so the trigger relationship reads visually. Auto-flips
 * its glyph when used with the resolved placement returned by
 * `resolveAnchorPlacement` (e.g. when `flip: true` swaps the side).
 *
 * Example:
 * ```ts
 * const placement = resolveAnchorPlacement(trigger, size, terminal, opts);
 * column([
 *   placement.side === 'bottom' ? popoverCaret({ placement: placement.placement }) : empty,
 *   popover({ ... }),
 * ]);
 * ```
 */
export function popoverCaret(options: PopoverCaretOptions): VNode {
  const { side } = splitPlacement(options.placement);
  const content = options.glyph ?? DEFAULT_CARET_GLYPHS[side];
  return { kind: 'text', content };
}
