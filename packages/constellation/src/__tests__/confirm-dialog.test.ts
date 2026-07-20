import { color, defaultTheme } from '@celestial/core/corona';
import { describe, expect, it, vi } from 'vitest';
import type { ConfirmDialogModel } from '../confirm-dialog.js';
import { confirmDialog, confirmDialogContract } from '../confirm-dialog.js';

// Helper to recursively serialize a VNode tree for assertion
function deepSerialize(node: unknown): string {
  return JSON.stringify(node, (_key, value) => {
    if (value && typeof value === 'object' && value.kind === 'component' && typeof value.render === 'function') {
      return { kind: 'component', expanded: value.render() };
    }
    if (typeof value === 'function') return undefined;
    return value;
  });
}

describe('confirmDialog', () => {
  // ─── init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('initializes open by default', () => {
      const comp = confirmDialog({ title: 'Delete?', message: 'Are you sure?' });
      const [model] = comp.init();
      expect(model.open).toBe(true);
    });

    it('initializes closed when open is false', () => {
      const comp = confirmDialog({ title: 'Delete?', message: 'Are you sure?', open: false });
      const [model] = comp.init();
      expect(model.open).toBe(false);
    });

    it('initializes with cancel button selected by default', () => {
      const comp = confirmDialog({ title: 'Delete?', message: 'Are you sure?' });
      const [model] = comp.init();
      expect(model.selectedButton).toBe('cancel');
    });

    it('pushes focus group when opened', () => {
      const comp = confirmDialog({ title: 'Delete?', message: 'Are you sure?' });
      const [, cmd] = comp.init();
      // cmd should be a focus group push command (not Cmd.none)
      expect(cmd).toBeDefined();
      expect(cmd).not.toEqual({ type: 'none' });
    });

    it('returns Cmd.none when initially closed', () => {
      const comp = confirmDialog({ title: 'Delete?', message: 'Are you sure?', open: false });
      const [, cmd] = comp.init();
      // Cmd.none() produces a tagged object with _kind.kind === 'none'
      expect((cmd as any)._kind?.kind ?? (cmd as any).type).toBe('none');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('confirm msg calls onConfirm callback and closes', () => {
      const onConfirm = vi.fn();
      const comp = confirmDialog({ title: 'Delete?', message: 'Sure?', onConfirm });
      const [model] = comp.init();
      const [updated] = comp.update({ type: 'confirm' }, model);
      expect(onConfirm).toHaveBeenCalledOnce();
      expect(updated.open).toBe(false);
    });

    it('cancel msg calls onCancel callback and closes', () => {
      const onCancel = vi.fn();
      const comp = confirmDialog({ title: 'Delete?', message: 'Sure?', onCancel });
      const [model] = comp.init();
      const [updated] = comp.update({ type: 'cancel' }, model);
      expect(onCancel).toHaveBeenCalledOnce();
      expect(updated.open).toBe(false);
    });

    it('confirm does not call callback when already closed', () => {
      const onConfirm = vi.fn();
      const comp = confirmDialog({ title: 'Delete?', message: 'Sure?', onConfirm });
      const closedModel: ConfirmDialogModel = { open: false, selectedButton: 'cancel' };
      comp.update({ type: 'confirm' }, closedModel);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('cancel does not call callback when already closed', () => {
      const onCancel = vi.fn();
      const comp = confirmDialog({ title: 'Delete?', message: 'Sure?', onCancel });
      const closedModel: ConfirmDialogModel = { open: false, selectedButton: 'cancel' };
      comp.update({ type: 'cancel' }, closedModel);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('select-confirm sets selectedButton to confirm', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const [updated] = comp.update({ type: 'select-confirm' }, model);
      expect(updated.selectedButton).toBe('confirm');
    });

    it('select-cancel sets selectedButton to cancel', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const [confirmSelected] = comp.update({ type: 'select-confirm' }, model);
      const [updated] = comp.update({ type: 'select-cancel' }, confirmSelected);
      expect(updated.selectedButton).toBe('cancel');
    });

    it('open msg opens the dialog', () => {
      const comp = confirmDialog({ title: 'T', message: 'M', open: false });
      const [model] = comp.init();
      expect(model.open).toBe(false);
      const [updated] = comp.update({ type: 'open' }, model);
      expect(updated.open).toBe(true);
    });

    it('close msg closes the dialog without calling callbacks', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const comp = confirmDialog({ title: 'T', message: 'M', onConfirm, onCancel });
      const [model] = comp.init();
      const [updated] = comp.update({ type: 'close' }, model);
      expect(updated.open).toBe(false);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('confirm pops focus group', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const [, cmd] = comp.update({ type: 'confirm' }, model);
      // Should be a pop focus group command
      expect(cmd).toBeDefined();
      expect(cmd).not.toEqual({ type: 'none' });
    });

    it('cancel pops focus group', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const [, cmd] = comp.update({ type: 'cancel' }, model);
      expect(cmd).toBeDefined();
      expect(cmd).not.toEqual({ type: 'none' });
    });
  });

  // ─── view ──────────────────────────────────────────────────────────────────

  describe('view', () => {
    it('returns empty text when closed', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const closedModel: ConfirmDialogModel = { open: false, selectedButton: 'cancel' };
      const view = comp.view(closedModel);
      expect(view.kind).toBe('text');
      expect((view as { content?: string }).content).toBe('');
    });

    it('renders title text', () => {
      const comp = confirmDialog({ title: 'Delete Item?', message: 'Sure?' });
      const [model] = comp.init();
      const view = comp.view(model);
      const serialized = deepSerialize(view);
      expect(serialized).toContain('Delete Item?');
    });

    it('renders message text', () => {
      const comp = confirmDialog({ title: 'T', message: 'Are you really sure about this?' });
      const [model] = comp.init();
      const view = comp.view(model);
      const serialized = deepSerialize(view);
      expect(serialized).toContain('Are you really sure about this?');
    });

    it('renders default button labels', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const view = comp.view(model);
      const serialized = deepSerialize(view);
      expect(serialized).toContain('Cancel');
      expect(serialized).toContain('Confirm');
    });

    it('renders custom button labels', () => {
      const comp = confirmDialog({
        title: 'T',
        message: 'M',
        confirmLabel: 'Yes, delete',
        cancelLabel: 'No, keep it',
      });
      const [model] = comp.init();
      const view = comp.view(model);
      const serialized = deepSerialize(view);
      expect(serialized).toContain('Yes, delete');
      expect(serialized).toContain('No, keep it');
    });

    it('keeps enabled actions readable while marking the selected button', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      // cancel is selected by default
      const view = comp.view(model);
      const serialized = deepSerialize(view);
      // The selected (cancel) button should have bold:true in its style
      expect(serialized).toContain('"bold":true');
      // Enabled actions no longer borrow the disabled-state token.
      expect(serialized).toContain('[Confirm]');
    });

    it('moves selection with pointer hover and paints a hover background', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const [hovered] = comp.update({ type: 'hover-button', button: 'confirm' }, model);
      expect(hovered.selectedButton).toBe('confirm');
      expect(hovered.hoveredButton).toBe('confirm');
      expect(deepSerialize(comp.view(hovered))).toContain('"bgRgb"');
    });

    it('danger mode applies danger color to confirm button', () => {
      const comp = confirmDialog({ title: 'T', message: 'M', danger: true });
      const confirmModel: ConfirmDialogModel = { open: true, selectedButton: 'confirm' };
      const view = comp.view(confirmModel);
      const serialized = deepSerialize(view);
      expect(serialized).toContain(`"fgRgb":${JSON.stringify(defaultTheme.typography.error.color.rgb)}`);
    });

    it('keeps its keyboard instruction readable on the modal surface', () => {
      const instruction = confirmDialogContract.instructionStyle(defaultTheme);
      const surface = confirmDialogContract.bg(defaultTheme);

      expect(instruction.dim).not.toBe(true);
      expect(color.contrastRatio(instruction.color, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('non-danger mode does not apply danger color to confirm button', () => {
      const comp = confirmDialog({ title: 'T', message: 'M', danger: false });
      const [model] = comp.init();
      const view = comp.view(model);
      const serialized = deepSerialize(view);
      // Non-danger: should not contain the danger tone RGB
      expect(serialized).not.toContain('"fgRgb":[248,113,113]');
    });
  });

  // ─── subscriptions ────────────────────────────────────────────────────────

  describe('subscriptions', () => {
    it('returns Sub.none when closed', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const closedModel: ConfirmDialogModel = { open: false, selectedButton: 'cancel' };
      const sub = comp.subscriptions!(closedModel);
      // Sub.none() produces a tagged object with _kind.kind === 'none'
      expect((sub as any)._kind?.kind ?? (sub as any).type).toBe('none');
    });

    it('returns key subscriptions when open', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      expect(sub).toBeDefined();
      expect(sub).not.toEqual({ type: 'none' });
    });

    it('subscription batch includes y key for confirm', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      const serialized = JSON.stringify(sub);
      expect(serialized).toContain('"y"');
    });

    it('subscription batch includes n key for cancel', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      const serialized = JSON.stringify(sub);
      expect(serialized).toContain('"n"');
    });

    it('subscription batch includes escape key for cancel', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      const serialized = JSON.stringify(sub);
      expect(serialized).toContain('"escape"');
    });

    it('subscription batch includes enter key', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      const serialized = JSON.stringify(sub);
      expect(serialized).toContain('"enter"');
    });

    it('subscription batch includes tab key', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      const serialized = JSON.stringify(sub);
      expect(serialized).toContain('"tab"');
    });

    it('subscription batch includes left/right arrow keys', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const sub = comp.subscriptions!(model);
      const serialized = JSON.stringify(sub);
      expect(serialized).toContain('"left"');
      expect(serialized).toContain('"right"');
    });
  });

  // ─── integration ──────────────────────────────────────────────────────────

  describe('integration', () => {
    it('full confirm flow: init -> select confirm -> confirm', () => {
      const onConfirm = vi.fn();
      const comp = confirmDialog({ title: 'T', message: 'M', onConfirm });
      const [model] = comp.init();
      const [selected] = comp.update({ type: 'select-confirm' }, model);
      expect(selected.selectedButton).toBe('confirm');
      const [closed] = comp.update({ type: 'confirm' }, selected);
      expect(closed.open).toBe(false);
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('full cancel flow: init -> cancel', () => {
      const onCancel = vi.fn();
      const comp = confirmDialog({ title: 'T', message: 'M', onCancel });
      const [model] = comp.init();
      const [closed] = comp.update({ type: 'cancel' }, model);
      expect(closed.open).toBe(false);
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('toggle selection cycles between buttons', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      expect(model.selectedButton).toBe('cancel');
      const [s1] = comp.update({ type: 'select-confirm' }, model);
      expect(s1.selectedButton).toBe('confirm');
      const [s2] = comp.update({ type: 'select-cancel' }, s1);
      expect(s2.selectedButton).toBe('cancel');
    });

    it('reopen after close resets selectedButton', () => {
      const comp = confirmDialog({ title: 'T', message: 'M' });
      const [model] = comp.init();
      const [selected] = comp.update({ type: 'select-confirm' }, model);
      const [closed] = comp.update({ type: 'close' }, selected);
      const [reopened] = comp.update({ type: 'open' }, closed);
      expect(reopened.open).toBe(true);
      expect(reopened.selectedButton).toBe('cancel');
    });
  });
});
