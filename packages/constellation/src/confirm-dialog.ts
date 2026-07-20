/**
 * ConfirmDialog — a pre-configured modal dialog with confirm/cancel buttons
 * and y/n keyboard shortcuts.
 *
 * This is a full ComponentDescriptor that manages open/close state,
 * button selection, and keyboard interaction.
 */

import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, component, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { applyState, applyTypography, resolveAnimatedBorderColor, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ConfirmDialogTokens {
  text: Color;
  bg: Color;
  backdrop: Color;
  border: Color;
  danger: Color;
  muted: Color;
  titleStyle: TypographyToken;
  bodyStyle: TypographyToken;
  captionStyle: TypographyToken;
  instructionStyle: TypographyToken;
  restingState: StateToken;
  hoverState: StateToken;
  selectedState: StateToken;
  disabledState: StateToken;
}

export const confirmDialogContract: TokenContract<ConfirmDialogTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  bg: (t: SemanticTheme) => t.elevation.modal.surface ?? t.colors.surfaceRaised,
  backdrop: (t: SemanticTheme) => t.colors.backdrop,
  border: (t: SemanticTheme) => t.elevation.modal.border ?? t.colors.borderActive,
  danger: (t: SemanticTheme) => t.typography.error.color,
  muted: (t: SemanticTheme) => t.colors.muted,
  titleStyle: (t: SemanticTheme) => t.typography.heading,
  bodyStyle: (t: SemanticTheme) => t.typography.body,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
  instructionStyle: (t: SemanticTheme) => ({ ...t.typography.caption, color: t.colors.textSoft, dim: false }),
  restingState: (t: SemanticTheme) => ({ fg: t.colors.textSoft }),
  hoverState: (t: SemanticTheme) => t.states.hover,
  selectedState: (t: SemanticTheme) => t.states.selected,
  disabledState: (t: SemanticTheme) => t.states.disabled,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConfirmDialogConfig {
  /** Dialog title */
  title: string;
  /** Body text */
  message: string;
  /** Confirm button text (default: "Confirm") */
  confirmLabel?: string;
  /** Cancel button text (default: "Cancel") */
  cancelLabel?: string;
  /** If true, confirm button renders red */
  danger?: boolean;
  /** Callback when confirmed */
  onConfirm?: () => void;
  /** Callback when cancelled */
  onCancel?: () => void;
  /** Initial open state (default: true) */
  open?: boolean;
  /** Preferred dialog width before viewport clamping (default: 46). */
  width?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface ConfirmDialogModel {
  open: boolean;
  selectedButton: 'confirm' | 'cancel';
  hoveredButton?: 'confirm' | 'cancel' | null;
  borderTick?: number;
  viewportCols?: number;
  viewportRows?: number;
}

export type ConfirmDialogMsg =
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'select-confirm' }
  | { type: 'select-cancel' }
  | { type: 'hover-button'; button: 'confirm' | 'cancel' }
  | { type: 'leave-button'; button: 'confirm' | 'cancel' }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'tick' }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'panic' }
  | { type: 'noop' };

// ─── Component ───────────────────────────────────────────────────────────────

