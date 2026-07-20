import { Cmd, type VNode, text } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { form } from '../engine.js';
import { buildFieldContextMenu, runFieldAction } from '../field-actions.js';
import { surface } from '../form-surface.js';
import { wizard } from '../wizard.js';

// ─── Fix 1: panic shortcut works on both Ctrl and Cmd modifiers ───────────

describe('surface panic shortcut binds both Ctrl+Shift+Backspace and Cmd+Shift+Backspace', () => {
  it('exposes both bindings via the subscription bundle', () => {
    const sut = surface({
      child: {
        init: () => [{}, Cmd.none()],
        update: (_msg, m) => [m, Cmd.none()],
        view: () => text('child') as VNode,
      },
    });
    const [model] = sut.init();
    const subs = sut.subscriptions!(model);
    // Sub.batch returns a Sub whose internals we don't peek into, but we
    // can serialise it. The shim representation contains the modifier
    // payloads.
    const serialised = JSON.stringify(subs);
    expect(serialised).toContain('ctrl');
    expect(serialised).toContain('meta');
  });
});

// ─── Fix 2: wizard previousStep refusing unknown refs ─────────────────────

describe('wizard previousStep no-ops when the predicate returns an unreachable step', () => {
  function makeStep(name: string) {
    return {
      name,
      title: name,
      component: {
        init(): [unknown, ReturnType<typeof Cmd.none>] {
          return [name, Cmd.none()];
        },
        update(_msg: never, m: unknown): [unknown, ReturnType<typeof Cmd.none>] {
          return [m, Cmd.none()];
        },
        view(_m: unknown): VNode {
          return text(name) as VNode;
        },
      },
    };
  }

  it('refuses back-nav when the predicate returns a never-visited ref', () => {
    const sut = wizard({
      steps: [
        makeStep('intro'),
        makeStep('b', /* not strictly needed */),
        { ...makeStep('end'), previousStep: () => 'unreachable' },
      ],
    });
    // Use goto so we can land on 'end' without traversing
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:goto', step: 'end' }, model);
    const visitedBefore = [...model.visited];
    [model] = sut.update({ type: 'wizard:prev' }, model);
    // No-op: visited and currentStep unchanged
    expect(model.visited).toEqual(visitedBefore);
    expect(model.currentStep).toBe(2);
  });

  it('still routes back when the ref WAS visited', () => {
    const sut = wizard({
      steps: [
        makeStep('a'),
        { ...makeStep('b'), previousStep: () => 'a' },
      ],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    expect(model.currentStep).toBe(1);
    [model] = sut.update({ type: 'wizard:prev' }, model);
    expect(model.currentStep).toBe(0);
  });
});

// ─── Fix 3: backdrop close as a documented msg path ───────────────────────

describe("surface supports an explicit 'backdrop' close reason", () => {
  it("accepts 'surface:close' with reason 'backdrop' and dismisses optimistically", () => {
    const sut = surface({
      child: {
        init: () => [{}, Cmd.none()],
        update: (_msg, m) => [m, Cmd.none()],
        view: () => text('child') as VNode,
      },
    });
    const [model] = sut.init();
    const [closed] = sut.update({ type: 'surface:close', reason: 'backdrop' }, model);
    expect(closed.open).toBe(false);
    expect(closed.closeReason).toBe('backdrop');
  });
});

// ─── Fix 4: buildFieldContextMenu flavour switch ──────────────────────────

describe('buildFieldContextMenu honours msg flavour', () => {
  it("emits 'form:set-field' msgs by default", () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    expect(items.find((i) => i.action === 'reset')?.msg).toMatchObject({ type: 'form:set-field' });
  });

  it("emits 'schema-form:set-field' msgs when flavour is 'schema-form'", () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name', { flavour: 'schema-form' });
    expect(items.find((i) => i.action === 'reset')?.msg).toMatchObject({ type: 'schema-form:set-field' });
  });

  it('paste returns the flavour-appropriate set-field msg', async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name', { flavour: 'schema-form' });
    const pasteItem = items.find((i) => i.action === 'paste')!;
    const result = await runFieldAction(pasteItem, model, 'name', {
      flavour: 'schema-form',
      readClipboard: async () => 'pasted',
    });
    expect(result).toMatchObject({ type: 'schema-form:set-field', field: 'name', value: 'pasted' });
  });

  it('paste no-ops cleanly if the clipboard reader rejects', async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const items = buildFieldContextMenu(model, 'name');
    const result = await runFieldAction(items.find((i) => i.action === 'paste')!, model, 'name', {
      readClipboard: async () => {
        throw new Error('denied');
      },
    });
    expect(result).toBeNull();
  });
});

// ─── Fix 5: async validation cannot overwrite submit verdict ──────────────

describe('form:submit invalidates in-flight async validation tokens', () => {
  it('drops stale async results that resolve after submit', async () => {
    const sut = form({
      fields: {
        username: {
          label: 'Username',
          defaultValue: '',
          asyncValidate: [
            async () =>
              new Promise((resolve) => {
                // Never resolves during this synchronous test — token bump
                // makes the rule's outcome irrelevant either way.
                setTimeout(() => resolve({ valid: false, message: 'taken' }), 0);
              }),
          ],
        },
      },
      onSubmit: () => {},
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'username', value: 'alice' }, model);
    expect(model.fields.username.asyncToken).toBe(1);
    const preSubmitToken = model.fields.username.asyncToken;

    [model] = sut.update({ type: 'form:submit' }, model);
    expect(model.fields.username.asyncToken).toBe(preSubmitToken! + 1);

    // Simulate a stale async result landing with the old token. The
    // engine must discard it (token mismatch).
    [model] = sut.update(
      {
        type: 'form:async-result',
        field: 'username',
        errors: ['taken'],
        token: preSubmitToken!,
      },
      model,
    );
    expect(model.fields.username.errors).not.toContain('taken');
  });

  it('clears the validating flag at submit time so submitBar does not flicker', () => {
    const sut = form({
      fields: {
        name: {
          label: 'Name',
          defaultValue: '',
          asyncValidate: [async () => new Promise(() => {})],
        },
      },
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'A' }, model);
    expect(model.validating).toBe(true);
    [model] = sut.update({ type: 'form:submit' }, model);
    expect(model.validating).toBe(false);
  });
});

// ─── Bonus: clipboard error path on runFieldAction ────────────────────────

describe('runFieldAction swallows clipboard read errors gracefully', () => {
  it("returns null when the reader rejects (no thrown error)", async () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const reader = vi.fn(async () => {
      throw new Error('clipboard permission denied');
    });
    const items = buildFieldContextMenu(model, 'name');
    const paste = items.find((i) => i.action === 'paste')!;
    await expect(runFieldAction(paste, model, 'name', { readClipboard: reader })).resolves.toBeNull();
  });
});
