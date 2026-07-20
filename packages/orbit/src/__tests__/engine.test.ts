import { describe, expect, it, vi } from 'vitest';
import { form } from '../engine.js';
import type { FieldConfig } from '../types.js';
import { minLength, required } from '../validation.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

type TestFields = {
  name: FieldConfig<string>;
  email: FieldConfig<string>;
};

function createTestForm(overrides?: Partial<Parameters<typeof form>[0]>) {
  const fields: TestFields = {
    name: { label: 'Name', defaultValue: '', validate: [required()] },
    email: { label: 'Email', defaultValue: '', validate: [required(), minLength(5)] },
    ...(overrides?.fields as any),
  };
  return form<TestFields>({
    fields,
    ...overrides,
  } as any);
}

async function collectCmdMessages(cmd: any): Promise<any[]> {
  if (!cmd || cmd._tag !== 'cmd') return [];

  switch (cmd._kind.kind) {
    case 'none':
      return [];
    case 'batch':
    case 'sequence': {
      const nested = await Promise.all(cmd._kind.cmds.map((child: any) => collectCmdMessages(child)));
      return nested.flat();
    }
    case 'map': {
      const nested = await collectCmdMessages(cmd._kind.cmd);
      return nested.map((message) => cmd._kind.fn(message));
    }
    case 'perform': {
      const result = await cmd._kind.task(new AbortController().signal);
      return [cmd._kind.toMsg(result)];
    }
    case 'attempt': {
      try {
        const result = await cmd._kind.task(new AbortController().signal);
        return [cmd._kind.toMsg({ ok: true, value: result })];
      } catch (error) {
        return [cmd._kind.toMsg({ ok: false, error })];
      }
    }
    default:
      return [];
  }
}

// ─── init ───────────────────────────────────────────────────────────────────

describe('form.init', () => {
  it('creates initial model with correct field order', () => {
    const f = createTestForm();
    const [model] = f.init();
    expect(model.fieldOrder).toEqual(['name', 'email']);
    expect(model.activeField).toBe(0);
    expect(model.submitted).toBe(false);
    expect(model.valid).toBe(true);
    expect(model.validating).toBe(false);
    expect(model.formErrors).toEqual([]);
    expect(model.submitCount).toBe(0);
  });

  it('creates default field states', () => {
    const f = createTestForm();
    const [model] = f.init();
    expect(model.fields.name).toEqual({
      value: '',
      errors: [],
      touched: false,
      dirty: false,
      validating: false,
    });
  });

  it('uses defaultValue from config', () => {
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Ada' },
      },
    });
    const [model] = f.init();
    expect(model.fields.name.value).toBe('Ada');
  });
});

// ─── field-change ───────────────────────────────────────────────────────────

