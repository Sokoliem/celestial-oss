import { describe, expect, it } from 'vitest';
import { form } from '../engine.js';
import { emitLedgerEvent, type OrbitLedger, type OrbitLedgerEvent } from '../ledger.js';
import { schemaForm } from '../schema-form.js';
import { wizard } from '../wizard.js';

function recordingStore(): OrbitLedger & { readonly events: OrbitLedgerEvent[] } {
  const events: OrbitLedgerEvent[] = [];
  return {
    events,
    append(input: OrbitLedgerEvent) {
      events.push(input);
      return { id: `evt-${events.length}` };
    },
  };
}

describe('emitLedgerEvent', () => {
  it('returns immediately when no store is supplied', async () => {
    await expect(emitLedgerEvent(undefined, { kind: 'noop' })).resolves.toBeUndefined();
  });

  it('forwards the input to the store', async () => {
    const store = recordingStore();
    await emitLedgerEvent(store, { kind: 'test:event', payload: { hello: 'world' } });
    expect(store.events).toEqual([{ kind: 'test:event', payload: { hello: 'world' } }]);
  });

  it('swallows store errors so form interaction is never broken', async () => {
    const store: OrbitLedger = {
      append: () => {
        throw new Error('broken store');
      },
    };
    await expect(emitLedgerEvent(store, { kind: 'will-fail' })).resolves.toBeUndefined();
  });
});

describe('form() emits structured events', () => {
  it('emits form:field-changed on every change', () => {
    const store = recordingStore();
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: '' } },
      ledger: store,
      ledgerFormId: 'profile',
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Alice' }, model);
    expect(store.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'form:field-changed',
          payload: expect.objectContaining({ formId: 'profile', field: 'name', value: 'Alice' }),
        }),
      ]),
    );
  });

  it('emits form:submitted when validation passes', () => {
    const store = recordingStore();
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: 'Alice' } },
      ledger: store,
    });
    const [model] = sut.init();
    sut.update({ type: 'form:submit' }, model);
    expect(store.events.some((e) => e.kind === 'form:submitted')).toBe(true);
  });

  it('emits form:validation-failed with field error details on a failing submit', () => {
    const store = recordingStore();
    const sut = form({
      fields: {
        name: {
          label: 'Name',
          defaultValue: '',
          validate: [(value) => ((value as string).length === 0 ? { valid: false, message: 'required' } : { valid: true })],
        },
      },
      ledger: store,
    });
    const [model] = sut.init();
    sut.update({ type: 'form:submit' }, model);
    const failure = store.events.find((e) => e.kind === 'form:validation-failed');
    expect(failure).toBeDefined();
    expect(failure?.payload).toMatchObject({ errors: { name: ['required'] } });
  });

  it('emits form:autosaved when autosave completes', () => {
    const store = recordingStore();
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: '' } },
      ledger: store,
    });
    const [model] = sut.init();
    sut.update({ type: 'form:autosave-complete', reset: false }, model);
    expect(store.events.some((e) => e.kind === 'form:autosaved')).toBe(true);
  });

  it('does not emit when no store is configured', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: '' } } });
    const [model] = sut.init();
    sut.update({ type: 'form:field-change', field: 'name', value: 'X' }, model);
    // No store wired — assertion is the absence of a thrown error. We
    // exercise the path simply to confirm nothing in the emit branch
    // touches an undefined object.
    expect(model.fields.name.value).toBe('');
  });
});

describe('wizard() emits step events', () => {
  function counterStep(name?: string, validate?: () => { valid: boolean; message?: string }) {
    return {
      name,
      title: name ?? 'Step',
      validate: validate as never,
      component: {
        init(): [unknown, ReturnType<typeof import('@celestial/nebula').Cmd.none>] {
          return [{}, { _tag: 'cmd', _kind: { kind: 'none' } } as never];
        },
        update(_msg: never, m: unknown): [unknown, ReturnType<typeof import('@celestial/nebula').Cmd.none>] {
          return [m, { _tag: 'cmd', _kind: { kind: 'none' } } as never];
        },
        view(_m: unknown) {
          return null as never;
        },
      },
    };
  }

  it('emits step-advanced + step-completed on next', () => {
    const store = recordingStore();
    const sut = wizard({
      steps: [counterStep('first'), counterStep('second')],
      ledger: store,
      ledgerWizardId: 'onboarding',
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    expect(store.events.map((e) => e.kind)).toEqual(['wizard:step-completed', 'wizard:step-advanced']);
    expect(store.events[0]?.payload).toMatchObject({ wizardId: 'onboarding', step: 'first' });
    expect(store.events[1]?.payload).toMatchObject({ wizardId: 'onboarding', from: 'first', to: 'second' });
  });

  it('emits wizard:finished on the last step', () => {
    const store = recordingStore();
    const sut = wizard({
      steps: [counterStep('only')],
      ledger: store,
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    expect(store.events.map((e) => e.kind)).toContain('wizard:finished');
  });
});

describe('schemaForm() emits structured events', () => {
  it('emits form:field-changed via the set-field msg', () => {
    const store = recordingStore();
    const sut = schemaForm({
      schema: { fields: [{ kind: 'text', name: 'title' }] },
      value: { title: '' },
      onChange: () => {},
      ledger: store,
      ledgerFormId: 'schema-flow',
    });
    const [model] = sut.init();
    sut.update({ type: 'schema-form:set-field', field: 'title', value: 'Hello' }, model);
    expect(store.events.some((e) => e.kind === 'form:field-changed' && (e.payload?.field as string) === 'title')).toBe(true);
  });

  it('emits form:submitted on a valid submit', () => {
    const store = recordingStore();
    const sut = schemaForm({
      schema: { fields: [{ kind: 'text', name: 'title' }] },
      value: { title: 'ok' },
      onChange: () => {},
      ledger: store,
    });
    const [model] = sut.init();
    sut.update({ type: 'schema-form:submit' }, model);
    expect(store.events.some((e) => e.kind === 'form:submitted')).toBe(true);
  });
});
