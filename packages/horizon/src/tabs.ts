/**
 * Horizon Tabbed Pane
 *
 * A tabbed container that shows a tab bar and the active tab's content.
 */

import type { ColumnNode, RowNode, TextNode, VNode } from '@celestial/core/nebula';

export interface TabConfig {
  /** Stable tab identifier */
  id?: string;
  /** Label displayed in the tab bar */
  label: string;
  /** Content rendered when this tab is active */
  content: VNode;
  /** Whether the tab can be closed */
  closable?: boolean;
  /** Optional icon prefix */
  icon?: string;
}

export interface TabStyle {
  /** Style prefix for the active tab label (default: '[ ') */
  activeTabPrefix?: string;
  /** Style suffix for the active tab label (default: ' ]') */
  activeTabSuffix?: string;
  /** Style prefix for inactive tab labels (default: '  ') */
  inactiveTabPrefix?: string;
  /** Style suffix for inactive tab labels (default: '  ') */
  inactiveTabSuffix?: string;
  /** Character placed between tab labels (default: ' | ') */
  separator?: string;
}

export interface TabbedPaneConfig {
  /** Array of tab definitions */
  tabs: TabConfig[];
  /** Index of the currently active tab */
  activeIndex: number;
  /** Optional styling for tabs */
  style?: TabStyle;
}

const DEFAULT_TAB_SEPARATOR = ' | ';
const DEFAULT_ACTIVE_PREFIX = '[ ';
const DEFAULT_ACTIVE_SUFFIX = ' ]';
const DEFAULT_INACTIVE_PREFIX = '  ';
const DEFAULT_INACTIVE_SUFFIX = '  ';

/** Create a tabbed pane layout — shows tab bar + active content */
export function tabbedPane(config: TabbedPaneConfig): VNode {
  const { tabs, activeIndex, style } = config;

  if (tabs.length === 0) {
    return { kind: 'empty' };
  }

  // Clamp activeIndex to valid range
  const safeIndex = Math.max(0, Math.min(activeIndex, tabs.length - 1));
  const separator = style?.separator ?? DEFAULT_TAB_SEPARATOR;

  // Build the tab bar as a row of text labels
  const tabBar = buildTabBar(tabs, safeIndex, separator, style);

  // Get the active tab's content
  const activeContent = tabs[safeIndex]!.content;

  // Stack tab bar on top of content
  const result: ColumnNode = {
    kind: 'column',
    children: [tabBar, activeContent],
  };

  return result;
}

/** Build the tab bar row from tab labels */
function buildTabBar(tabs: TabConfig[], activeIndex: number, separator: string, style?: TabStyle): RowNode {
  const children: VNode[] = [];

  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) {
      const sepNode: TextNode = { kind: 'text', content: separator };
      children.push(sepNode);
    }

    const tab = tabs[i]!;
    const isActive = i === activeIndex;
    const label = formatTabLabel(tab.label, isActive, style);
    const tabNode: TextNode = { kind: 'text', content: label };
    children.push(tabNode);
  }

  return { kind: 'row', children };
}

/** Format a tab label with active/inactive markers */
function formatTabLabel(label: string, isActive: boolean, style?: TabStyle): string {
  if (isActive) {
    const prefix = style?.activeTabPrefix ?? DEFAULT_ACTIVE_PREFIX;
    const suffix = style?.activeTabSuffix ?? DEFAULT_ACTIVE_SUFFIX;
    return `${prefix}${label}${suffix}`;
  } else {
    const prefix = style?.inactiveTabPrefix ?? DEFAULT_INACTIVE_PREFIX;
    const suffix = style?.inactiveTabSuffix ?? DEFAULT_INACTIVE_SUFFIX;
    return `${prefix}${label}${suffix}`;
  }
}

// ---------------------------------------------------------------------------
// Tab State Management
// ---------------------------------------------------------------------------

export interface TabGroup<T> {
  id: string;
  tabs: T[];
  activeIndex: number;
}

export type TabMoveEffect =
  | { effect: 'move-tab'; sourceTabbedId: string; sourceIndex: number; targetTabbedId: string; targetIndex: number }
  | { effect: 'move-tab-to-pane'; sourceTabbedId: string; sourceIndex: number; targetPaneId: string };

/**
 * Pure function to apply cross-pane drag-and-drop effects to a collection of tab groups.
 * Handles both moving tabs between existing groups and moving to a new pane.
 * Preserves the active tab index appropriately.
 */