describe('form.update field-change', () => {
  it('updates field value', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    expect(updated.fields.name.value).toBe('Ada');
  });

  it('marks field as dirty when value changes', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    expect(updated.fields.name.dirty).toBe(true);
  });

  it('does not mark dirty when value matches default', () => {
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Ada' },
      },
    });
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    expect(updated.fields.name.dirty).toBe(false);
  });

  it('validates on change when validateOn is "change"', () => {
    const f = form({
      fields: {
        name: { label: 'Name', validate: [required()], validateOn: 'change' },
      },
    });
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: '' }, model);
    expect(updated.fields.name.errors.length).toBeGreaterThan(0);
  });

  it('does not validate on change when validateOn is "submit"', () => {
    const f = form({
      fields: {
        name: { label: 'Name', validate: [required()], validateOn: 'submit' },
      },
    });
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: '' }, model);
    expect(updated.fields.name.errors).toEqual([]);
  });

  it('validates on change after submission', () => {
    const f = form({
      fields: {
        name: { label: 'Name', validate: [required()] },
      },
    });
    const [model] = f.init();
    // Submit first (marks submitted=true)
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.submitted).toBe(true);
    // Now change to empty — should validate because submitted
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: '' }, submitted);
    expect(updated.fields.name.errors.length).toBeGreaterThan(0);
  });

  it('ignores changes to disabled fields', () => {
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: 'locked', disabled: true },
      },
    });
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: 'hacked' }, model);
    expect(updated.fields.name.value).toBe('locked');
  });

  it('calls onChange callback', () => {
    const onChange = vi.fn();
    const f = form({
      fields: { name: { label: 'Name', defaultValue: '' } },
      onChange,
    });
    const [model] = f.init();
    f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    expect(onChange).toHaveBeenCalledWith({ name: 'Ada' });
  });

  it('applies dependent visibility during validation', () => {
    const f = form({
      fields: {
        mode: { label: 'Mode', defaultValue: 'basic' },
        secret: {
          label: 'Secret',
          defaultValue: '',
          validate: [required()],
          visibleWhen: (values: Record<string, unknown>) => values.mode === 'advanced',
        } as any,
      },
    } as any);

    const [model] = f.init();
    const [basicSubmit] = f.update({ type: 'form:submit' }, model);
    expect(basicSubmit.valid).toBe(true);
    expect(basicSubmit.fields.secret!.errors).toEqual([]);

    const [advanced] = f.update({ type: 'form:field-change', field: 'mode', value: 'advanced' }, model);
    const [advancedSubmit] = f.update({ type: 'form:submit' }, advanced);
    expect(advancedSubmit.valid).toBe(false);
    expect(advancedSubmit.fields.secret!.errors).toContain('This field is required');
  });

  it('skips dynamically disabled fields in focus navigation', () => {
    const f = form({
      fields: {
        mode: { label: 'Mode', defaultValue: 'readonly' },
        details: {
          label: 'Details',
          defaultValue: '',
          disabledWhen: (values: Record<string, unknown>) => values.mode === 'readonly',
        } as any,
        notes: { label: 'Notes', defaultValue: '' },
      },
    } as any);

    const [model] = f.init();
    const [updated] = f.update({ type: 'form:focus-next' }, model);
    expect(updated.activeField).toBe(2);
  });

  it('runs field-level side effects after a change', async () => {
    const f = form({
      fields: {
        name: {
          label: 'Name',
          defaultValue: '',
          onChange: (value: string) =>
            ({
              _tag: 'cmd',
              _kind: {
                kind: 'perform',
                task: async () => String(value).trim().toUpperCase(),
                toMsg: (normalized: string) => ({
                  type: 'form:set-field' as const,
                  field: 'slug',
                  value: normalized,
                }),
              },
            }) as any,
        } as any,
        slug: { label: 'Slug', defaultValue: '' },
      },
    } as any);

    const [model] = f.init();
    const [changed, cmd] = f.update({ type: 'form:field-change', field: 'name', value: ' Ada ' }, model);
    const messages = await collectCmdMessages(cmd);
    expect(messages).toHaveLength(1);

    const [withSideEffect] = f.update(messages[0], changed);
    expect(withSideEffect.fields.slug!.value).toBe('ADA');
  });

  it('triggers autosave and resets after autosave when configured', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: '' },
      },
      autosave: {
        onSave,
        resetOnSuccess: true,
      },
    } as any);

    const [model] = f.init();
    const [changed, cmd] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    const messages = await collectCmdMessages(cmd);
    expect(onSave).toHaveBeenCalledWith({ name: 'Ada' });

    const [resetModel] = f.update(messages[0], changed);
    expect(resetModel.fields.name!.value).toBe('');
    expect(resetModel.fields.name!.dirty).toBe(false);
  });

  it('records analytics events for field interactions', () => {
    const onFieldInteraction = vi.fn();
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: '' },
      },
      analytics: {
        onFieldInteraction,
      },
    } as any);

    const [model] = f.init();
    const [focused] = f.update({ type: 'form:field-focus', field: 'name' }, model);
    const [changed] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, focused);
    f.update({ type: 'form:field-blur', field: 'name' }, changed);

    expect(onFieldInteraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'focus', field: 'name' }));
    expect(onFieldInteraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'change', field: 'name', value: 'Ada' }));
    expect(onFieldInteraction).toHaveBeenCalledWith(expect.objectContaining({ type: 'blur', field: 'name' }));
  });

  it('applies validation message overrides', () => {
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: '', validate: [required()] },
      },
      validationMessages: {
        global: {
          'This field is required': 'Ce champ est obligatoire',
        },
      },
    } as any);

    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.fields.name!.errors).toEqual(['Ce champ est obligatoire']);
  });

  it('ignores stale async validation results when a newer value has already resolved', async () => {
    let resolveFirst!: (value: { valid: false; message: string }) => void;
    let resolveSecond!: (value: { valid: true }) => void;

    const rule = vi.fn(
      (value: string) =>
        new Promise<any>((resolve) => {
          if (value === 'first') {
            resolveFirst = resolve;
          } else {
            resolveSecond = resolve;
          }
        }),
    );

    const f = form({
      fields: {
        name: {
          label: 'Name',
          defaultValue: '',
          asyncValidate: [rule],
        },
      },
    } as any);

    const [model] = f.init();
    const [firstModel, firstCmd] = f.update({ type: 'form:field-change', field: 'name', value: 'first' }, model);
    const [secondModel, secondCmd] = f.update({ type: 'form:field-change', field: 'name', value: 'second' }, firstModel);

    const pendingFreshMessage = collectCmdMessages(secondCmd);
    resolveSecond({ valid: true });
    const [freshMessage] = await pendingFreshMessage;
    const [afterFresh] = f.update(freshMessage, secondModel);
    expect(afterFresh.fields.name!.errors).toEqual([]);

    const pendingStaleMessage = collectCmdMessages(firstCmd);
    resolveFirst({ valid: false, message: 'First value is invalid' });
    const [staleMessage] = await pendingStaleMessage;
    const [afterStale] = f.update(staleMessage, afterFresh);
    expect(afterStale.fields.name!.errors).toEqual([]);
  });
});

