/**
 * Horizon Floating/Stack Layout
 *
 * Renders an overlay VNode on top of a base VNode at a specific position.
 * Uses the native nebula overlay element for proper z-index management.
 */

import { type ComponentNode, type LayerFocusMode, layerStack, overlay as nebulaOverlay, type VNode } from '@celestial/core/nebula';

export interface FloatingConfig {
  /** Background content */
  base: VNode;
  /** Floating content rendered on top */
  overlay: VNode;
  /** Overlay position — column offset from left */
  x: number;
  /** Overlay position — row offset from top */
  y: number;
  /** Overlay width in cells */
  width: number;
  /** Overlay height in cells */
  height: number;
  /** Optional z-index for the overlay (defaults to 10) */
  zIndex?: number;
  /** Stable layoutId for compositor-driven visual motion. */
  layoutId?: string;
  /** Preserve base cells not explicitly painted by the floating content. Default true. */
  transparent?: boolean;
  /** Keyboard-focus ownership for the floating layer. */
  focusMode?: LayerFocusMode;
}

/**
 * Render a floating overlay on top of base content.
 *
 * Uses nebula's native overlay element which integrates into the
 * layout engine's overlay collector for correct z-index sorting.
 */
export function floating(config: FloatingConfig): VNode {
  const { base, overlay, x, y, width, height, zIndex = 10, layoutId, transparent = true, focusMode } = config;

  return {
    kind: 'component',
    render: () =>
      layerStack(
        base,
        nebulaOverlay(overlay, {
          x,
          y,
          width,
          height,
          zIndex,
          layoutId,
          transparent,
          focusMode,
        }),
      ),
  } satisfies ComponentNode;
}
