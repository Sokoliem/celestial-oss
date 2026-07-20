import { color } from '@celestial/core/corona';
import { column, text, type VNode } from '@celestial/core/nebula';
import type { ConstraintModel } from './constraints.js';
import type { FocusModel } from './focus.js';
import type { ScrollRegionModel } from './scroll.js';

export interface LayoutInspectorConfig {
  enabled: boolean;
  showPaneIds?: boolean;
  showFocusIndicator?: boolean;
  showConstraints?: boolean;
  showScrollPositions?: boolean;
  showDimensions?: boolean;
}

const C = {
  dim: color.gray.fg(),
  reset: color.reset.fg(),
  cyan: color.brightCyan.fg(),
  green: color.brightGreen.fg(),
  yellow: color.brightYellow.fg(),
  red: color.brightRed.fg(),
  white: color.brightWhite.fg(),
};

export function layoutInspector(
  models: {
    focus?: FocusModel;
    constraints?: ConstraintModel;
    scroll?: Map<string, ScrollRegionModel>;
  },
  config: LayoutInspectorConfig,
): VNode | null {
  if (!config.enabled) return null;

  const lines: VNode[] = [];

  lines.push(text(`${C.cyan}═══ Layout Inspector ═══${C.reset}`));
  lines.push(text(''));

  if (config.showFocusIndicator && models.focus) {
    const focusedId = models.focus.focusedId;
    if (focusedId) {
      lines.push(text(`${C.green}● Focused: ${focusedId}${C.reset}`));
    } else {
      lines.push(text(`${C.dim}○ No pane focused${C.reset}`));
    }
    lines.push(text(''));
  }

  if (config.showPaneIds && models.focus) {
    const paneIds = models.focus.tabOrder;
    if (paneIds.length > 0) {
      lines.push(text(`${C.yellow}Pane IDs:${C.reset}`));
      for (const id of paneIds) {
        const isFocused = models.focus.focusedId === id;
        lines.push(text(isFocused ? `  ${C.green}▶ ${id}${C.reset}` : `  ${C.dim}  ${id}${C.reset}`));
      }
      lines.push(text(''));
    }
  }

  if (config.showConstraints && models.constraints) {
    const constraints = models.constraints.constraints;
    const paneIds = Object.keys(constraints);
    if (paneIds.length > 0) {
      lines.push(text(`${C.yellow}Constraints:${C.reset}`));
      for (const paneId of paneIds) {
        const c = constraints[paneId];
        if (c) {
          const parts: string[] = [];
          if (c.minWidth !== undefined) parts.push(`minW:${c.minWidth}`);
          if (c.maxWidth !== undefined) parts.push(`maxW:${c.maxWidth}`);
          if (c.minHeight !== undefined) parts.push(`minH:${c.minHeight}`);
          if (c.maxHeight !== undefined) parts.push(`maxH:${c.maxHeight}`);
          if (c.locked) parts.push('locked');
          if (c.collapsed) parts.push('collapsed');
          lines.push(text(`  ${paneId}: ${parts.join(', ')}`));
        }
      }
      lines.push(text(''));
    }
  }

  if (config.showScrollPositions && models.scroll) {
    const scrollIds = Array.from(models.scroll.keys());
    if (scrollIds.length > 0) {
      lines.push(text(`${C.yellow}Scroll Positions:${C.reset}`));
      for (const id of scrollIds) {
        const s = models.scroll.get(id);
        if (s) {
          lines.push(text(`  ${id}: y=${s.scrollY}, x=${s.scrollX}`));
        }
      }
      lines.push(text(''));
    }
  }

  if (config.showDimensions) {
    const cols = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    lines.push(text(`${C.dim}Terminal: ${cols}×${rows}${C.reset}`));
  }

  return column(...lines);
}

export interface LayoutTreeInspectorConfig {
  expanded?: Set<string>;
  showTypes?: boolean;
  showLayoutIds?: boolean;
}

export function layoutTreeInspector(root: VNode, config?: LayoutTreeInspectorConfig): VNode {
  const lines: VNode[] = [];

  function renderNode(node: VNode, depth: number, prefix: string): void {
    const indent = '  '.repeat(depth);

    let label: string = '';

    if (node.layoutId) {
      label = config?.showLayoutIds !== false ? `${C.cyan}[${node.layoutId}]${C.reset} ` : '';
    }

    if (config?.showTypes !== false) {
      label += `${C.dim}${node.kind}${C.reset}`;
    }

    if (node.kind === 'text') {
      const preview = node.content.slice(0, 30);
      label += ` ${C.white}"${preview}${node.content.length > 30 ? '...' : ''}"${C.reset}`;
    }

    lines.push(text(`${indent}${prefix}${label}`));

    if ('children' in node && Array.isArray(node.children)) {
      const nodeChildren = node.children as VNode[];
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i];
        if (!child) continue;
        const isLast = i === nodeChildren.length - 1;
        const childPrefix = isLast ? '└─ ' : '├─ ';
        renderNode(child, depth + 1, childPrefix);
      }
    }
  }

  lines.push(text(`${C.cyan}═══ Layout Tree ═══${C.reset}`));
  lines.push(text(''));
  renderNode(root, 0, '');

  return column(...lines);
}

let debugLoggingEnabled = false;

export function enableLayoutDebugLogging(): void {
  debugLoggingEnabled = true;
}

export function disableLayoutDebugLogging(): void {
  debugLoggingEnabled = false;
}

export function isDebugLoggingEnabled(): boolean {
  return debugLoggingEnabled;
}

export function layoutDebugLog(message: string, ...args: unknown[]): void {
  if (debugLoggingEnabled) {
    console.log(`[horizon] ${message}`, ...args);
  }
}

export interface LayoutPerformanceMetrics {
  renderTime: number;
  layoutTime: number;
  animationCount: number;
  lastRenderTimestamp: number;
}

let performanceMetrics: LayoutPerformanceMetrics = {
  renderTime: 0,
  layoutTime: 0,
  animationCount: 0,
  lastRenderTimestamp: 0,
};

export function getLayoutPerformanceMetrics(): LayoutPerformanceMetrics {
  return { ...performanceMetrics };
}

export function recordRenderTime(time: number): void {
  performanceMetrics.renderTime = time;
  performanceMetrics.lastRenderTimestamp = Date.now();
}

export function recordLayoutTime(time: number): void {
  performanceMetrics.layoutTime = time;
}

export function incrementAnimationCount(): void {
  performanceMetrics.animationCount++;
}

export function resetPerformanceMetrics(): void {
  performanceMetrics = {
    renderTime: 0,
    layoutTime: 0,
    animationCount: 0,
    lastRenderTimestamp: 0,
  };
}
