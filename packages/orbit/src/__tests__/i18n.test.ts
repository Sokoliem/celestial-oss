import { describe, expect, it } from 'vitest';
import { form } from '../engine.js';
import { interpolate, ORBIT_DEFAULT_MESSAGES, tr } from '../i18n.js';
import { wizard } from '../wizard.js';
import { submitBar, submitButton } from '../form-actions.js';
import { Cmd } from '@celestial/nebula';

describe('interpolate', () => {
  it('substitutes {{name}} placeholders', () => {
    expect(interpolate('Hello {{who}}', { who: 'world' })).toBe('Hello world');
  });

  it('leaves unknown keys as placeholders', () => {
    expect(interpolate('Hello {{who}}', {})).toBe('Hello {{who}}');
  });

  it('returns the template unchanged when no vars supplied', () => {
    expect(interpolate('Static')).toBe('Static');
  });
});

describe('tr', () => {
  it('returns the default for known keys', () => {
    expect(tr(undefined, 'form.nav.hint')).toBe(ORBIT_DEFAULT_MESSAGES['form.nav.hint']);
  });

  it('applies overrides from the messages map', () => {
    expect(tr({ 'form.nav.hint': 'NAV' }, 'form.nav.hint')).toBe('NAV');
  });

  it('interpolates vars after applying overrides', () => {
    expect(tr({ 'wizard.step_label': 'Krok {{current}} z {{total}}: {{title}}' }, 'wizard.step_label', { current: 2, total: 5, title: 'Setup' })).toBe(
      'Krok 2 z 5: Setup',
    );
  });
});

describe('form() honours the messages override', () => {
  it('replaces the keyboard cheat-sheet text', () => {
    const sut = form({
      fields: { name: { label: 'Name', defaultValue: '' } },
      messages: { 'form.nav.hint': '   [Tab] siguiente   [Shift+Tab] anterior   [Enter] enviar' },
    });
    const [model] = sut.init();
    const view = sut.view(model);
    expect(JSON.stringify(view)).toContain('siguiente');
  });
});

describe('wizard() honours messages overrides', () => {
  function makeStep(name: string) {
    return {
      name,
      title: `Step ${name}`,
      component: {
        init(): [unknown, ReturnType<typeof Cmd.none>] {
          return [name, Cmd.none()];
        },
        update(_msg: never, m: unknown): [unknown, ReturnType<typeof Cmd.none>] {
          return [m, Cmd.none()];
        },
        view() {
          return null as never;
        },
      },
    };
  }

  it('uses translated progress + navigation labels', () => {
    const sut = wizard({
      steps: [makeStep('a'), makeStep('b')],
      messages: {
        'wizard.step_label': 'Étape {{current}} sur {{total}}: {{title}}',
        'wizard.btn.next': '[Suivant]',
        'wizard.btn.finish': '[Terminer]',
        'wizard.btn.prev': '[Précédent]',
      },
    });
    const [model] = sut.init();
    const view = sut.view(model);
    const serialised = JSON.stringify(view);
    expect(serialised).toContain('Étape');
    expect(serialised).toContain('Suivant');
  });
});

describe('submit primitives honour messages overrides', () => {
  it('uses a localised idle label on submitButton', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    const [model] = sut.init();
    const node = submitButton(model, { messages: { 'submit.label': 'Wysłać' } });
    expect(JSON.stringify(node)).toContain('Wysłać');
  });

  it('uses a localised dirty pill on submitBar', () => {
    const sut = form({ fields: { name: { label: 'Name', defaultValue: 'Alice' } } });
    let [model] = sut.init();
    [model] = sut.update({ type: 'form:field-change', field: 'name', value: 'Bob' }, model);
    const node = submitBar(model, { messages: { 'submit.dirty_label': 'Nicht gespeichert' } });
    expect(JSON.stringify(node)).toContain('Nicht gespeichert');
  });
});
