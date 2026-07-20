import type { Color } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { column, row, text } from '@celestial/nebula';
import type { LocaleLike } from '@celestial/rosetta';
import { type OrbitMessages, tr } from './i18n.js';
import { feedbackColor, formColor, orbitToneColor, type ThemedConfig } from './theme.js';
import type { FieldMap, FormModel, SubmitState } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SubmitButtonConfig extends ThemedConfig {
  /** Label rendered in the idle state. Default `Submit`. */
  readonly label?: string;
  /** Label rendered while submitting. Default `Submitting…`. */
  readonly submittingLabel?: string;
  /** Label rendered after a successful submit. Default `Submitted`. */
  readonly succeededLabel?: string;
  /** Label rendered after a failed submit. Default `Retry`. */
  readonly failedLabel?: string;
  /** Label rendered after a cancelled submit. Default `Cancelled`. */
  readonly cancelledLabel?: string;
  /** When true, the button stays enabled even when the form is invalid. */
  readonly allowInvalid?: boolean;
  /** When true, the button stays disabled while async validation is in-flight. */
  readonly blockWhileValidating?: boolean;
  /** Optional translation overrides. */
  readonly messages?: OrbitMessages;
  readonly locale?: LocaleLike;
}

export interface FormActionsConfig extends SubmitButtonConfig {
  /** Label for the cancel/reset button. Default `Cancel`. */
  readonly cancelLabel?: string;
  /** When true, render a reset action that wipes back to initial. */
  readonly showReset?: boolean;
  /** Label for the reset action. Default `Reset`. */
  readonly resetLabel?: string;
}

export interface SubmitBarConfig extends FormActionsConfig {
  /** Override dirty pill copy. Default `Unsaved changes`. */
  readonly dirtyLabel?: string;
  /** Override pristine copy. Default `Saved`. */
  readonly pristineLabel?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isSubmitDisabled<Fields extends FieldMap>(model: FormModel<Fields>, config: SubmitButtonConfig): boolean {
  if (model.submitState === 'submitting') return true;
  if (config.blockWhileValidating && model.validating) return true;
  if (config.allowInvalid) return false;
  return !model.valid;
}

function labelForState(state: SubmitState, config: SubmitButtonConfig): string {
  switch (state) {
    case 'submitting':
      return config.submittingLabel ?? tr(config.messages, 'submit.submitting_label', undefined, config.locale);
    case 'succeeded':
      return config.succeededLabel ?? tr(config.messages, 'submit.succeeded_label', undefined, config.locale);
    case 'failed':
      return config.failedLabel ?? tr(config.messages, 'submit.failed_label', undefined, config.locale);
    case 'cancelled':
      return config.cancelledLabel ?? tr(config.messages, 'submit.cancelled_label', undefined, config.locale);
    case 'idle':
    default:
      return config.label ?? tr(config.messages, 'submit.label', undefined, config.locale);
  }
}

function colorForState(state: SubmitState, themed: ThemedConfig): Color {
  switch (state) {
    case 'submitting':
      return orbitToneColor(themed, 'info');
    case 'succeeded':
      return feedbackColor(themed, 'success');
    case 'failed':
      return feedbackColor(themed, 'danger');
    case 'cancelled':
      return feedbackColor(themed, 'warning');
    case 'idle':
    default:
      return orbitToneColor(themed, 'accent');
  }
}

// ─── submitButton ───────────────────────────────────────────────────────────

/**
 * Render a stateful submit button that reflects the form's `submitState`.
 *
 * The primitive returns a `VNode` rather than a ComponentDescriptor — the
 * button derives its label, color, and disabled flag from the form model
 * passed in, so the caller stays in control of layout. Wire a `Sub.key(...)`
 * or click handler that emits `{ type: 'form:submit' }` to actually trigger
 * the submit.
 */
export function submitButton<Fields extends FieldMap>(model: FormModel<Fields>, config: SubmitButtonConfig = {}): VNode {
  const disabled = isSubmitDisabled(model, config);
  const label = labelForState(model.submitState, config);
  const baseColor = colorForState(model.submitState, config);
  const buttonStyle = disabled ? style({ color: formColor(config, 'muted'), dim: true }) : style({ color: baseColor, bold: true });

  const spinnerGlyph = model.submitState === 'submitting' ? '⟳ ' : '';
  return text(`${spinnerGlyph}[ ${label} ]`, buttonStyle);
}

// ─── formActions ────────────────────────────────────────────────────────────

/**
 * Render submit + cancel (+ optional reset) in a horizontal row. Used as
 * the bottom action bar of a form when minimal chrome is desired.
 */
export function formActions<Fields extends FieldMap>(model: FormModel<Fields>, config: FormActionsConfig = {}): VNode {
  const submit = submitButton(model, config);
  const cancelStyle = style({ color: formColor(config, 'muted'), dim: true });
  const cancelLabel = config.cancelLabel ?? tr(config.messages, 'submit.cancel_label', undefined, config.locale);
  const cancel = text(`[ ${cancelLabel} ]`, cancelStyle);

  if (config.showReset) {
    const resetLabel = config.resetLabel ?? tr(config.messages, 'submit.reset_label', undefined, config.locale);
    const resetStyle = style({ color: formColor(config, 'muted'), dim: true });
    return row(submit, text('  '), cancel, text('  '), text(`[ ${resetLabel} ]`, resetStyle));
  }
  return row(submit, text('  '), cancel);
}

// ─── submitBar ──────────────────────────────────────────────────────────────

/**
 * Render a multi-line submit bar with a dirty indicator above the action
 * buttons. Renders nothing when the form is pristine *and* no submit attempt
 * has been made, so it doesn't clutter the surface until the user starts
 * editing.
 */
export function submitBar<Fields extends FieldMap>(model: FormModel<Fields>, config: SubmitBarConfig = {}): VNode {
  const dirty = model.fieldOrder.some((key) => model.fields[key].dirty);
  if (!dirty && model.submitState === 'idle') {
    return column();
  }

  const indicatorStyle = dirty ? style({ color: feedbackColor(config, 'warning') }) : style({ color: formColor(config, 'muted'), dim: true });
  const indicatorLabel = dirty
    ? (config.dirtyLabel ?? tr(config.messages, 'submit.dirty_label', undefined, config.locale))
    : (config.pristineLabel ?? tr(config.messages, 'submit.pristine_label', undefined, config.locale));

  const lines: VNode[] = [];
  lines.push(text(`● ${indicatorLabel}`, indicatorStyle));
  if (model.submitState === 'failed' && model.submitError) {
    lines.push(text(`✗ ${model.submitError}`, style({ color: feedbackColor(config, 'danger') })));
  }
  lines.push(formActions(model, config));
  return column(...lines);
}
