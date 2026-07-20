/**
 * Orbit string catalog. Every user-facing navigation hint, button label,
 * and progress label that previously lived as an inline English literal is
 * mapped here with a default copy.
 *
 * Consumers translate by passing `messages: { ... }` on `FormConfig`,
 * `WizardConfig`, or `SchemaFormProps`. The `tr(...)` helper falls back to
 * the defaults when a key is missing so partial translations don't blank
 * surfaces.
 */

import { resolveLocale, type LocaleLike } from '@celestial/rosetta';

export type OrbitMessageKey =
  | 'form.nav.hint'
  | 'wizard.step_label'
  | 'wizard.btn.prev'
  | 'wizard.btn.next'
  | 'wizard.btn.finish'
  | 'schema-form.nav.hint'
  | 'schema-form.preview.label'
  | 'submit.label'
  | 'submit.submitting_label'
  | 'submit.succeeded_label'
  | 'submit.failed_label'
  | 'submit.cancelled_label'
  | 'submit.cancel_label'
  | 'submit.reset_label'
  | 'submit.dirty_label'
  | 'submit.pristine_label';

export type OrbitMessages = Partial<Record<OrbitMessageKey, string>>;

const DEFAULT_MESSAGES: Record<OrbitMessageKey, string> = {
  'form.nav.hint': '  [Tab] next  [Shift+Tab] prev  [Enter] submit',
  'wizard.step_label': 'Step {{current}} of {{total}}: {{title}}',
  'wizard.btn.prev': '[Prev]',
  'wizard.btn.next': '[Next]',
  'wizard.btn.finish': '[Finish]',
  'schema-form.nav.hint': 'Tab/Shift+Tab move focus',
  'schema-form.preview.label': 'Preview',
  'submit.label': 'Submit',
  'submit.submitting_label': 'Submitting…',
  'submit.succeeded_label': 'Submitted',
  'submit.failed_label': 'Retry',
  'submit.cancelled_label': 'Cancelled',
  'submit.cancel_label': 'Cancel',
  'submit.reset_label': 'Reset',
  'submit.dirty_label': 'Unsaved changes',
  'submit.pristine_label': 'Saved',
};

/** Format `{{key}}` placeholders in a template string. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? `{{${key}}}` : String(value);
  });
}

/** Look up a translated message. Falls back to the built-in default. */
export function tr(
  messages: OrbitMessages | undefined,
  key: OrbitMessageKey,
  vars?: Record<string, string | number>,
  locale?: LocaleLike,
): string {
  // Resolving the locale doesn't change the lookup today (no locale-specific
  // defaults shipped yet), but it's threaded so consumers can opt in via
  // rosetta when they ship message bundles.
  resolveLocale(locale);
  const template = messages?.[key] ?? DEFAULT_MESSAGES[key];
  return interpolate(template, vars);
}

export { DEFAULT_MESSAGES as ORBIT_DEFAULT_MESSAGES };
