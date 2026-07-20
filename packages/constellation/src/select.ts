import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { applyState, applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';
import { createVirtualScrollState, getVisibleRange, scrollToIndex, type VirtualScrollConfig, type VirtualScrollState } from './virtual-scroll.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface SelectTokens {
  highlight: Color;
  text: Color;
  dim: Color;
  border: Color;
  borderHover: Color;
  borderFocus: Color;
  indicator: string;
  indicatorOpen: string;
  labelStyle: TypographyToken;
  placeholderStyle: TypographyToken;
  highlightState: StateToken;
}

export const selectContract: TokenContract<SelectTokens> = {
  highlight: (t: SemanticTheme) => t.colors.highlight,
  text: (t: SemanticTheme) => t.colors.text,
  dim: (t: SemanticTheme) => t.colors.muted,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderFocus: (t: SemanticTheme) => t.colors.borderActive,
  indicator: (t: SemanticTheme) => t.glyphs.pointer,
  indicatorOpen: (t: SemanticTheme) => t.glyphs.menuArrow,
  labelStyle: (t: SemanticTheme) => t.typography.body,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
  highlightState: (t: SemanticTheme) => t.states.selected,
};

export type SelectDisplay = 'dropdown' | 'listbox';

export interface SelectOption {
  label: string;
  value: string;
  group?: string;
  disabled?: boolean;
}
export interface SelectConfig {
  options: SelectOption[];
  selected?: number;
  focused?: boolean;
  onChange?: (value: string, index: number) => void;
  placeholder?: string;
  display?: SelectDisplay;
  /**
   * Maximum number of option rows rendered at once. When `options.length`
   * exceeds this, the view windows through `virtual-scroll.ts` — only the
   * visible slice is materialised, and arrow-key navigation scrolls the
   * highlighted row into view. Defaults to 10. Set to `Infinity` to render
   * every option (legacy behaviour).
   */
  maxVisibleOptions?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface SelectModel {
  open: boolean;
  highlighted: number;
  selected: number | null;
  focused: boolean;
  scroll: VirtualScrollState;
  hovered?: boolean;
  hoveredIndex?: number | null;
}
export type SelectMsg =
  | Msg<'toggle'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'select'>
  | Msg<'select-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'hover'>
  | Msg<'leave'>
  | Msg<'close'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

function findNextEnabledOption(options: SelectOption[], from: number, direction: 1 | -1): number {
  const len = options.length;
  if (len === 0) return from;
  let i = (((from + direction) % len) + len) % len;
  let checked = 0;
  while (options[i]?.disabled && checked < len) {
    i = (((i + direction) % len) + len) % len;
    checked++;
  }
  return options[i]?.disabled ? from : i;
}

export function select(config: SelectConfig): ComponentDescriptor<SelectModel, SelectMsg> {
  const options = config.options;
  const placeholder = config.placeholder ?? 'Select...';
  const display = config.display ?? 'dropdown';
  const maxVisible = Math.max(1, config.maxVisibleOptions ?? 10);
  const interactionId = generateFocusGroupId(`select-${placeholder}`);
  const toggleTag = `${interactionId}:toggle`;
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  function vsConfig(): VirtualScrollConfig<SelectOption> {
    return { items: options, viewportHeight: maxVisible, rowHeight: 1, overscan: 0 };
  }

  function scrollHighlightedIntoView(model: SelectModel, highlighted: number): VirtualScrollState {
    if (options.length <= maxVisible) return model.scroll;
    return scrollToIndex(vsConfig(), model.scroll, highlighted);
  }

  return {
    init(): [SelectModel, Cmd<SelectMsg>] {
      const initialHighlight = config.selected ?? 0;
      const initialScroll = scrollToIndex(vsConfig(), createVirtualScrollState(vsConfig()), initialHighlight);
      return [
        { open: false, highlighted: initialHighlight, selected: config.selected ?? null, focused: config.focused ?? false, scroll: initialScroll },
        Cmd.none(),
      ];
    },
    update(msg: SelectMsg, model: SelectModel): [SelectModel, Cmd<SelectMsg>] {
      switch (msg.type) {
        case 'toggle': {
          if (display === 'listbox') {
            const opt = options[model.highlighted];
            if (opt && !opt.disabled) config.onChange?.(opt.value, model.highlighted);
            return [{ ...model, selected: opt?.disabled ? model.selected : model.highlighted }, Cmd.none()];
          }
          if (model.open) {
            const next = model.selected ?? 0;
            return [{ ...model, open: false, highlighted: next, scroll: scrollHighlightedIntoView(model, next) }, Cmd.none()];
          }
          return [{ ...model, open: true, scroll: scrollHighlightedIntoView(model, model.highlighted) }, Cmd.none()];
        }
        case 'up': {
          const next = findNextEnabledOption(options, model.highlighted, -1);
          return [{ ...model, highlighted: next, scroll: scrollHighlightedIntoView(model, next) }, Cmd.none()];
        }
        case 'down': {
          const next = findNextEnabledOption(options, model.highlighted, 1);
          return [{ ...model, highlighted: next, scroll: scrollHighlightedIntoView(model, next) }, Cmd.none()];
        }
        case 'select': {
          const opt = options[model.highlighted];
          if (opt && !opt.disabled) {
            config.onChange?.(opt.value, model.highlighted);
            return [{ ...model, selected: model.highlighted, open: false }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }
        case 'select-at': {
          const index = Math.max(0, Math.min(options.length - 1, msg.index));
          const opt = options[index];
          if (!opt || opt.disabled) return [model, Cmd.none()];
          config.onChange?.(opt.value, index);
          return [
            {
              ...model,
              selected: index,
              highlighted: index,
              focused: true,
              open: display === 'listbox' ? model.open : false,
              scroll: scrollHighlightedIntoView(model, index),
            },
            Cmd.none(),
          ];
        }
        case 'hover-at': {
          const index = Math.max(0, Math.min(options.length - 1, msg.index));
          if (!options[index]) return [model, Cmd.none()];
          return [{ ...model, hoveredIndex: index, highlighted: index, scroll: scrollHighlightedIntoView(model, index) }, Cmd.none()];
        }
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false, hoveredIndex: null }, Cmd.none()];
        case 'close': {
          const next = model.selected ?? 0;
          return [{ ...model, open: false, highlighted: next, scroll: scrollHighlightedIntoView(model, next) }, Cmd.none()];
        }
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: SelectModel): VNode {
      const tokens = useTokens(selectContract, config, 'Select');
      const selectedOpt = model.selected !== null ? options[model.selected] : undefined;
      const label = selectedOpt?.label ?? placeholder;
      const dimStyle = applyTypography(tokens.placeholderStyle);
      const hlStyle = applyState(tokens.highlightState, { color: tokens.highlight });
      const disabledStyle = applyTypography(tokens.placeholderStyle, { dim: true });
      const groupStyle = style({ color: tokens.dim, bold: true });

      const meta = { testId: placeholder, a11y: { role: 'listbox' as const, label: placeholder, expanded: model.open } };

      const renderVisibleOptions = (): VNode[] => {
        const range = getVisibleRange(model.scroll, vsConfig());
        const items: VNode[] = [];
        // Pre-compute the group label active just before the visible window so
        // a group header still renders at the top of a slice that begins mid-group.
        let lastGroup: string | undefined;
        for (let i = 0; i < range.startIndex; i++) {
          lastGroup = options[i]?.group ?? lastGroup;
        }
        for (let i = range.startIndex; i <= range.endIndex; i++) {
          const opt = options[i]!;
          if (opt.group && opt.group !== lastGroup) {
            items.push(text(`  ${opt.group}`, groupStyle));
            lastGroup = opt.group;
          }
          const isHovered = i === model.hoveredIndex;
          const s = opt.disabled
            ? disabledStyle
            : isHovered
              ? style({ color: tokens.borderHover, bold: true, reverse: true })
              : i === model.highlighted
                ? hlStyle
                : applyTypography(tokens.labelStyle);
          items.push(
            event(
              `${interactionId}:option:${i}`,
              text((i === model.highlighted ? tokens.indicator + ' ' : '  ') + opt.label, s),
              opt.disabled ? {} : { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
              {
                label: opt.label,
                intent: 'select',
                affordances: opt.disabled ? [] : ['hover', 'click'],
                cursor: opt.disabled ? undefined : 'pointer',
                keyboardHint: 'Up/Down, Enter',
              },
            ),
          );
        }
        return items;
      };

      if (display === 'listbox') {
        const node = column(...renderVisibleOptions());
        setVNodeMeta(node, meta);
        return node;
      }

      // Dropdown mode (default)
      if (!model.open) {
        const triggerStyle = model.hovered ? style({ color: tokens.borderHover, bold: true, reverse: true }) : hlStyle;
        const node = event(
          `${interactionId}:trigger`,
          row(
            text(tokens.indicator + ' ', triggerStyle),
            text(label, model.hovered ? triggerStyle : selectedOpt ? applyTypography(tokens.labelStyle) : dimStyle),
          ),
          { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label, intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Enter' },
        );
        setVNodeMeta(node, meta);
        return node;
      }
      const triggerStyle = model.hovered ? style({ color: tokens.borderHover, bold: true, reverse: true }) : hlStyle;
      const trigger = event(
        `${interactionId}:trigger`,
        row(text(tokens.indicatorOpen + ' ', triggerStyle), text(label, model.hovered ? triggerStyle : undefined)),
        { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label, intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
      );
      const node = column(trigger, ...renderVisibleOptions());
      setVNodeMeta(node, meta);
      return node;
    },
    subscriptions(model: SelectModel): Sub<SelectMsg> {
      const mouse = Sub.elementMouse<SelectMsg>((mouseEvent) => {
        if (mouseEvent.elementId === `${interactionId}:trigger`) {
          if (mouseEvent.handlerTag === toggleTag) return { type: 'toggle' };
          if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        }
        if (mouseEvent.elementId.startsWith(`${interactionId}:option:`)) {
          const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
          if (mouseEvent.handlerTag === selectTag) return { type: 'select-at', index };
          if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        }
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;

      if (display === 'listbox') {
        // Listbox mode: always bind navigation keys (no open/close needed)
        return Sub.batch<SelectMsg>(mouse, Sub.key('up', { type: 'up' }), Sub.key('down', { type: 'down' }), Sub.key('enter', { type: 'toggle' }));
      }

      // Dropdown mode
      if (!model.open) return Sub.batch<SelectMsg>(mouse, Sub.key('enter', { type: 'toggle' }));
      return Sub.batch<SelectMsg>(
        mouse,
        Sub.key('up', { type: 'up' }),
        Sub.key('down', { type: 'down' }),
        Sub.key('enter', { type: 'select' }),
        Sub.key('escape', { type: 'close' }),
      );
    },
  };
}
