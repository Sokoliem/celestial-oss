/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { VNode } from './nodes.js';
import { resolveRenderContext } from './planning-context.js';
import { getBreakpoint, normalizeSides, resolveResponsive, resolveStyle } from './responsive.js';
import { resolveLazy, resolveLocalState, resolveMemo } from './state.js';
import type { ComponentRenderContext } from './style.js';
import { visualWidth, wrapText } from './visual-width.js';

const TEXT_MEASUREMENT_CACHE = new Map<string, { width: number; height: number }>();

export function measure(node: VNode, containerWidth: number = 80, context?: Partial<ComponentRenderContext>): { width: number; height: number } {
  const renderContext = constrainRenderContext(resolveRenderContext(containerWidth, context), containerWidth);
  const bp = getBreakpoint(renderContext.container.cols);
  switch (node.kind) {
    case 'text': {
      let content = node.content;
      if (node.style) {
        const resolvedStyle = resolveStyle(node.style, bp);
        if (resolvedStyle?.icon) {
          content = `${resolvedStyle.icon} ${content}`;
        }
      }
      const cacheKey = `${bp}:${node.wrap ? renderContext.container.cols : 'nowrap'}:${content}`;
      const cached = TEXT_MEASUREMENT_CACHE.get(cacheKey);
      if (cached) {
        return cached;
      }
      const lines = node.wrap ? wrapText(content, renderContext.container.cols) : content.split('\n');
      const measured = {
        width: lines.reduce((max, l) => Math.max(max, visualWidth(l)), 0),
        height: lines.length,
      };
      TEXT_MEASUREMENT_CACHE.set(cacheKey, measured);
      return measured;
    }
    case 'empty':
      return { width: resolveResponsive(node.width, bp) ?? 0, height: resolveResponsive(node.height, bp) ?? 1 };
    case 'row': {
      const gap = node.gap ?? 0;
      const sizes: Array<{ width: number; height: number }> = [];
      let remainingWidth = renderContext.container.cols;
      for (let index = 0; index < node.children.length; index++) {
        if (index > 0) remainingWidth = Math.max(0, remainingWidth - gap);
        const measured = measure(node.children[index]!, remainingWidth, renderContext);
        const width = Math.min(measured.width, remainingWidth);
        sizes.push({ width, height: measured.height });
        remainingWidth = Math.max(0, remainingWidth - width);
      }
      return {
        width: sizes.reduce((sum, s, i) => sum + s.width + (i > 0 ? gap : 0), 0),
        height: sizes.reduce((max, s) => Math.max(max, s.height), 0),
      };
    }
    case 'column': {
      const sizes = node.children.map((c) => measure(c, renderContext.container.cols, renderContext));
      const gap = node.gap ?? 0;
      return {
        width: sizes.reduce((max, s) => Math.max(max, s.width), 0),
        height: sizes.reduce((sum, s, i) => sum + s.height + (i > 0 ? gap : 0), 0),
      };
    }
    case 'box': {
      const resolvedW = resolveResponsive(node.width, bp);
      const resolvedH = resolveResponsive(node.height, bp);
      const borderW = node.border ? 2 : 0;
      const borderH = node.border ? 2 : 0;
      const padding = normalizeSides(resolveResponsive(node.style?.padding, bp) ?? 0);
      const constrainedOuterWidth = Math.min(resolvedW ?? renderContext.container.cols, renderContext.container.cols);
      const innerWidth = Math.max(0, constrainedOuterWidth - borderW - padding[1] - padding[3]);
      const inner = node.children.length > 0 ? measure({ kind: 'column', children: node.children }, innerWidth, renderContext) : { width: 0, height: 0 };
      let boxW = resolvedW ?? inner.width + borderW + padding[1] + padding[3];
      let boxH = resolvedH ?? inner.height + borderH + padding[0] + padding[2];
      if (node.minWidth !== undefined) boxW = Math.max(node.minWidth, boxW);
      if (node.maxWidth !== undefined) boxW = Math.min(node.maxWidth, boxW);
      if (node.minHeight !== undefined) boxH = Math.max(node.minHeight, boxH);
      if (node.maxHeight !== undefined) boxH = Math.min(node.maxHeight, boxH);
      return { width: boxW, height: boxH };
    }
    case 'scroll':
      return { width: measure(node.child, renderContext.container.cols, renderContext).width, height: node.height };
    case 'focus':
      return measure(node.child, renderContext.container.cols, renderContext);
    case 'component':
      return measure(node.render(renderContext), renderContext.container.cols, renderContext);
    case 'event':
      return measure(node.child, renderContext.container.cols, renderContext);
    case 'hover':
      return measure(node.child, renderContext.container.cols, renderContext);
    case 'image':
      return { width: node.width, height: node.height };
    case 'overlay':
      // Overlays don't participate in flow layout — they measure as 0×0
      return { width: 0, height: 0 };
    case 'flex':
      // Flex delegates to its child's natural size
      return measure(node.child, renderContext.container.cols, renderContext);
    case 'memo':
      return measure(resolveMemo(node), renderContext.container.cols, renderContext);
    case 'suspense':
      return measure(node.resolved ? node.child : node.fallback, renderContext.container.cols, renderContext);
    case 'portal':
      return { width: 0, height: 0 };
    case 'localState':
      return measure(resolveLocalState(node), renderContext.container.cols, renderContext);
    case 'lazy':
      return measure(resolveLazy(node), renderContext.container.cols, renderContext);
    case 'tabGroup': {
      if (node.orientation === 'horizontal') {
        const sizes = node.children.map((child) => measure(child, renderContext.container.cols, renderContext));
        return {
          width: sizes.reduce((sum, s) => sum + s.width, 0),
          height: sizes.reduce((max, s) => Math.max(max, s.height), 0),
        };
      } else {
        const sizes = node.children.map((child) => measure(child, renderContext.container.cols, renderContext));
        return {
          width: sizes.reduce((max, s) => Math.max(max, s.width), 0),
          height: sizes.reduce((sum, s) => sum + s.height, 0),
        };
      }
    }
  }
}

function constrainRenderContext(context: ComponentRenderContext, containerWidth: number): ComponentRenderContext {
  const cols = Math.max(0, Math.floor(containerWidth));
  return {
    terminal: context.terminal,
    available: { ...context.available, cols },
    container: { ...context.container, cols },
  };
}
