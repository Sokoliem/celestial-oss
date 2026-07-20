import { describe, expect, it, vi } from 'vitest';
import { form } from '../engine.js';
import { formActions, submitBar, submitButton } from '../form-actions.js';

describe('submit lifecycle in FormModel', () => {
  it("starts in 'idle'", () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: '' } } });
    const [model] = sut.init();
    expect(model.submitState).toBe('idle');
  });

  it("moves to 'succeeded' after a sync valid submit", () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      onSubmit: () => {},
    });
    const [model] = sut.init();
    const [next] = sut.update({ type: 'form:submit' }, model);
    expect(next.submitState).toBe('succeeded');
  });

  it("moves to 'failed' on a sync invalid submit", () => {
    const sut = form({
      fields: {
        name: {
          label: 'Name',
          defaultValue: '',
          validate: [(value) => ((value as string).length === 0 ? { valid: false, message: 'required' } : { valid: true })],
        },
      },
    });
    const [model] = sut.init();
    const [next] = sut.update({ type: 'form:submit' }, model);
    expect(next.submitState).toBe('failed');
    expect(next.submitError).toBe('Validation failed');
  });

  it("moves to 'submitting' and resolves to 'succeeded' on a promise-returning onSubmit", async () => {
    let resolveSubmit: () => void = () => {};
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = vi.fn(() => submitPromise);
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      onSubmit,
    });
    const [model] = sut.init();
    const [submittingModel, cmd] = sut.update({ type: 'form:submit' }, model);
    expect(submittingModel.submitState).toBe('submitting');
    expect(cmd).toBeDefined();
    resolveSubmit();
    await submitPromise;
    // The engine would receive a `form:submit-resolve` msg from the Cmd
    // runtime; simulate that delivery.
    const [resolved] = sut.update({ type: 'form:submit-resolve', ok: true }, submittingModel);
    expect(resolved.submitState).toBe('succeeded');
  });

  it("transitions to 'failed' on a rejected onSubmit", () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      onSubmit: () => Promise.resolve(),
    });
    const [model] = sut.init();
    const [submittingModel] = sut.update({ type: 'form:submit' }, model);
    const [failed] = sut.update({ type: 'form:submit-resolve', ok: false, message: 'network' }, submittingModel);
    expect(failed.submitState).toBe('failed');
    expect(failed.submitError).toBe('network');
  });

  it("supports 'form:submit-cancel' from the submitting state", () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      onSubmit: () => Promise.resolve(),
    });
    const [model] = sut.init();
    const [submittingModel] = sut.update({ type: 'form:submit' }, model);
    const [cancelled] = sut.update({ type: 'form:submit-cancel' }, submittingModel);
    expect(cancelled.submitState).toBe('cancelled');
  });

  it("'form:submit-cancel' is a no-op when not submitting", () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const [next] = sut.update({ type: 'form:submit-cancel' }, model);
    expect(next.submitState).toBe('idle');
  });
});

describe('submitButton', () => {
  it('renders a label, no spinner, when idle and valid', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const node = submitButton(model);
    expect(JSON.stringify(node)).toContain('Submit');
    expect(JSON.stringify(node)).not.toContain('⟳');
  });

  it('renders a spinner glyph while submitting', () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      onSubmit: () => Promise.resolve(),
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:submit' }, model);
    const node = submitButton(model);
    expect(JSON.stringify(node)).toContain('⟳');
  });

  it('uses the failedLabel after a failed submit', () => {
    const sut = form({
      fields: {
        name: {
          label: 'Name',
          defaultValue: '',
          validate: [(value) => ((value as string).length === 0 ? { valid: false, message: 'required' } : { valid: true })],
        },
      },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:submit' }, model);
    const node = submitButton(model, { failedLabel: 'Try again' });
    expect(JSON.stringify(node)).toContain('Try again');
  });
});

describe('formActions', () => {
  it('renders both submit and cancel by default', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const node = formActions(model);
    const serialised = JSON.stringify(node);
    expect(serialised).toContain('Submit');
    expect(serialised).toContain('Cancel');
  });

  it('renders the reset button when showReset is set', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const node = formActions(model, { showReset: true });
    expect(JSON.stringify(node)).toContain('Reset');
  });
});

describe('submitBar', () => {
  it('renders nothing when pristine and idle', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const node = submitBar(model);
    // Empty column → no labels in the serialised view.
    const serialised = JSON.stringify(node);
    expect(serialised).not.toContain('Unsaved');
    expect(serialised).not.toContain('Submit');
  });

  it('renders the dirty pill once a field changes', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    const node = submitBar(model);
    expect(JSON.stringify(node)).toContain('Unsaved changes');
  });

  it('renders the submit error after a failed promise resolve', () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      onSubmit: () => Promise.resolve(),
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:submit' }, model);
    [model] = sut.update({ type: 'form:submit-resolve', ok: false, message: 'no network' }, model);
    const node = submitBar(model);
    expect(JSON.stringify(node)).toContain('no network');
  });
});
