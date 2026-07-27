/**
 * Segmented Control — A horizontal option selector with active highlight.
 *
 * Renders as `[ Option1 │ Option2 │ Option3 ]` with the selected option
 * using accent color/bold and the highlighted option using border color.
 * Supports keyboard navigation (Left/Right to move, Space/Enter to select).
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, event, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, MAX_RENDER_CELLS } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface SegmentedControlTokens {
  bg: Color;
  activeBg: Color;
  text: Color;
  activeText: Color;
  border: Color;
  chrome: Color;
  labelStyle: TypographyToken;
}

export const segmentedControlContract: TokenContract<SegmentedControlTokens> = {
  bg: (t: SemanticTheme) => t.colors.surface,
  activeBg: (t: SemanticTheme) => t.colors.surfaceRaised,
  text: (t: SemanticTheme) => t.colors.text,
  activeText: (t: SemanticTheme) => t.colors.highlight,
  border: (t: SemanticTheme) => t.colors.border,
  chrome: (t: SemanticTheme) => t.colors.textSoft,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

/** Configuration for creating a segmented control component. */
export interface SegmentedControlConfig {
  /** Options to display in the control. */
  options: string[];
  /** Initially selected option index (default: 0). */
  selected?: number;
  /** Callback when the selected option changes. */
  onChange?: (index: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/** Model state for the segmented control component. */
export interface SegmentedControlModel {
  /** Currently selected option index. */
  selected: number;
  /** Currently highlighted option index (keyboard navigation). */
  highlighted: number;
  /** Whether the control is focused. */
  focused: boolean;
  /** Option currently under the pointer, or -1 when none. */
  hovered?: number;
}

/** Messages the segmented control can handle. */
export type SegmentedControlMsg =
  | Msg<'select', { index: number }>
  | Msg<'hover', { index: number }>
  | Msg<'leave', { index: number }>
  | Msg<'highlight-left'>
  | Msg<'highlight-right'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Mouse hit-testing ──────────────────────────────────────────────────────

/**
 * Map a click position to the option index in a segmented control.
 *
 * Layout: `[ Opt1 │ Opt2 │ Opt3 ]`
 * - `[ ` prefix: 2 chars
 * - Each option: option text length chars
 * - ` │ ` separator: 3 chars between options
 * - ` ]` suffix: 2 chars
 *
 * @param options - Option labels (from config).
 * @param relX - Click X relative to the start of the rendered row.
 * @returns A select message if an option was hit, null otherwise.
 */
export function segmentedControlHitTest(options: readonly string[], relX: number): Msg<'select', { index: number }> | null {
  if (options.length === 0 || !Number.isFinite(relX)) return null;
  // Walk the layout: `[ ` (2) + option + ` │ ` (3) + option + ` ]` (2)
  let cursor = 2; // skip `[ `
  for (let i = 0; i < options.length; i++) {
    const optEnd = cursor + measureTextWidth(options[i]!);
    if (relX >= cursor && relX < optEnd) {
      return { type: 'select', index: i };
    }
    cursor = optEnd + 3; // skip ` │ `
  }
  // Click in bracket/padding area — find nearest option by fraction
  const totalWidth = cursor - 1; // approximate
  const fraction = Math.max(0, relX) / totalWidth;
  const index = Math.max(0, Math.min(options.length - 1, Math.floor(fraction * options.length)));
  return { type: 'select', index };
}

/**
 * Create a segmented control component for horizontal option selection.
 *
 * @param config - Segmented control configuration including options and callbacks.
 * @returns A ComponentDescriptor for the segmented control.
 */
export function segmentedControl(config: SegmentedControlConfig): ComponentDescriptor<SegmentedControlModel, SegmentedControlMsg> {
  const options = config.options.slice(0, MAX_RENDER_CELLS).map(String);
  const count = options.length;
  const interactionId = generateFocusGroupId('segmented-control');
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const normalizeIndex = (index: number, emptyValue = -1): number => (count === 0 ? emptyValue : boundedInteger(index, 0, 0, count - 1));
  const normalizeModel = (model: SegmentedControlModel): SegmentedControlModel => ({
    selected: normalizeIndex(model.selected),
    highlighted: normalizeIndex(model.highlighted),
    focused: Boolean(model.focused),
    hovered: typeof model.hovered === 'number' && Number.isInteger(model.hovered) && model.hovered >= 0 && model.hovered < count ? model.hovered : -1,
  });

  return {
    init(): [SegmentedControlModel, Cmd<SegmentedControlMsg>] {
      const selected = count === 0 ? -1 : Number.isFinite(config.selected) ? Math.max(0, Math.min(Math.trunc(config.selected!), count - 1)) : 0;
      return [{ selected, highlighted: selected, focused: false, hovered: -1 }, Cmd.none()];
    },

    update(msg: SegmentedControlMsg, model: SegmentedControlModel): [SegmentedControlModel, Cmd<SegmentedControlMsg>] {
      const safeModel = normalizeModel(model);
      switch (msg.type) {
        case 'select': {
          const index = (msg as Msg<'select', { index: number }>).index;
          if (!Number.isInteger(index) || index < 0 || index >= count) return [model, Cmd.none()];
          if (index !== safeModel.selected) {
            config.onChange?.(index);
          }
          return [{ ...safeModel, selected: index, highlighted: index, focused: true }, Cmd.none()];
        }
        case 'highlight-left': {
          if (count === 0) return [model, Cmd.none()];
          const next = (safeModel.highlighted - 1 + count) % count;
          return [{ ...safeModel, highlighted: next }, Cmd.none()];
        }
        case 'highlight-right': {
          if (count === 0) return [model, Cmd.none()];
          const next = (safeModel.highlighted + 1) % count;
          return [{ ...safeModel, highlighted: next }, Cmd.none()];
        }
        case 'hover': {
          if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= count) return [model, Cmd.none()];
          return safeModel.hovered === msg.index ? [safeModel, Cmd.none()] : [{ ...safeModel, hovered: msg.index }, Cmd.none()];
        }
        case 'leave':
          return safeModel.hovered === msg.index ? [{ ...safeModel, hovered: -1 }, Cmd.none()] : [safeModel, Cmd.none()];
        case 'focus':
          return [{ ...safeModel, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...safeModel, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: SegmentedControlModel): VNode {
      const safeModel = normalizeModel(model);
      const tokens = useTokens(segmentedControlContract, config, 'SegmentedControl');

      const parts: VNode[] = [];
      // Separators are rendered as text glyphs, so use a text-contrast token.
      // `border` remains available for the focused option underline.
      const borderStyle = style({ color: tokens.chrome });

      parts.push(text('[ ', borderStyle));

      for (let i = 0; i < count; i++) {
        if (i > 0) {
          parts.push(text(' │ ', borderStyle));
        }

        const isSelected = safeModel.selected === i;
        const isHighlighted = safeModel.focused && safeModel.highlighted === i;
        const isHovered = safeModel.hovered === i;

        const optStyle = isSelected
          ? style({ color: tokens.activeText, background: tokens.activeBg, bold: true, underline: isHovered })
          : isHovered
            ? style({ color: tokens.border, background: tokens.activeBg, bold: true })
            : isHighlighted
              ? style({ color: tokens.border, underline: true })
              : style({ color: tokens.text, background: tokens.bg });

        const option = text(options[i]!, optStyle);
        setVNodeMeta(option, { testId: `segment-${i}`, a11y: { role: 'radio', label: options[i]!, checked: isSelected } });
        parts.push(
          event(
            `${interactionId}:option:${i}`,
            option,
            { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: options[i]!, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Left/Right, Enter' },
          ),
        );
      }

      parts.push(text(' ]', borderStyle));

      return row(...parts);
    },

    subscriptions(model: SegmentedControlModel): Sub<SegmentedControlMsg> {
      const mouse = Sub.elementMouse<SegmentedControlMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:option:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
        if (mouseEvent.handlerTag === selectTag) return { type: 'select', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave', index };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      const highlighted = normalizeIndex(model.highlighted);
      return Sub.batch<SegmentedControlMsg>(
        mouse,
        Sub.key('left', { type: 'highlight-left' }),
        Sub.key('right', { type: 'highlight-right' }),
        Sub.key(' ', { type: 'select', index: highlighted } as SegmentedControlMsg),
        Sub.key('enter', { type: 'select', index: highlighted } as SegmentedControlMsg),
      );
    },
  };
}
