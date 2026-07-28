import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface BreadcrumbTokens {
  text: Color;
  active: Color;
  separator: Color;
  divider: Color;
  hoverBackground: Color;
  hoverText: Color;
}

export const breadcrumbContract: TokenContract<BreadcrumbTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  active: (t: SemanticTheme) => t.colors.interactive,
  separator: (t: SemanticTheme) => t.colors.textSoft,
  divider: (t: SemanticTheme) => t.colors.divider,
  hoverBackground: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceAlt,
  hoverText: (t: SemanticTheme) => t.states.hover.fg,
};

export interface BreadcrumbItem {
  label: string;
  key: string;
}

export interface BreadcrumbConfig {
  id?: string;
  items: BreadcrumbItem[];
  separator?: string;
  selectedKey?: string;
  focused?: boolean;
  onSelect?: (key: string) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface BreadcrumbModel {
  selectedIndex: number;
  cursor: number;
  hoveredIndex: number | null;
  focused: boolean;
}

export type BreadcrumbMsg =
  | { type: 'activate' }
  | { type: 'activate-at'; index: number }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'hover-at'; index: number }
  | { type: 'leave-at'; index: number }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'noop' };

export function breadcrumb(config: BreadcrumbConfig): ComponentDescriptor<BreadcrumbModel, BreadcrumbMsg> {
  const items = config.items.slice(0, 10_000).map((item) => ({ ...item }));
  const separator = config.separator ?? ' > ';
  const interactionId = config.id ?? generateFocusGroupId('breadcrumb');
  const itemPrefix = `${interactionId}:item:`;
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  const initialIndex = (): number => {
    if (items.length === 0) return -1;
    if (config.selectedKey) {
      const selected = items.findIndex((item) => item.key === config.selectedKey);
      if (selected >= 0) return selected;
    }
    return items.length - 1;
  };

  const validIndex = (index: number): number | null => {
    if (!Number.isFinite(index)) return null;
    const normalized = Math.trunc(index);
    return normalized >= 0 && normalized < items.length ? normalized : null;
  };

  const activate = (index: number, model: BreadcrumbModel): [BreadcrumbModel, Cmd<BreadcrumbMsg>] => {
    const normalized = validIndex(index);
    if (normalized === null) return [model, Cmd.none()];
    const item = items[normalized];
    if (!item) return [model, Cmd.none()];
    config.onSelect?.(item.key);
    return [{ ...model, selectedIndex: normalized, cursor: normalized, focused: true }, Cmd.none()];
  };

  return {
    init(): [BreadcrumbModel, Cmd<BreadcrumbMsg>] {
      const selectedIndex = initialIndex();
      return [{ selectedIndex, cursor: Math.max(0, selectedIndex), hoveredIndex: null, focused: config.focused ?? false }, Cmd.none()];
    },

    update(msg: BreadcrumbMsg, model: BreadcrumbModel): [BreadcrumbModel, Cmd<BreadcrumbMsg>] {
      switch (msg.type) {
        case 'activate':
          return activate(model.cursor, model);
        case 'activate-at':
          return activate(msg.index, model);
        case 'left':
          return [{ ...model, cursor: Math.max(0, (validIndex(model.cursor) ?? 0) - 1) }, Cmd.none()];
        case 'right':
          return [{ ...model, cursor: items.length === 0 ? 0 : Math.min(items.length - 1, (validIndex(model.cursor) ?? 0) + 1) }, Cmd.none()];
        case 'hover-at': {
          const index = validIndex(msg.index);
          return index === null ? [model, Cmd.none()] : [{ ...model, hoveredIndex: index, cursor: index }, Cmd.none()];
        }
        case 'leave-at':
          return [{ ...model, hoveredIndex: model.hoveredIndex === validIndex(msg.index) ? null : model.hoveredIndex }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, hoveredIndex: null }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: BreadcrumbModel): VNode {
      const tokens = useTokens(breadcrumbContract, config, 'Breadcrumb');
      if (items.length === 0) return text('');
      const selectedIndex = validIndex(model.selectedIndex);
      const cursor = validIndex(model.cursor);
      const hoveredIndex = model.hoveredIndex === null ? null : validIndex(model.hoveredIndex);

      const nodes: VNode[] = [];
      for (let index = 0; index < items.length; index++) {
        const item = items[index]!;
        const hovered = hoveredIndex === index;
        const selected = selectedIndex === index;
        const itemNode = event(
          `${itemPrefix}${index}`,
          text(
            item.label,
            style({
              color: hovered ? tokens.hoverText : selected ? tokens.active : tokens.separator,
              background: hovered ? tokens.hoverBackground : undefined,
              bold: selected,
              underline: model.focused && cursor === index && !hovered,
            }),
          ),
          { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: item.label, intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Left/Right, Enter' },
        );
        setVNodeMeta(itemNode, { a11y: { role: 'button', label: item.label, selected } });
        nodes.push(itemNode);
        if (index < items.length - 1) nodes.push(text(separator, style({ dim: true, color: tokens.divider })));
      }
      return row(...nodes);
    },

    subscriptions(model: BreadcrumbModel): Sub<BreadcrumbMsg> {
      const mouse = Sub.elementMouse<BreadcrumbMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(itemPrefix)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(itemPrefix.length));
        if (!Number.isInteger(index)) return { type: 'noop' };
        if (mouseEvent.handlerTag === selectTag) return { type: 'activate-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave-at', index };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<BreadcrumbMsg>(mouse, Sub.key('left', { type: 'left' }), Sub.key('right', { type: 'right' }), Sub.key('enter', { type: 'activate' }));
    },
  };
}
