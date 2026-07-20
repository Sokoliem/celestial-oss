import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, row, Sub, text } from '@celestial/nebula';
import { moveOptionHighlight } from './option-list-view.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface MultiSelectTokens {
  text: Color;
  highlight: Color;
  tag: Color;
  tagBg: Color;
  placeholder: Color;
  border: Color;
  borderActive: Color;
  checkmark: Color;
  labelStyle: TypographyToken;
  placeholderStyle: TypographyToken;
}

export const multiSelectContract: TokenContract<MultiSelectTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  tag: (t: SemanticTheme) => t.colors.text,
  tagBg: (t: SemanticTheme) => t.colors.surfaceAlt,
  placeholder: (t: SemanticTheme) => t.colors.placeholder,
  border: (t: SemanticTheme) => t.colors.border,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  checkmark: (t: SemanticTheme) => t.colors.highlight,
  labelStyle: (t: SemanticTheme) => t.typography.body,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectConfig {
  options: MultiSelectOption[];
  selected?: number[];
  placeholder?: string;
  onChange?: (values: string[]) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface MultiSelectModel {
  open: boolean;
  highlighted: number;
  selected: Set<number>;
  focused: boolean;
}

export type MultiSelectMsg = Msg<'toggle-open'> | Msg<'up'> | Msg<'down'> | Msg<'toggle-item'> | Msg<'close'> | Msg<'focus'> | Msg<'blur'>;

// ─── Component ──────────────────────────────────────────────────────────────

export function multiSelect(config: MultiSelectConfig): ComponentDescriptor<MultiSelectModel, MultiSelectMsg> {
  const options = config.options;
  const placeholder = config.placeholder ?? 'Select...';

  function selectedValues(selected: Set<number>): string[] {
    return options.filter((_, i) => selected.has(i)).map((o) => o.value);
  }

  return {
    init(): [MultiSelectModel, Cmd<MultiSelectMsg>] {
      const selected = new Set<number>(config.selected ?? []);
      return [{ open: false, highlighted: 0, selected, focused: false }, Cmd.none()];
    },

    update(msg: MultiSelectMsg, model: MultiSelectModel): [MultiSelectModel, Cmd<MultiSelectMsg>] {
      switch (msg.type) {
        case 'toggle-open':
          return [{ ...model, open: !model.open }, Cmd.none()];
        case 'up':
          return [{ ...model, highlighted: moveOptionHighlight(model.highlighted, options.length, 'up') }, Cmd.none()];
        case 'down':
          return [{ ...model, highlighted: moveOptionHighlight(model.highlighted, options.length, 'down') }, Cmd.none()];
        case 'toggle-item': {
          const next = new Set(model.selected);
          if (next.has(model.highlighted)) {
            next.delete(model.highlighted);
          } else {
            next.add(model.highlighted);
          }
          config.onChange?.(selectedValues(next));
          return [{ ...model, selected: next }, Cmd.none()];
        }
        case 'close':
          return [{ ...model, open: false }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
      }
    },

    view(model: MultiSelectModel): VNode {
      const tokens = useTokens(multiSelectContract, config, 'MultiSelect');
      const labelSt = applyTypography(tokens.labelStyle);
      const placeholderSt = applyTypography(tokens.placeholderStyle, { color: tokens.placeholder });
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const tagStyle = style({ color: tokens.tag, background: tokens.tagBg });
      const checkStyle = style({ color: tokens.checkmark });

      if (!model.open) {
        // Closed: show tags or placeholder
        if (model.selected.size === 0) {
          return row(text(placeholder, placeholderSt));
        }
        const tags = options.filter((_, i) => model.selected.has(i)).map((o) => text(`[${o.label}]`, tagStyle));
        return row(...tags);
      }

      // Open: show option list with checkmarks
      const items = options.map((opt, i) => {
        const checked = model.selected.has(i);
        const prefix = checked ? '[✓] ' : '[ ] ';
        const s = i === model.highlighted ? hlStyle : labelSt;
        const prefixStyle = checked ? checkStyle : s;
        return row(text(prefix, prefixStyle), text(opt.label, s));
      });
      return column(...items);
    },

    subscriptions(model: MultiSelectModel): Sub<MultiSelectMsg> {
      if (!model.focused) return Sub.none();
      if (!model.open) {
        return Sub.key('enter', { type: 'toggle-open' });
      }
      return Sub.batch<MultiSelectMsg>(
        Sub.key('up', { type: 'up' }),
        Sub.key('down', { type: 'down' }),
        Sub.key('enter', { type: 'toggle-item' }),
        Sub.key('space', { type: 'toggle-item' }),
        Sub.key('escape', { type: 'close' }),
      );
    },
  };
}
