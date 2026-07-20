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
import { Cmd, row, Sub, text } from '@celestial/nebula';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface SegmentedControlTokens {
  bg: Color;
  activeBg: Color;
  text: Color;
  activeText: Color;
  border: Color;
  labelStyle: TypographyToken;
}

export const segmentedControlContract: TokenContract<SegmentedControlTokens> = {
  bg: (t: SemanticTheme) => t.colors.surface,
  activeBg: (t: SemanticTheme) => t.colors.surfaceRaised,
  text: (t: SemanticTheme) => t.colors.text,
  activeText: (t: SemanticTheme) => t.colors.highlight,
  border: (t: SemanticTheme) => t.colors.border,
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
}

/** Messages the segmented control can handle. */
export type SegmentedControlMsg = Msg<'select', { index: number }> | Msg<'highlight-left'> | Msg<'highlight-right'> | Msg<'focus'> | Msg<'blur'>;

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
  if (options.length === 0) return null;
  // Walk the layout: `[ ` (2) + option + ` │ ` (3) + option + ` ]` (2)
  let cursor = 2; // skip `[ `
  for (let i = 0; i < options.length; i++) {
    const optEnd = cursor + options[i]!.length;
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
  const options = config.options;
  const count = options.length;

  return {
    init(): [SegmentedControlModel, Cmd<SegmentedControlMsg>] {
      const selected = config.selected !== undefined ? Math.max(0, Math.min(config.selected, count - 1)) : 0;
      return [{ selected, highlighted: selected, focused: false }, Cmd.none()];
    },

    update(msg: SegmentedControlMsg, model: SegmentedControlModel): [SegmentedControlModel, Cmd<SegmentedControlMsg>] {
      switch (msg.type) {
        case 'select': {
          const index = (msg as Msg<'select', { index: number }>).index;
          if (index >= 0 && index < count && index !== model.selected) {
            config.onChange?.(index);
          }
          return [{ ...model, selected: index, highlighted: index }, Cmd.none()];
        }
        case 'highlight-left': {
          const next = (model.highlighted - 1 + count) % count;
          return [{ ...model, highlighted: next }, Cmd.none()];
        }
        case 'highlight-right': {
          const next = (model.highlighted + 1) % count;
          return [{ ...model, highlighted: next }, Cmd.none()];
        }
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
      }
    },

    view(model: SegmentedControlModel): VNode {
      const tokens = useTokens(segmentedControlContract, config, 'SegmentedControl');

      const parts: VNode[] = [];
      const borderStyle = style({ color: tokens.border });

      parts.push(text('[ ', borderStyle));

      for (let i = 0; i < count; i++) {
        if (i > 0) {
          parts.push(text(' │ ', borderStyle));
        }

        const isSelected = model.selected === i;
        const isHighlighted = model.focused && model.highlighted === i;

        const optStyle = isSelected
          ? style({ color: tokens.activeText, bold: true })
          : isHighlighted
            ? style({ color: tokens.border, underline: true })
            : style({ color: tokens.text });

        parts.push(text(options[i]!, optStyle));
      }

      parts.push(text(' ]', borderStyle));

      return row(...parts);
    },

    subscriptions(model: SegmentedControlModel): Sub<SegmentedControlMsg> {
      if (!model.focused) return Sub.none();
      return Sub.batch<SegmentedControlMsg>(
        Sub.key('left', { type: 'highlight-left' }),
        Sub.key('right', { type: 'highlight-right' }),
        Sub.key(' ', { type: 'select', index: model.highlighted } as SegmentedControlMsg),
        Sub.key('enter', { type: 'select', index: model.highlighted } as SegmentedControlMsg),
      );
    },
  };
}
