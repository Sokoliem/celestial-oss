import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { ThemeContext, VNode } from '@celestial/nebula';
import { column, row, text } from '@celestial/nebula';
import { useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface FormFieldTokens {
  label: Color;
  error: Color;
  warning: Color;
  success: Color;
  hint: Color;
  muted: Color;
  required: Color;
  accent: Color;
  labelStyle: TypographyToken;
}

export const formFieldContract: TokenContract<FormFieldTokens> = {
  label: (t: SemanticTheme) => t.colors.text,
  error: (t: SemanticTheme) => t.colors.tones.danger,
  warning: (t: SemanticTheme) => t.colors.tones.warning,
  success: (t: SemanticTheme) => t.colors.tones.success,
  hint: (t: SemanticTheme) => t.colors.textSoft,
  muted: (t: SemanticTheme) => t.colors.muted,
  required: (t: SemanticTheme) => t.colors.tones.danger,
  accent: (t: SemanticTheme) => t.colors.tones.accent,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export interface FormFieldConfig {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  child: VNode;
  focused?: boolean;
  /** Success message (green, shown when no error) */
  success?: string;
  /** Warning message (yellow, shown when no error) */
  warning?: string;
  /** Character counter display */
  charCount?: { current: number; max: number };
  /** Persistent help text below input (always visible, dim) */
  helpText?: string;
  /** Gray out the whole field */
  disabled?: boolean;
  /** Visual indicator for validation state */
  validationState?: 'idle' | 'validating' | 'valid' | 'invalid';
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

function isNonEmpty(value: string | undefined | null): value is string {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Renders a form field wrapper with label, child input, and hint/error text.
 * This is a view helper that returns a VNode, not a stateful ComponentDescriptor.
 *
 * Supports validation state indicators, character counts, help text,
 * success/warning messages, and disabled state.
 */
export function formField(config: FormFieldConfig): VNode {
  const { label, required, hint, error, child, focused, success, warning, charCount, helpText, disabled, validationState } = config;

  const tokens = useTokens(formFieldContract, config, 'FormField');

  const hasError = isNonEmpty(error);
  const hasWarning = isNonEmpty(warning);
  const hasSuccess = isNonEmpty(success);
  const hasHint = isNonEmpty(hint);

  // --- Label row ---
  const labelStyle = disabled ? style({ bold: true, dim: true }) : focused ? style({ bold: true, color: tokens.accent }) : style({ bold: true });

  const labelParts: VNode[] = [text(label, labelStyle)];

  if (required) {
    labelParts.push(text(' *', style({ color: disabled ? tokens.muted : tokens.required })));
  }

  // Validation state indicator on the label row
  if (validationState === 'validating') {
    labelParts.push(text(' ⟳', style({ dim: true })));
  } else if (validationState === 'valid') {
    labelParts.push(text(' ✓', style({ color: tokens.success })));
  } else if (validationState === 'invalid') {
    labelParts.push(text(' ✗', style({ color: tokens.error })));
  }

  const labelRow = row(...labelParts);

  // --- Field row with gutter ---
  let fieldRowContent: VNode[];
  if (hasError) {
    fieldRowContent = [text('│ ', style({ color: tokens.error })), child];
  } else if (validationState === 'valid') {
    fieldRowContent = [text('│ ', style({ color: tokens.success })), child];
  } else if (hasWarning) {
    fieldRowContent = [text('│ ', style({ color: tokens.warning })), child];
  } else {
    fieldRowContent = [text('  '), child];
  }
  const fieldRow = row(...fieldRowContent);

  // --- Assemble column ---
  const parts: VNode[] = [labelRow, fieldRow];

  // --- Message row (priority: error > warning > success > hint) ---
  // May also include charCount on the right side
  const messageNodes: VNode[] = [];

  if (hasError) {
    messageNodes.push(text(error, style({ color: tokens.error, dim: true })));
  } else if (hasWarning) {
    messageNodes.push(text(warning, style({ color: tokens.warning, dim: true })));
  } else if (hasSuccess) {
    messageNodes.push(text(success, style({ color: tokens.success })));
  } else if (hasHint) {
    messageNodes.push(text(hint, style({ color: tokens.hint, dim: true })));
  }

  if (charCount) {
    const countText = `${charCount.current}/${charCount.max}`;
    const overLimit = charCount.current > charCount.max;
    const countStyle = overLimit ? style({ color: tokens.error, bold: true }) : style({ color: tokens.muted, dim: true });

    // Add spacing before count if there's already a message
    if (messageNodes.length > 0) {
      messageNodes.push(text('  ', style({ dim: true })));
    }
    messageNodes.push(text(countText, countStyle));
  }

  if (messageNodes.length > 0) {
    parts.push(row(...messageNodes));
  }

  // --- Help text (always visible, very dim, rendered last) ---
  if (isNonEmpty(helpText)) {
    parts.push(text(helpText, style({ color: tokens.muted, dim: true })));
  }

  return column(...parts);
}