export function applyTabMoveEffect<T>(groups: readonly TabGroup<T>[], effect: TabMoveEffect): TabGroup<T>[] {
  const sourceGroupIndex = groups.findIndex((g) => g.id === effect.sourceTabbedId);
  if (sourceGroupIndex === -1) return [...groups];

  const sourceGroup = groups[sourceGroupIndex]!;
  if (effect.sourceIndex < 0 || effect.sourceIndex >= sourceGroup.tabs.length) {
    return [...groups];
  }

  const tabToMove = sourceGroup.tabs[effect.sourceIndex]!;

  if (effect.effect === 'move-tab') {
    if (effect.sourceTabbedId === effect.targetTabbedId) {
      // Reorder within the same group
      if (effect.sourceIndex === effect.targetIndex) return [...groups];

      const newTabs = [...sourceGroup.tabs];
      newTabs.splice(effect.sourceIndex, 1);
      newTabs.splice(effect.targetIndex, 0, tabToMove);

      let newActiveIndex = sourceGroup.activeIndex;
      if (sourceGroup.activeIndex === effect.sourceIndex) {
        newActiveIndex = effect.targetIndex;
      } else if (sourceGroup.activeIndex > effect.sourceIndex && sourceGroup.activeIndex <= effect.targetIndex) {
        newActiveIndex--;
      } else if (sourceGroup.activeIndex < effect.sourceIndex && sourceGroup.activeIndex >= effect.targetIndex) {
        newActiveIndex++;
      }

      const newGroups = [...groups];
      newGroups[sourceGroupIndex] = { ...sourceGroup, tabs: newTabs, activeIndex: newActiveIndex };
      return newGroups;
    } else {
      // Move to a different existing group
      const targetGroupIndex = groups.findIndex((g) => g.id === effect.targetTabbedId);
      if (targetGroupIndex === -1) return [...groups];

      const targetGroup = groups[targetGroupIndex]!;

      // Remove from source
      const newSourceTabs = [...sourceGroup.tabs];
      newSourceTabs.splice(effect.sourceIndex, 1);

      let newSourceActiveIndex = sourceGroup.activeIndex;
      if (sourceGroup.activeIndex === effect.sourceIndex) {
        newSourceActiveIndex = Math.max(0, newSourceTabs.length - 1);
      } else if (sourceGroup.activeIndex > effect.sourceIndex) {
        newSourceActiveIndex--;
      }

      // Add to target
      const newTargetTabs = [...targetGroup.tabs];
      const targetIndex = Math.max(0, Math.min(effect.targetIndex, newTargetTabs.length));
      newTargetTabs.splice(targetIndex, 0, tabToMove);

      // Update target active index if we inserted before or at it
      let newTargetActiveIndex = targetGroup.activeIndex;
      if (targetGroup.activeIndex >= targetIndex) {
        newTargetActiveIndex++;
      }

      const newGroups = [...groups];
      newGroups[sourceGroupIndex] = { ...sourceGroup, tabs: newSourceTabs, activeIndex: newSourceActiveIndex };
      newGroups[targetGroupIndex] = { ...targetGroup, tabs: newTargetTabs, activeIndex: newTargetActiveIndex };

      return newGroups;
    }
  } else {
    // move-tab-to-pane
    const targetPaneId = effect.targetPaneId;

    // Check if target pane happens to already be a tabbed group
    const targetGroupIndex = groups.findIndex((g) => g.id === targetPaneId);

    // Remove from source
    const newSourceTabs = [...sourceGroup.tabs];
    newSourceTabs.splice(effect.sourceIndex, 1);

    let newSourceActiveIndex = sourceGroup.activeIndex;
    if (sourceGroup.activeIndex === effect.sourceIndex) {
      newSourceActiveIndex = Math.max(0, newSourceTabs.length - 1);
    } else if (sourceGroup.activeIndex > effect.sourceIndex) {
      newSourceActiveIndex--;
    }

    const newGroups = [...groups];
    newGroups[sourceGroupIndex] = { ...sourceGroup, tabs: newSourceTabs, activeIndex: newSourceActiveIndex };

    if (targetGroupIndex !== -1) {
      // It exists, just append it
      const targetGroup = groups[targetGroupIndex]!;
      const newTargetTabs = [...targetGroup.tabs, tabToMove];
      newGroups[targetGroupIndex] = { ...targetGroup, tabs: newTargetTabs };
    } else {
      // Create new group
      newGroups.push({
        id: targetPaneId,
        tabs: [tabToMove],
        activeIndex: 0,
      });
    }

    return newGroups;
  }
}
