import type { LayoutRect } from '@celestial/core/nebula';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PaneGeometry {
  readonly id: string;
  readonly rect: LayoutRect;
}

export interface WindowBounds extends Rect {}

export interface SplitGeometry {
  readonly splitId: string;
  readonly direction: 'horizontal' | 'vertical';
  readonly separatorX: number;
  readonly separatorY: number;
  readonly separatorWidth: number;
  readonly separatorHeight: number;
  readonly totalSize: number;
  readonly firstPaneX: number;
  readonly firstPaneY: number;
  readonly firstPaneWidth: number;
  readonly firstPaneHeight: number;
  readonly secondPaneX: number;
  readonly secondPaneY: number;
  readonly secondPaneWidth: number;
  readonly secondPaneHeight: number;
}

export interface TabRegion {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

export interface TabGeometry {
  readonly tabbedId: string;
  readonly tabs: readonly TabRegion[];
}

export interface FloatGeometry {
  readonly floatId: string;
  /** Optional outer frame. Supply this when the title bar is inset from a border so all eight resize handles are addressable. */
  readonly frame?: Rect;
  readonly draggable?: boolean;
  readonly resizable?: boolean;
  readonly titleBarEndInset?: number;
  readonly titleBarX: number;
  readonly titleBarY: number;
  readonly titleBarWidth: number;
  readonly titleBarHeight: number;
  readonly contentX: number;
  readonly contentY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

export interface GeometryCache {
  readonly splits: readonly SplitGeometry[];
  readonly tabs: readonly TabGeometry[];
  readonly floats: readonly FloatGeometry[];
  readonly panes: readonly RectWithId[];
}

export interface RectWithId extends Rect {
  readonly id: string;
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
