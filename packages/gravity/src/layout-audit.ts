import type { HitRegionInfo, LayoutEntry, LayoutPlan, LayoutRect, VNode } from '@celestial/nebula';
import { collectHitRegions, planLayout } from '@celestial/nebula';

export type LayoutAuditIssueCode = 'entry-out-of-bounds' | 'region-out-of-bounds' | 'interactive-zero-size' | 'interactive-missing-label';

export interface LayoutAuditIssue {
  readonly code: LayoutAuditIssueCode;
  readonly id: string;
  readonly message: string;
  readonly rect: LayoutRect;
}

export interface LayoutAuditOptions {
  readonly width: number;
  readonly height: number;
  readonly requireInteractiveLabels?: boolean;
}

export interface LayoutAuditResult {
  readonly ok: boolean;
  readonly issues: readonly LayoutAuditIssue[];
}

function rectWithin(rect: LayoutRect, width: number, height: number): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.width >= 0 && rect.height >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height;
}

function hasInteractiveHandler(region: HitRegionInfo): boolean {
  const handlers = region.handlers;
  return (
    handlers.onClick !== undefined ||
    handlers.onRightClick !== undefined ||
    handlers.onMouseDown !== undefined ||
    handlers.onMouseUp !== undefined ||
    handlers.onMouseMove !== undefined ||
    handlers.onScroll !== undefined ||
    handlers.onClickCapture !== undefined ||
    handlers.onRightClickCapture !== undefined ||
    handlers.onMouseDownCapture !== undefined ||
    handlers.onMouseUpCapture !== undefined ||
    handlers.onMouseMoveCapture !== undefined ||
    handlers.onScrollCapture !== undefined
  );
}

function hasLabel(region: HitRegionInfo): boolean {
  return Boolean(region.metadata?.label || region.metadata?.summary || region.metadata?.detail || region.metadata?.intent);
}

function collectEntryIssues(entry: LayoutEntry, options: LayoutAuditOptions, issues: LayoutAuditIssue[]): void {
  if (!rectWithin(entry.rect, options.width, options.height)) {
    issues.push({
      code: 'entry-out-of-bounds',
      id: entry.id,
      message: `Layout entry ${entry.id} exceeds viewport ${options.width}x${options.height}.`,
      rect: entry.rect,
    });
  }

  for (const child of entry.children) {
    collectEntryIssues(child, options, issues);
  }
}

export function auditLayoutPlan(plan: LayoutPlan, options: LayoutAuditOptions): LayoutAuditResult {
  const issues: LayoutAuditIssue[] = [];
  collectEntryIssues(plan.root, options, issues);
  for (const overlayEntry of plan.overlays) {
    collectEntryIssues(overlayEntry.entry, options, issues);
  }

  for (const hitRegion of collectHitRegions(plan)) {
    if (!rectWithin(hitRegion.rect, options.width, options.height)) {
      issues.push({
        code: 'region-out-of-bounds',
        id: hitRegion.id,
        message: `Hit region ${hitRegion.id} exceeds viewport ${options.width}x${options.height}.`,
        rect: hitRegion.rect,
      });
    }
    if (hasInteractiveHandler(hitRegion) && (hitRegion.rect.width <= 0 || hitRegion.rect.height <= 0)) {
      issues.push({
        code: 'interactive-zero-size',
        id: hitRegion.id,
        message: `Interactive region ${hitRegion.id} has no usable hit area.`,
        rect: hitRegion.rect,
      });
    }
    if (options.requireInteractiveLabels && hasInteractiveHandler(hitRegion) && !hasLabel(hitRegion)) {
      issues.push({
        code: 'interactive-missing-label',
        id: hitRegion.id,
        message: `Interactive region ${hitRegion.id} is missing label, summary, detail, or intent metadata.`,
        rect: hitRegion.rect,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function auditVNodeLayout(node: VNode, options: LayoutAuditOptions): LayoutAuditResult {
  return auditLayoutPlan(planLayout(node, options.width, options.height), options);
}