// ─── field-blur ─────────────────────────────────────────────────────────────

describe('form.update field-blur', () => {
  it('marks field as touched', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-blur', field: 'name' }, model);
    expect(updated.fields.name.touched).toBe(true);
  });

  it('validates on blur when validateOn is "blur"', () => {
    const f = form({
      fields: {
        name: { label: 'Name', validate: [required()], validateOn: 'blur' },
      },
    });
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-blur', field: 'name' }, model);
    expect(updated.fields.name.errors.length).toBeGreaterThan(0);
  });
});

// ─── focus navigation ───────────────────────────────────────────────────────

describe('form.update focus navigation', () => {
  it('moves to next field on focus-next', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:focus-next' }, model);
    expect(updated.activeField).toBe(1);
  });

  it('moves to prev field on focus-prev', () => {
    const f = createTestForm();
    const [model] = f.init();
    // Move to field 1 first
    const [at1] = f.update({ type: 'form:focus-next' }, model);
    const [updated] = f.update({ type: 'form:focus-prev' }, at1);
    expect(updated.activeField).toBe(0);
  });

  it('skips disabled fields on focus-next', () => {
    const f = form({
      fields: {
        a: { label: 'A', defaultValue: '' },
        b: { label: 'B', defaultValue: '', disabled: true },
        c: { label: 'C', defaultValue: '' },
      },
    });
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:focus-next' }, model);
    expect(updated.activeField).toBe(2); // Skipped 1 (disabled)
  });

  it('wraps around on focus-next past last field', () => {
    const f = form({
      fields: {
        a: { label: 'A', defaultValue: '' },
        b: { label: 'B', defaultValue: '' },
      },
    });
    const [model] = f.init();
    const [at1] = f.update({ type: 'form:focus-next' }, model);
    const [wrapped] = f.update({ type: 'form:focus-next' }, at1);
    expect(wrapped.activeField).toBe(0);
  });

  it('sets activeField on field-focus', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-focus', field: 'email' }, model);
    expect(updated.activeField).toBe(1);
  });
});

// ─── submit ─────────────────────────────────────────────────────────────────

