/**
 * Field-level context-menu primitives.
 *
 * CLAUDE.md's design-language section says mouse is the primary path; field
 * actions like Clear / Reset / Copy / Paste live behind a right-click on the
 * field. This module ships a builder that produces nexus-compatible
 * `MenuItem<FormMsg>` arrays so consumers can pipe them into
 * `@celestial/nexus`' `contextMenuOpen` flow without re-wiring the action
 * vocabulary in each app.
 *
 * The functions are pure — they do not access globals, do not touch the
 * filesystem, and do not invoke nexus directly. Hosts wire the resulting
 * `MenuItem`s to a right-click handler and pipe the chosen `msg` back into
 * the form's `update` function.
 */

import type { FormMsg } from './engine.js';
import type { SchemaFormMsg } from './schema-form.js';
import type { FieldMap, FormModel } from './types.js';

// ─── Action vocabulary ─────────────────────────────────────────────────────

export type FieldAction = 'clear' | 'reset' | 'copy' | 'paste';

/**
 * Msg flavour to emit for value-changing actions. v1 forms emit
 * `'form:set-field'`, v2 SchemaForm emits `'schema-form:set-field'`. The
 * helper picks the right shape based on this option so the same context
 * menu wiring works in both layers.
 */
export type FieldMenuMsgFlavour = 'form' | 'schema-form';

/** Union of value-setting msgs the helper can produce. */
export type FieldSetFieldMsg = FormMsg | SchemaFormMsg;

export interface FieldContextMenuOptions {
  /** Override which actions appear. Default: all four. */
  readonly actions?: readonly FieldAction[];
  /** Replace built-in labels — keys are action names. */
  readonly labels?: Partial<Record<FieldAction, string>>;
  /** Async clipboard reader for Paste. Defaults to `navigator.clipboard.readText`. */
  readonly readClipboard?: () => Promise<string>;
  /** Sync or async clipboard writer for Copy. Defaults to `navigator.clipboard.writeText`. */
  readonly writeClipboard?: (value: string) => void | Promise<void>;
  /** Which form layer to target. Default `'form'`. */
  readonly flavour?: FieldMenuMsgFlavour;
}

const DEFAULT_LABELS: Record<FieldAction, string> = {
  clear: 'Clear',
  reset: 'Reset to default',
  copy: 'Copy value',
  paste: 'Paste',
};

function setFieldMsg(flavour: FieldMenuMsgFlavour | undefined, field: string, value: unknown): FieldSetFieldMsg {
  if (flavour === 'schema-form') {
    return { type: 'schema-form:set-field', field, value: value as never };
  }
  return { type: 'form:set-field', field, value };
}

// ─── Builders ───────────────────────────────────────────────────────────────

/**
 * Build the menu item objects for a single field. The returned items carry
 * `msg` values consumers should dispatch back into the form. `copy` and
 * `paste` are tagged with a `meta.action` discriminator so callers can
 * inspect them and run side-effects (clipboard I/O) before dispatching.
 */
export interface FieldMenuItem {
  readonly label: string;
  readonly action: FieldAction;
  /** Engine msg to dispatch after performing any clipboard side-effects. Null when no engine state needs to change (e.g. copy is read-only). */
  readonly msg: FieldSetFieldMsg | null;
  /** Whether this action is currently disabled (e.g. paste with no clipboard text). */
  readonly disabled: boolean;
}

export function buildFieldContextMenu<Fields extends FieldMap>(
  model: FormModel<Fields>,
  field: keyof Fields & string,
  options: FieldContextMenuOptions = {},
): FieldMenuItem[] {
  const fieldState = model.fields[field];
  const initial = model.initialValues[field];
  const value = fieldState?.value;

  const requested = options.actions ?? (['clear', 'reset', 'copy', 'paste'] as const);
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const items: FieldMenuItem[] = [];

  for (const action of requested) {
    switch (action) {
      case 'clear':
        items.push({
          label: labels.clear,
          action: 'clear',
          msg: setFieldMsg(options.flavour, field, clearedValue(initial)),
          disabled: isEmptyValue(value),
        });
        break;
      case 'reset':
        items.push({
          label: labels.reset,
          action: 'reset',
          msg: setFieldMsg(options.flavour, field, initial),
          disabled: !fieldState?.dirty,
        });
        break;
      case 'copy':
        items.push({
          label: labels.copy,
          action: 'copy',
          msg: null,
          disabled: isEmptyValue(value),
        });
        break;
      case 'paste':
        items.push({
          label: labels.paste,
          action: 'paste',
          msg: null,
          disabled: false,
        });
        break;
    }
  }
  return items;
}

/**
 * Perform a `FieldMenuItem.action` against the form, applying any
 * clipboard-side I/O. Returns the engine msg to dispatch (or `null` when
 * the action was purely a side-effect such as `copy`).
 *
 * Designed so a consumer can do:
 * ```ts
 * const msg = await runFieldAction(menuItem, model, 'username');
 * if (msg) dispatch(msg);
 * ```
 */
export async function runFieldAction<Fields extends FieldMap>(
  item: FieldMenuItem,
  model: FormModel<Fields>,
  field: keyof Fields & string,
  options: FieldContextMenuOptions = {},
): Promise<FieldSetFieldMsg | null> {
  switch (item.action) {
    case 'clear':
    case 'reset':
      return item.msg;
    case 'copy': {
      const value = model.fields[field]?.value;
      const writer = options.writeClipboard ?? defaultClipboardWriter();
      if (writer) {
        await Promise.resolve(writer(stringify(value)));
      }
      return null;
    }
    case 'paste': {
      const reader = options.readClipboard ?? defaultClipboardReader();
      if (!reader) return null;
      let pastedText: string;
      try {
        pastedText = await reader();
      } catch {
        // Clipboard read can reject (denied permission, document not
        // focused, etc.). Treat as a no-op rather than propagating —
        // surface dismissal must not break on clipboard errors.
        return null;
      }
      return setFieldMsg(options.flavour, field, pastedText);
    }
    default:
      return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clearedValue(initial: unknown): unknown {
  if (typeof initial === 'string') return '';
  if (typeof initial === 'number') return 0;
  if (typeof initial === 'boolean') return false;
  if (Array.isArray(initial)) return [];
  return '';
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function stringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function defaultClipboardWriter(): ((value: string) => Promise<void>) | null {
  if (typeof navigator === 'object' && navigator && 'clipboard' in navigator) {
    const clipboard = (navigator as Navigator).clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      return (value) => clipboard.writeText(value);
    }
  }
  return null;
}

function defaultClipboardReader(): (() => Promise<string>) | null {
  if (typeof navigator === 'object' && navigator && 'clipboard' in navigator) {
    const clipboard = (navigator as Navigator).clipboard;
    if (clipboard && typeof clipboard.readText === 'function') {
      return () => clipboard.readText();
    }
  }
  return null;
}
