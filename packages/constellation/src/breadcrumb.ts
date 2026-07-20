import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, row, setVNodeMeta, Sub, text } from '@celestial/core/nebula';
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
  const interactionId = config.id ?? generateFocusGroupId('breadcrumb');
  const itemPrefix = `${interactionId}:item:`;
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  const initialIndex = (): number => {
    if (config.items.length === 0) return -1;
    if (config.selectedKey) {
      const selected = config.items.findIndex((item) => item.key === config.selectedKey);
      if (selected >= 0) return selected;
    }
    return config.items.length - 1;
  };

  const activate = (index: number, model: BreadcrumbModel): [BreadcrumbModel, Cmd<BreadcrumbMsg>] => {
    const item = config.items[index];
    if (!item) return [model, Cmd.none()];
    config.onSelect?.(item.key);
    return [{ ...model, selectedIndex: index, cursor: index, focused: true }, Cmd.none()];
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
          return [{ ...model, cursor: Math.max(0, model.cursor - 1) }, Cmd.none()];
        case 'right':
          return [{ ...model, cursor: Math.min(config.items.length - 1, model.cursor + 1) }, Cmd.none()];
        case 'hover-at':
          return config.items[msg.index]
            ? [{ ...model, hoveredIndex: msg.index, cursor: msg.index }, Cmd.none()]
            : [model, Cmd.none()];
        case 'leave-at':
          return [{ ...model, hoveredIndex: model.hoveredIndex === msg.index ? null : model.hoveredIndex }, Cmd.none()];
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
      const sep = config.separator ?? ' > ';
      if (config.items.length === 0) return text('');

      const nodes: VNode[] = [];
      for (let index = 0; index < config.items.length; index++) {
        const item = config.items[index]!;
        const hovered = model.hoveredIndex === index;
        const selected = model.selectedIndex === index;
        const itemNode = event(
          `${itemPrefix}${index}`,
          text(
            item.label,
            style({
              color: hovered ? tokens.hoverText : selected ? tokens.active : tokens.separator,
              background: hovered ? tokens.hoverBackground : undefined,
              bold: hovered || selected,
              underline: model.focused && model.cursor === index && !hovered,
            }),
          ),
          { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: item.label, intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Left/Right, Enter' },
        );
        setVNodeMeta(itemNode, { a11y: { role: 'button', label: item.label, selected } });
        nodes.push(itemNode);
        if (index < config.items.length - 1) nodes.push(text(sep, style({ dim: true, color: tokens.divider })));
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
      return Sub.batch<BreadcrumbMsg>(
        mouse,
        Sub.key('left', { type: 'left' }),
        Sub.key('right', { type: 'right' }),
        Sub.key('enter', { type: 'activate' }),
      );
    },
  };
}