describe('form.update submit', () => {
  it('marks all fields as touched', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.fields.name.touched).toBe(true);
    expect(submitted.fields.email.touched).toBe(true);
  });

  it('marks submitted and increments submitCount', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.submitted).toBe(true);
    expect(submitted.submitCount).toBe(1);
  });

  it('validates all fields on submit', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.fields.name.errors.length).toBeGreaterThan(0);
    expect(submitted.fields.email.errors.length).toBeGreaterThan(0);
    expect(submitted.valid).toBe(false);
  });

  it('calls onSubmit when valid', () => {
    const onSubmit = vi.fn();
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: 'Ada' },
      },
      onSubmit,
    });
    const [model] = f.init();
    f.update({ type: 'form:submit' }, model);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada' });
  });

  it('calls onError when invalid', () => {
    const onError = vi.fn();
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: '', validate: [required()] },
      },
      onError,
    });
    const [model] = f.init();
    f.update({ type: 'form:submit' }, model);
    expect(onError).toHaveBeenCalled();
    const errorMap = onError.mock.calls[0]![0];
    expect(errorMap.name).toBeDefined();
  });

  it('does not call onSubmit when invalid', () => {
    const onSubmit = vi.fn();
    const f = form({
      fields: {
        name: { label: 'Name', defaultValue: '', validate: [required()] },
      },
      onSubmit,
    });
    const [model] = f.init();
    f.update({ type: 'form:submit' }, model);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('applies cross-field validation', () => {
    const f = form({
      fields: {
        password: { label: 'Password', defaultValue: 'abc' },
        confirm: { label: 'Confirm', defaultValue: 'xyz' },
      },
      crossValidate: (values) => {
        const errors: Record<string, string[]> = {};
        if (values.password !== values.confirm) {
          errors.confirm = ['Passwords must match'];
        }
        return errors;
      },
    });
    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.valid).toBe(false);
    expect(submitted.fields.confirm.errors).toContain('Passwords must match');
  });

  it('applies resolver validation', () => {
    const f = form({
      fields: {
        age: { label: 'Age', defaultValue: 'not-a-number' },
      },
      resolver: (raw) => {
        const age = Number(raw.age);
        if (Number.isNaN(age)) {
          return { ok: false, errors: { age: ['Must be a number'] } };
        }
        return { ok: true, value: { age } };
      },
    });
    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.valid).toBe(false);
    expect(submitted.fields.age.errors).toContain('Must be a number');
  });

  it('handles resolver form-level errors (_root)', () => {
    const f = form({
      fields: {
        a: { label: 'A', defaultValue: 'x' },
      },
      resolver: () => ({
        ok: false,
        errors: { _root: ['Form-level error'] },
      }),
    });
    const [model] = f.init();
    const [submitted] = f.update({ type: 'form:submit' }, model);
    expect(submitted.formErrors).toContain('Form-level error');
    expect(submitted.valid).toBe(false);
  });
});

// ─── reset ──────────────────────────────────────────────────────────────────

describe('form.update reset', () => {
  it('resets to initial state', () => {
    const f = createTestForm();
    const [model] = f.init();
    // Make some changes
    const [changed] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    const [submitted] = f.update({ type: 'form:submit' }, changed);
    // Reset
    const [reset] = f.update({ type: 'form:reset' }, submitted);
    expect(reset.fields.name.value).toBe('');
    expect(reset.fields.name.touched).toBe(false);
    expect(reset.fields.name.dirty).toBe(false);
    expect(reset.submitted).toBe(false);
    expect(reset.submitCount).toBe(0);
  });
});

// ─── set-field ──────────────────────────────────────────────────────────────

describe('form.update set-field', () => {
  it('programmatically sets a field value', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:set-field', field: 'name', value: 'Ada' }, model);
    expect(updated.fields.name.value).toBe('Ada');
    expect(updated.fields.name.dirty).toBe(true);
  });
});

// ─── helper methods ─────────────────────────────────────────────────────────

describe('form helper methods', () => {
  it('getValues extracts current values', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [updated] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    expect(f.getValues(updated)).toEqual({ name: 'Ada', email: '' });
  });

  it('validate runs all field validation', () => {
    const f = createTestForm();
    const [model] = f.init();
    const validated = f.validate(model);
    expect(validated.fields.name.errors.length).toBeGreaterThan(0);
    expect(validated.valid).toBe(false);
  });

  it('reset returns initial model', () => {
    const f = createTestForm();
    const [model] = f.init();
    const [changed] = f.update({ type: 'form:field-change', field: 'name', value: 'Ada' }, model);
    const [resetModel] = f.reset(changed);
    expect(resetModel.fields.name.value).toBe('');
    expect(resetModel.fields.name.dirty).toBe(false);
  });

  it('setValue sets a specific field', () => {
    const f = createTestForm();
    const [model] = f.init();
    const updated = f.setValue(model, 'name', 'Ada');
    expect(updated.fields.name.value).toBe('Ada');
    expect(updated.fields.name.dirty).toBe(true);
  });
});

// ─── view ───────────────────────────────────────────────────────────────────

describe('form.view', () => {
  it('returns a VNode', () => {
    const f = createTestForm();
    const [model] = f.init();
    const vnode = f.view(model);
    expect(vnode).toBeDefined();
    expect(vnode.kind).toBe('column');
  });
});

// ─── subscriptions ──────────────────────────────────────────────────────────

describe('form.subscriptions', () => {
  it('returns subscriptions', () => {
    const f = createTestForm();
    const [model] = f.init();
    const subs = f.subscriptions!(model);
    expect(subs).toBeDefined();
    expect(subs._tag).toBe('sub');
  });
});
