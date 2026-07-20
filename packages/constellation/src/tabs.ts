import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TabsTokens {
  active: Color;
  inactive: Color;
  border: Color;
  divider: Color;
  titleStyle: TypographyToken;
  captionStyle: TypographyToken;
}

export const tabsContract: TokenContract<TabsTokens> = {
  active: (t: SemanticTheme) => t.colors.interactive,
  inactive: (t: SemanticTheme) => t.colors.textSoft,
  border: (t: SemanticTheme) => t.colors.border,
  divider: (t: SemanticTheme) => t.colors.divider,
  titleStyle: (t: SemanticTheme) => t.typography.heading,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
};

export interface Tab {
  label: string;
  key: string;
  badge?: string;
  disabled?: boolean;
  closeable?: boolean;
}
export interface TabsConfig {
  tabs: Tab[];
  active?: number;
  focused?: boolean;
  onChange?: (key: string, index: number) => void;
  onClose?: (key: string, index: number) => void;
  /**
   * P0-3 — render arbitrary chrome to the left of a tab's label (eg. status indicator).
   */
  renderTabPrefix?: (tab: Tab, index: number) => VNode | null;
  /**
   * P0-3 — render arbitrary chrome to the right of a tab's label (eg. status
   * badge, unread count, dirty marker). Called once per tab during view. The
   * returned node is appended *before* the close ' ×' affordance.
   */
  renderTabSuffix?: (tab: Tab, index: number) => VNode | null;
  /**
   * P0-3 — per-tab accent override. Returning a `Color` resolves the active
   * underline color for that tab; returning `null` falls back to the
   * `tokens.active` default.
   */
  accentResolver?: (tab: Tab, index: number) => Color | null;
  /**
   * P0-3 — custom separator string. Defaults to ' │ '.
   */
  separator?: string;
  /**
   * P0-3 — custom tab style resolver to override active/inactive typography and color.
   */
  tabStyleResolver?: (tab: Tab, index: number, isActive: boolean) => ReturnType<typeof style> | null;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface TabsModel {
  active: number;
  focused: boolean;
  hoveredIndex?: number | null;
}
export type TabsMsg =
  | Msg<'left'>
  | Msg<'right'>
  | Msg<'select'>
  | Msg<'activate', { index: number }>
  | Msg<'close', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

function findNextEnabled(tabList: Tab[], from: number, direction: 1 | -1): number {
  const len = tabList.length;
  if (len === 0) return from;
  let i = (((from + direction) % len) + len) % len;
  let checked = 0;
  while (tabList[i]?.disabled && checked < len) {
    i = (((i + direction) % len) + len) % len;
    checked++;
  }
  return tabList[i]?.disabled ? from : i;
}

export function tabs(config: TabsConfig): ComponentDescriptor<TabsModel, TabsMsg> {
  const tabList = config.tabs.slice(0, 10_000).map((tab) => ({ ...tab }));
  const interactionId = generateFocusGroupId('tabs');
  const selectTag = `${interactionId}:select`;
  const closeTag = `${interactionId}:close`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const validIndex = (index: number | null | undefined): number | null => {
    if (index === null || index === undefined || !Number.isFinite(index)) return null;
    const normalized = Math.trunc(index);
    return normalized >= 0 && normalized < tabList.length ? normalized : null;
  };
  return {
    init(): [TabsModel, Cmd<TabsMsg>] {
      return [{ active: validIndex(config.active) ?? (tabList.length > 0 ? 0 : -1), focused: config.focused ?? false }, Cmd.none()];
    },
    update(msg: TabsMsg, model: TabsModel): [TabsModel, Cmd<TabsMsg>] {
      const active = validIndex(model.active) ?? (tabList.length > 0 ? 0 : -1);
      switch (msg.type) {
        case 'left': {
          const i = findNextEnabled(tabList, active, -1);
          tabList[i] && config.onChange?.(tabList[i]!.key, i);
          return [{ ...model, active: i }, Cmd.none()];
        }
        case 'right': {
          const i = findNextEnabled(tabList, active, 1);
          tabList[i] && config.onChange?.(tabList[i]!.key, i);
          return [{ ...model, active: i }, Cmd.none()];
        }
        case 'select': {
          const t = tabList[active];
          if (t && !t.disabled) config.onChange?.(t.key, active);
          return [{ ...model, active }, Cmd.none()];
        }
        case 'activate': {
          const idx = validIndex(msg.index);
          if (idx === null) return [{ ...model, active }, Cmd.none()];
          const t = tabList[idx];
          if (!t || t.disabled) return [model, Cmd.none()];
          config.onChange?.(t.key, idx);
          return [{ ...model, active: idx, focused: true }, Cmd.none()];
        }
        case 'close': {
          const idx = validIndex(msg.index);
          if (idx === null) return [{ ...model, active }, Cmd.none()];
          const t = tabList[idx];
          if (t?.closeable) config.onClose?.(t.key, idx);
          return [model, Cmd.none()];
        }
        case 'hover-at': {
          const index = validIndex(msg.index);
          return index === null ? [{ ...model, active }, Cmd.none()] : [{ ...model, active, hoveredIndex: index }, Cmd.none()];
        }
        case 'leave':
          return [{ ...model, hoveredIndex: null }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: TabsModel): VNode {
      const tokens = useTokens(tabsContract, config, 'Tabs');
      const active = validIndex(model.active) ?? (tabList.length > 0 ? 0 : -1);
      const hoveredIndex = validIndex(model.hoveredIndex);
      const dimStyle = applyTypography(tokens.captionStyle, { dim: true, color: tokens.inactive });
      const disabledStyle = applyTypography(tokens.captionStyle, { dim: true, color: tokens.inactive, strikethrough: true });
      const sepStyle = style({ dim: true, color: tokens.divider });
      const items: VNode[] = [];
      for (let i = 0; i < tabList.length; i++) {
        const tab = tabList[i]!;
        let label = tab.label;
        if (tab.badge) label += ` (${tab.badge})`;
        // P0-3: per-tab accent overrides the default `tokens.active` underline.
        const accent = config.accentResolver?.(tab, i) ?? tokens.active;
        const activeStyle = applyTypography(tokens.titleStyle, { color: accent, bold: true, underline: true });
        const customStyle = config.tabStyleResolver?.(tab, i, i === active) ?? null;
        const hoverStyle = style({ color: accent, bold: true, reverse: true });
        const s = customStyle ?? (tab.disabled ? disabledStyle : hoveredIndex === i ? hoverStyle : i === active ? activeStyle : dimStyle);
        const prefix = config.renderTabPrefix?.(tab, i) ?? null;
        // P0-3: optional suffix node rendered before the close affordance.
        const suffix = config.renderTabSuffix?.(tab, i) ?? null;
        const labelNode = text(label, s);
        setVNodeMeta(labelNode, {
          testId: tab.key,
          a11y: { role: 'tab', label: tab.label, selected: i === active },
        });
        let tabNode: VNode;
        if (prefix === null && suffix === null && !tab.closeable) {
          tabNode = labelNode;
        } else {
          const parts: VNode[] = [];
          if (prefix !== null) {
            parts.push(prefix);
            parts.push(text(' ', s));
          }
          parts.push(labelNode);
          if (suffix !== null) {
            parts.push(text(' ', s));
            parts.push(suffix);
          }
          if (tab.closeable) {
            parts.push(
              event(
                `${interactionId}:close:${i}`,
                text(' ×', s),
                { onClick: closeTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
                { label: `Close ${tab.label}`, intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Delete' },
              ),
            );
          }
          tabNode = row(...parts);
        }
        const finalTabNode = s?.props.background ? box(tabNode, s) : tabNode;
        items.push(
          event(`${interactionId}:tab:${i}`, finalTabNode, tab.disabled ? {} : { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag }, {
            label: tab.label,
            intent: 'select',
            affordances: tab.disabled ? [] : ['hover', 'click'],
            cursor: tab.disabled ? undefined : 'pointer',
            keyboardHint: 'Left/Right, Enter',
          }),
        );
        if (i < tabList.length - 1) items.push(text(config.separator ?? ' │ ', sepStyle));
      }
      const container = row(...items);
      setVNodeMeta(container, {
        testId: tabList.map((t) => t.key).join('-') || 'tablist',
        a11y: { role: 'tablist', label: 'tabs' },
      });
      return container;
    },
    subscriptions(model: TabsModel): Sub<TabsMsg> {
      const mouse = Sub.elementMouse<TabsMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === closeTag && mouseEvent.elementId.startsWith(`${interactionId}:close:`)) {
          mouseEvent.stopPropagation();
          return { type: 'close', index: Number(mouseEvent.elementId.slice(`${interactionId}:close:`.length)) };
        }
        if (mouseEvent.handlerTag === hoverTag) {
          const marker = mouseEvent.elementId.includes(':close:') ? `${interactionId}:close:` : `${interactionId}:tab:`;
          if (mouseEvent.elementId.startsWith(marker)) return { type: 'hover-at', index: Number(mouseEvent.elementId.slice(marker.length)) };
        }
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        if (mouseEvent.handlerTag === selectTag && mouseEvent.elementId.startsWith(`${interactionId}:tab:`)) {
          return { type: 'activate', index: Number(mouseEvent.elementId.slice(`${interactionId}:tab:`.length)) };
        }
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      const subs: Sub<TabsMsg>[] = [mouse, Sub.key('left', { type: 'left' }), Sub.key('right', { type: 'right' }), Sub.key('enter', { type: 'select' })];
      const active = validIndex(model.active) ?? (tabList.length > 0 ? 0 : -1);
      const activeTab = tabList[active];
      if (activeTab?.closeable) {
        subs.push(Sub.key('delete', { type: 'close', index: active }));
      }
      return Sub.batch<TabsMsg>(...subs);
    },
  };
}