export function confirmDialog(config: ConfirmDialogConfig): ComponentDescriptor<ConfirmDialogModel, ConfirmDialogMsg> {
  const confirmLabel = config.confirmLabel ?? 'Confirm';
  const cancelLabel = config.cancelLabel ?? 'Cancel';
  const danger = config.danger ?? false;
  const initialOpen = config.open ?? true;

  const slug = config.title.replace(/\s+/g, '-').toLowerCase() || 'confirm-dialog';
  const groupId = generateFocusGroupId(`confirm-dialog-${slug}`);
  const confirmTag = `${groupId}:confirm`;
  const cancelTag = `${groupId}:cancel`;
  const hoverTag = `${groupId}:hover-button`;
  const leaveTag = `${groupId}:leave-button`;

  return {
    init(): [ConfirmDialogModel, Cmd<ConfirmDialogMsg>] {
      return [{ open: initialOpen, selectedButton: 'cancel', hoveredButton: null, borderTick: 0 }, initialOpen ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
    },

    update(msg: ConfirmDialogMsg, model: ConfirmDialogModel): [ConfirmDialogModel, Cmd<ConfirmDialogMsg>] {
      switch (msg.type) {
        case 'confirm': {
          if (!model.open) return [model, Cmd.none()];
          try {
            config.onConfirm?.();
          } catch {
            // A host callback cannot strand a modal surface.
          }
          return [{ ...model, open: false }, Cmd.popFocusGroup()];
        }
        case 'cancel': {
          if (!model.open) return [model, Cmd.none()];
          try {
            config.onCancel?.();
          } catch {
            // A host callback cannot strand a modal surface.
          }
          return [{ ...model, open: false }, Cmd.popFocusGroup()];
        }
        case 'select-confirm':
          return [{ ...model, selectedButton: 'confirm', hoveredButton: null }, Cmd.none()];
        case 'select-cancel':
          return [{ ...model, selectedButton: 'cancel', hoveredButton: null }, Cmd.none()];
        case 'hover-button':
          return [{ ...model, selectedButton: msg.button, hoveredButton: msg.button }, Cmd.none()];
        case 'leave-button':
          return [model.hoveredButton === msg.button ? { ...model, hoveredButton: null } : model, Cmd.none()];
        case 'open':
          return [{ ...model, open: true, selectedButton: 'cancel', hoveredButton: null, borderTick: 0 }, Cmd.pushFocusGroup(groupId)];
        case 'close':
          return [{ ...model, open: false }, model.open ? Cmd.popFocusGroup() : Cmd.none()];
        case 'tick':
          return model.open ? [{ ...model, borderTick: (model.borderTick ?? 0) + 1 }, Cmd.none()] : [model, Cmd.none()];
        case 'resize':
          return [{ ...model, viewportCols: Math.max(1, Math.floor(msg.cols)), viewportRows: Math.max(1, Math.floor(msg.rows)) }, Cmd.none()];
        case 'panic': {
          if (!model.open) return [model, Cmd.none()];
          broadcastSurfacePanic();
          try {
            config.onCancel?.();
          } catch {
            // best-effort
          }
          return [{ ...model, open: false }, Cmd.popFocusGroup()];
        }
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: ConfirmDialogModel): VNode {
      if (!model.open) return text('');

      const tokens = useTokens(confirmDialogContract, config, 'ConfirmDialog');
      const theme = resolveTheme(config);
      const borderColor = resolveAnimatedBorderColor(theme, theme.colors.borderHover, danger ? tokens.danger : tokens.border, model.borderTick ?? 0);
      const titleSt = applyTypography(tokens.titleStyle);
      const messageSt = applyTypography(tokens.bodyStyle);
      const hintSt = applyTypography(tokens.instructionStyle, { dim: false });

      // Build button styles
      const cancelSelected = model.selectedButton === 'cancel';
      const confirmSelected = model.selectedButton === 'confirm';
      const cancelHovered = model.hoveredButton === 'cancel';
      const confirmHovered = model.hoveredButton === 'confirm';

      const cancelStyle = cancelHovered
        ? applyState(tokens.hoverState, { bold: true })
        : cancelSelected
          ? applyState(tokens.selectedState)
          : applyState(tokens.restingState);

      const confirmStyle = confirmHovered
        ? applyState(tokens.hoverState, { bold: true, color: danger ? tokens.danger : undefined })
        : confirmSelected
          ? applyState(tokens.selectedState, { color: danger ? tokens.danger : undefined })
          : danger
            ? applyState(tokens.restingState, { color: tokens.danger })
            : applyState(tokens.restingState);

      const cancelButton = event(
        `${groupId}:cancel`,
        text(`[${cancelLabel}]`, cancelStyle, { wrap: true }),
        { onClick: cancelTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: cancelLabel, intent: 'cancel', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'N or Escape' },
      );
      setVNodeMeta(cancelButton, { a11y: { role: 'button', label: cancelLabel } });
      const confirmButton = event(
        `${groupId}:confirm`,
        text(`[${confirmLabel}]`, confirmStyle, { wrap: true }),
        { onClick: confirmTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: confirmLabel, intent: 'confirm', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Y or Enter' },
      );
      setVNodeMeta(confirmButton, { a11y: { role: 'button', label: confirmLabel } });
      const buttonRow = component((context) => {
        const availableWidth = context?.container.cols ?? 46;
        const horizontalWidth = measureTextWidth(`[${cancelLabel}]   [${confirmLabel}]`);
        return availableWidth >= horizontalWidth ? row(cancelButton, text('   '), confirmButton) : column(cancelButton, confirmButton);
      });

      const hintRow = text('y/n to confirm/cancel, tab to switch', hintSt, { wrap: true });

      const content = box(
        column(text(config.message, messageSt, { wrap: true }), text(''), buttonRow, text(''), hintRow),
        style({ padding: 1, background: tokens.bg }),
      );

      const preferredWidth = Math.max(20, Math.floor(config.width ?? 46));
      const viewportWidth = model.viewportCols === undefined ? preferredWidth : Math.max(1, model.viewportCols - 2);
      const width = Math.max(1, Math.min(preferredWidth, viewportWidth));

      const borderStyle = style({
        border: border.double,
        color: borderColor,
        background: tokens.bg,
        width,
      });

      const titleRow = row(text(' '), text(config.title, titleSt, { wrap: true }));

      return box(column(titleRow, content), borderStyle, { width, fit: 'content' });
    },

    subscriptions(model: ConfirmDialogModel): Sub<ConfirmDialogMsg> {
      if (!model.open) return Sub.none();

      // Determine toggle target based on current selection
      const toggleMsg: ConfirmDialogMsg = model.selectedButton === 'cancel' ? { type: 'select-confirm' } : { type: 'select-cancel' };

      // Enter activates whichever button is currently selected
      const enterMsg: ConfirmDialogMsg = model.selectedButton === 'confirm' ? { type: 'confirm' } : { type: 'cancel' };

      return Sub.batch<ConfirmDialogMsg>(
        Sub.elementMouse((mouseEvent) => {
          if (mouseEvent.handlerTag === confirmTag && mouseEvent.elementId === `${groupId}:confirm`) return { type: 'confirm' };
          if (mouseEvent.handlerTag === cancelTag && mouseEvent.elementId === `${groupId}:cancel`) return { type: 'cancel' };
          if (mouseEvent.handlerTag === hoverTag && mouseEvent.elementId === `${groupId}:confirm`) return { type: 'hover-button', button: 'confirm' };
          if (mouseEvent.handlerTag === hoverTag && mouseEvent.elementId === `${groupId}:cancel`) return { type: 'hover-button', button: 'cancel' };
          if (mouseEvent.handlerTag === leaveTag && mouseEvent.elementId === `${groupId}:confirm`) return { type: 'leave-button', button: 'confirm' };
          if (mouseEvent.handlerTag === leaveTag && mouseEvent.elementId === `${groupId}:cancel`) return { type: 'leave-button', button: 'cancel' };
          return { type: 'noop' };
        }),
        Sub.key('y', { type: 'confirm' }),
        Sub.key('n', { type: 'cancel' }),
        Sub.key('escape', { type: 'cancel' }),
        Sub.key('enter', enterMsg),
        Sub.key('tab', toggleMsg),
        Sub.key('left', { type: 'select-cancel' }),
        Sub.key('right', { type: 'select-confirm' }),
        Sub.resize((cols, rows) => ({ type: 'resize', cols, rows })),
        surfaceContractSubs<ConfirmDialogMsg>({ id: groupId, onPanic: { type: 'panic' } }),
        ...(resolveTheme(config).motion.reduceMotion ? [] : [Sub.timer<ConfirmDialogMsg>(160, () => ({ type: 'tick' }))]),
      );
    },
  };
}
