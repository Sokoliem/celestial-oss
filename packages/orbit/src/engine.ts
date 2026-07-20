import { style } from '@celestial/corona';
import type { Msg, VNode } from '@celestial/nebula';
import { Cmd, column, empty, focus, Sub, text } from '@celestial/nebula';
import { formField } from '@celestial/ui';
import { type FormFieldTypeRegistry, getDefaultFormFieldRegistry } from './field-registry.js';
import { tr } from './i18n.js';
import { emitLedgerEvent } from './ledger.js';
import { feedbackColor, formColor } from './theme.js';
import type {
  AutosaveConfig,
  DraftDescriptor,
  FieldConfig,
  FieldInteractionEvent,
  FieldMap,
  FieldState,
  FieldValue,
  FormConfig,
  FormDescriptor,
  FormModel,
  FormValues,
  ValidateOn,
  ValidationMessageOverride,
  ValidationMessagesConfig,
  ValidationRule,
} from './types.js';
import { runRules } from './validation.js';

export type FormMsg =
  | Msg<'form:field-change', { readonly field: string; readonly value: unknown }>
  | Msg<'form:field-blur', { readonly field: string }>
  | Msg<'form:field-focus', { readonly field: string }>
  | Msg<'form:focus-next'>
  | Msg<'form:focus-prev'>
  | Msg<'form:submit'>
  | Msg<'form:reset'>
  | Msg<'form:set-field', { readonly field: string; readonly value: unknown }>
  | Msg<'form:async-result', { readonly field: string; readonly errors: string[]; readonly token: number }>
  | Msg<'form:autosave-complete', { readonly reset: boolean }>
  | Msg<'form:autosave-error', { readonly message: string }>
  | Msg<'form:submit-resolve', { readonly ok: boolean; readonly message?: string }>
  | Msg<'form:submit-cancel'>;

function createFieldState<T>(config: FieldConfig<T>): FieldState<T> {
  return {
    value: (config.defaultValue ?? ('' as unknown)) as T,
    errors: [],
    touched: false,
    dirty: false,
    validating: false,
  };
}

function getValidateOn(fieldConfig: FieldConfig<any>, formConfig: { validateOn?: ValidateOn }): ValidateOn {
  return fieldConfig.validateOn ?? formConfig.validateOn ?? 'submit';
}

function extractValues<Fields extends FieldMap>(model: FormModel<Fields>): FormValues<Fields> {
  const values = {} as Record<string, unknown>;
  for (const key of model.fieldOrder) {
    values[key] = model.fields[key].value;
  }
  return values as FormValues<Fields>;
}

function resolveMessageOverride(override: ValidationMessageOverride | undefined, field: string, message: string, values: Record<string, unknown>): string {
  if (!override) return message;
  return typeof override === 'function' ? override({ field, message, values }) : override;
}

function applyMessageOverrides(messages: string[], field: string, values: Record<string, unknown>, overrides?: ValidationMessagesConfig): string[] {
  if (messages.length === 0 || !overrides) return messages;

  return messages.map((message) => {
    const fieldOverride = overrides.fields?.[field]?.[message];
    if (fieldOverride) {
      return resolveMessageOverride(fieldOverride, field, message, values);
    }

    return resolveMessageOverride(overrides.global?.[message], field, message, values);
  });
}

function withFieldValidationMessages(
  overrides: ValidationMessagesConfig | undefined,
  field: string,
  fieldConfig: FieldConfig<any>,
): ValidationMessagesConfig | undefined {
  if (!fieldConfig.validationMessages) return overrides;

  return {
    global: overrides?.global,
    fields: {
      ...(overrides?.fields ?? {}),
      [field]: {
        ...((overrides?.fields?.[field] as Record<string, ValidationMessageOverride> | undefined) ?? {}),
        ...(fieldConfig.validationMessages as Record<string, ValidationMessageOverride>),
      },
    },
  };
}

function isFieldVisible(config: FieldConfig<any>, values: Record<string, unknown>): boolean {
  return config.visibleWhen ? config.visibleWhen(values) : true;
}

function isFieldDisabled(config: FieldConfig<any>, values: Record<string, unknown>): boolean {
  return Boolean(config.disabled || (config.disabledWhen ? config.disabledWhen(values) : false));
}

function isFieldInteractive(config: FieldConfig<any>, values: Record<string, unknown>): boolean {
  return isFieldVisible(config, values) && !isFieldDisabled(config, values);
}

function getAnalyticsHandler<Fields extends FieldMap>(config: FormConfig<Fields, any>): ((event: FieldInteractionEvent) => void) | undefined {
  return config.analytics?.onFieldInteraction ?? config.onFieldInteraction;
}

function emitFieldInteraction<Fields extends FieldMap>(
  config: FormConfig<Fields, any>,
  model: FormModel<Fields>,
  event: Omit<FieldInteractionEvent, 'values'>,
): void {
  const handler = getAnalyticsHandler(config);
  if (!handler) return;
  handler({ ...event, values: extractValues(model) as Record<string, unknown> });
}

function validateField(field: string, fieldConfig: FieldConfig<any>, values: Record<string, unknown>, overrides?: ValidationMessagesConfig): string[] {
  if (!isFieldInteractive(fieldConfig, values)) return [];
  if (!fieldConfig.validate || fieldConfig.validate.length === 0) return [];
  const errors = runRules(fieldConfig.validate as ValidationRule<unknown>[], values[field]);
  return applyMessageOverrides(errors, field, values, withFieldValidationMessages(overrides, field, fieldConfig));
}

function computeValid<Fields extends FieldMap>(model: FormModel<Fields>, fieldConfigs?: Fields): boolean {
  const values = extractValues(model) as Record<string, unknown>;
  for (const key of model.fieldOrder) {
    if (fieldConfigs) {
      const fieldConfig = fieldConfigs[key] as FieldConfig<any>;
      if (!isFieldInteractive(fieldConfig, values)) continue;
    }
    if (model.fields[key].errors.length > 0) return false;
  }
  return model.formErrors.length === 0;
}

function hasAnyValidating<Fields extends FieldMap>(model: FormModel<Fields>): boolean {
  return model.fieldOrder.some((key) => model.fields[key].validating);
}

function getNextEnabledField<Fields extends FieldMap>(model: FormModel<Fields>, fieldConfigs: Fields, direction: 1 | -1): number {
  const len = model.fieldOrder.length;
  let idx = model.activeField + direction;
  const values = extractValues(model) as Record<string, unknown>;

  for (let i = 0; i < len; i++) {
    if (idx >= len) idx = 0;
    if (idx < 0) idx = len - 1;

    const key = model.fieldOrder[idx]!;
    const config = fieldConfigs[key] as FieldConfig<any>;
    if (isFieldInteractive(config, values)) return idx;
    idx += direction;
  }

  return model.activeField;
}

function getFirstActiveField<Fields extends FieldMap>(fieldOrder: (keyof Fields & string)[], fields: Fields, values: Record<string, unknown>): number {
  const index = fieldOrder.findIndex((key) => isFieldInteractive(fields[key] as FieldConfig<any>, values));
  return index >= 0 ? index : 0;
}

function mergeCrossErrors<Fields extends FieldMap>(
  model: FormModel<Fields>,
  fieldConfigs: Fields,
  errors: Record<string, string[]>,
  overrides?: ValidationMessagesConfig,
): FormModel<Fields> {
  const fields = { ...model.fields };
  const values = extractValues(model) as Record<string, unknown>;

  for (const [field, messages] of Object.entries(errors)) {
    if (!(field in fields)) continue;
    const state = fields[field as keyof typeof fields] as FieldState;
    const fieldConfig = fieldConfigs[field as keyof Fields & string] as FieldConfig<any>;
    (fields as Record<string, FieldState>)[field] = {
      ...state,
      errors: [...state.errors, ...applyMessageOverrides(messages, field, values, withFieldValidationMessages(overrides, field, fieldConfig))],
    };
  }

  return { ...model, fields };
}

function mergeResolverErrors<Fields extends FieldMap>(
  model: FormModel<Fields>,
  fieldConfigs: Fields,
  errors: Record<string, string[]>,
  overrides?: ValidationMessagesConfig,
): FormModel<Fields> {
  const fields = { ...model.fields };
  const values = extractValues(model) as Record<string, unknown>;
  const formErrors: string[] = [];

  for (const [field, messages] of Object.entries(errors)) {
    if (field === '_root') {
      formErrors.push(...applyMessageOverrides(messages, '_root', values, overrides));
      continue;
    }

    if (!(field in fields)) continue;
    const state = fields[field as keyof typeof fields] as FieldState;
    const fieldConfig = fieldConfigs[field as keyof Fields & string] as FieldConfig<any>;
    (fields as Record<string, FieldState>)[field] = {
      ...state,
      errors: [...state.errors, ...applyMessageOverrides(messages, field, values, withFieldValidationMessages(overrides, field, fieldConfig))],
    };
  }

  return { ...model, fields, formErrors };
}

function validateAllFields<Fields extends FieldMap>(model: FormModel<Fields>, config: FormConfig<Fields, any>): FormModel<Fields> {
  const values = extractValues(model) as Record<string, unknown>;
  const newFields = { ...model.fields };

  for (const key of model.fieldOrder) {
    const fieldConfig = config.fields[key] as FieldConfig<any>;
    const currentState = model.fields[key];
    newFields[key] = {
      ...currentState,
      errors: validateField(key, fieldConfig, values, config.validationMessages),
    } as FormModel<Fields>['fields'][typeof key];
  }

  const newModel = { ...model, fields: newFields, formErrors: [] };
  newModel.valid = computeValid(newModel, config.fields);
  return newModel;
}

function createAutosaveCmd<Fields extends FieldMap>(autosave: AutosaveConfig<Fields> | undefined, values: FormValues<Fields>): Cmd<FormMsg> {
  if (!autosave) return Cmd.none();
  if (!autosave.onSave && !(autosave.storage && autosave.key)) return Cmd.none();

  return Cmd.attempt(
    async (_signal) => {
      const serialized = autosave.serialize ? autosave.serialize(values) : JSON.stringify(values);

      if (autosave.storage && autosave.key) {
        await autosave.storage.save(autosave.key, serialized);
      }

      if (autosave.onSave) {
        await autosave.onSave(values);
      }

      return { reset: Boolean(autosave.resetOnSuccess) };
    },
    (result) =>
      result.ok
        ? { type: 'form:autosave-complete' as const, reset: result.value.reset }
        : { type: 'form:autosave-error' as const, message: result.error instanceof Error ? result.error.message : 'Autosave failed' },
  );
}

function createResetClearCmd<Fields extends FieldMap>(autosave: AutosaveConfig<Fields> | undefined): Cmd<FormMsg> {
  if (!autosave?.storage?.clear || !autosave.key) return Cmd.none();

  return Cmd.attempt(
    async (_signal) => {
      await autosave.storage!.clear!(autosave.key!);
    },
    () => ({ type: 'form:autosave-complete' as const, reset: false }),
  );
}

export function form<Fields extends FieldMap, T = FormValues<Fields>>(config: FormConfig<Fields, T>): FormDescriptor<Fields, FormMsg> {
  const fieldOrder = Object.keys(config.fields) as (keyof Fields & string)[];
  const focusGroup = config.focusGroup ?? 'orbit-form';
  const fieldTypeRegistry: FormFieldTypeRegistry = config.fieldTypeRegistry ?? getDefaultFormFieldRegistry();
  const ledgerFormId = config.ledgerFormId ?? focusGroup;
  const emit = (kind: string, payload: Record<string, unknown>): void => {
    if (!config.ledger) return;
    void emitLedgerEvent(config.ledger, {
      kind,
      payload: { formId: ledgerFormId, ...payload },
    });
  };

  function buildInitialValues(): Record<string, unknown> {
    const initial: Record<string, unknown> = {};
    for (const key of fieldOrder) {
      const fieldConfig = config.fields[key] as FieldConfig<any>;
      initial[key] = fieldConfig.defaultValue ?? '';
    }
    return initial;
  }

  function initModel(): FormModel<Fields> {
    const fields = {} as FormModel<Fields>['fields'];
    for (const key of fieldOrder) {
      const fieldConfig = config.fields[key] as FieldConfig<any>;
      (fields as Record<string, FieldState>)[key] = createFieldState(fieldConfig);
    }

    let model: FormModel<Fields> = {
      fields,
      activeField: 0,
      fieldOrder: [...fieldOrder],
      submitted: false,
      valid: true,
      validating: false,
      formErrors: [],
      submitCount: 0,
      initialValues: buildInitialValues(),
      submitState: 'idle',
    };

    if (config.autosave?.storage && config.autosave.key && config.autosave.storage.load) {
      const loaded = config.autosave.storage.load(config.autosave.key);
      if (typeof loaded === 'string' && loaded.length > 0) {
        try {
          const parsed = config.autosave.deserialize ? config.autosave.deserialize(loaded) : (JSON.parse(loaded) as Partial<FormValues<Fields>>);

          const nextFields = { ...model.fields };
          for (const key of fieldOrder) {
            if (Object.hasOwn(parsed, key)) {
              const fieldConfig = config.fields[key] as FieldConfig<any>;
              const value = (parsed as Record<string, unknown>)[key];
              nextFields[key] = {
                ...nextFields[key],
                value,
                dirty: value !== (fieldConfig.defaultValue ?? ''),
              } as FormModel<Fields>['fields'][typeof key];
            }
          }

          model = { ...model, fields: nextFields };
        } catch {
          // Ignore malformed persisted state.
        }
      }
    }

    const values = extractValues(model) as Record<string, unknown>;
    model.activeField = getFirstActiveField(fieldOrder, config.fields, values);
    return model;
  }

  return {
    init(): [FormModel<Fields>, Cmd<FormMsg>] {
      return [initModel(), Cmd.pushFocusGroup(focusGroup)];
    },

    update(msg: FormMsg, model: FormModel<Fields>): [FormModel<Fields>, Cmd<FormMsg>] {
      switch (msg.type) {
        case 'form:field-change': {
          const key = msg.field as keyof Fields & string;
          const fieldConfig = config.fields[key] as FieldConfig<any> | undefined;
          const fieldState = model.fields[key];
          if (!fieldConfig || !fieldState) return [model, Cmd.none()];

          const currentValues = extractValues(model) as Record<string, unknown>;
          if (!isFieldInteractive(fieldConfig, currentValues)) return [model, Cmd.none()];

          const initialValue = model.initialValues[key] ?? fieldConfig.defaultValue ?? '';
          let nextField: FieldState = {
            ...fieldState,
            value: msg.value,
            dirty: !valuesEqual(msg.value, initialValue),
            validating: false,
            errors: [],
          };

          let nextModel: FormModel<Fields> = {
            ...model,
            fields: { ...model.fields, [key]: nextField } as FormModel<Fields>['fields'],
            formErrors: [],
          };

          const nextValues = extractValues(nextModel) as Record<string, unknown>;
          const validateOn = getValidateOn(fieldConfig, config);
          if (validateOn === 'change' || model.submitted) {
            nextField = {
              ...nextField,
              errors: validateField(key, fieldConfig, nextValues, config.validationMessages),
            };
            nextModel = {
              ...nextModel,
              fields: { ...nextModel.fields, [key]: nextField } as FormModel<Fields>['fields'],
            };
          }

          nextModel.valid = computeValid(nextModel, config.fields);

          config.onChange?.(extractValues(nextModel));
          emitFieldInteraction(config, nextModel, { type: 'change', field: key, value: msg.value });
          emit('form:field-changed', { field: key, value: msg.value });
          if (nextField.errors.length > 0) {
            emitFieldInteraction(config, nextModel, { type: 'error', field: key, value: msg.value, errors: nextField.errors });
            emit('form:validation-failed', { field: key, value: msg.value, errors: nextField.errors });
          }

          const commands: Cmd<FormMsg>[] = [];

          const sideEffect = fieldConfig.onChange?.(msg.value, nextValues);
          if (sideEffect) {
            commands.push(sideEffect as Cmd<FormMsg>);
          }

          const autosaveCmd = createAutosaveCmd(config.autosave, extractValues(nextModel));
          if (autosaveCmd._kind.kind !== 'none') {
            commands.push(autosaveCmd);
          }

          if (nextField.errors.length === 0 && fieldConfig.asyncValidate?.length) {
            const token = (fieldState.asyncToken ?? 0) + 1;
            const asyncRules = [...fieldConfig.asyncValidate];
            const asyncValue = msg.value;
            nextField = { ...nextField, validating: true, asyncToken: token };
            nextModel = {
              ...nextModel,
              fields: { ...nextModel.fields, [key]: nextField } as FormModel<Fields>['fields'],
            };
            nextModel.validating = true;

            commands.push(
              Cmd.perform(
                async (signal) => {
                  const errors: string[] = [];
                  for (const rule of asyncRules) {
                    if (signal.aborted) break;
                    const result = await rule(asyncValue, signal);
                    if (signal.aborted) break;
                    if (!result.valid) {
                      errors.push(result.message);
                    }
                  }
                  return { field: key, errors, token, aborted: signal.aborted };
                },
                (result) => ({
                  type: 'form:async-result' as const,
                  field: result.field,
                  errors: result.aborted ? [] : result.errors,
                  token: result.token,
                }),
              ),
            );
          } else {
            nextModel.validating = hasAnyValidating(nextModel);
          }

          return [nextModel, commands.length > 0 ? Cmd.batch(...commands) : Cmd.none()];
        }

        case 'form:field-blur': {
          const key = msg.field as keyof Fields & string;
          const fieldConfig = config.fields[key] as FieldConfig<any> | undefined;
          const fieldState = model.fields[key];
          if (!fieldConfig || !fieldState) return [model, Cmd.none()];

          const values = extractValues(model) as Record<string, unknown>;
          let nextField: FieldState = { ...fieldState, touched: true };

          const validateOn = getValidateOn(fieldConfig, config);
          if (isFieldInteractive(fieldConfig, values) && (validateOn === 'blur' || model.submitted)) {
            nextField = {
              ...nextField,
              errors: validateField(key, fieldConfig, values, config.validationMessages),
            };
          }

          const nextModel = {
            ...model,
            fields: { ...model.fields, [key]: nextField } as FormModel<Fields>['fields'],
          };
          nextModel.valid = computeValid(nextModel, config.fields);

          emitFieldInteraction(config, nextModel, { type: 'blur', field: key, value: nextField.value });
          if (nextField.errors.length > 0) {
            emitFieldInteraction(config, nextModel, { type: 'error', field: key, value: nextField.value, errors: nextField.errors });
          }

          return [nextModel, Cmd.none()];
        }

        case 'form:field-focus': {
          const index = fieldOrder.indexOf(msg.field as keyof Fields & string);
          if (index < 0) return [model, Cmd.none()];
          const nextModel = { ...model, activeField: index };
          emitFieldInteraction(config, nextModel, { type: 'focus', field: msg.field, value: model.fields[msg.field as keyof Fields & string]?.value });
          return [nextModel, Cmd.none()];
        }

        case 'form:focus-next':
          return [{ ...model, activeField: getNextEnabledField(model, config.fields, 1) }, Cmd.none()];

        case 'form:focus-prev':
          return [{ ...model, activeField: getNextEnabledField(model, config.fields, -1) }, Cmd.none()];

        case 'form:submit': {
          let nextModel: FormModel<Fields> = {
            ...model,
            submitted: true,
            submitCount: model.submitCount + 1,
            fields: { ...model.fields },
            formErrors: [],
          };

          for (const key of fieldOrder) {
            // Bump every async-validation token so any in-flight async rule
            // whose result lands AFTER this submit is discarded by the
            // `form:async-result` handler's token-match check. Without the
            // bump, a late `form:async-result` could overwrite the submit's
            // freshly-computed field errors and silently change the verdict.
            const currentState = nextModel.fields[key];
            nextModel.fields[key] = {
              ...currentState,
              touched: true,
              asyncToken: (currentState.asyncToken ?? 0) + 1,
              validating: false,
            } as FormModel<Fields>['fields'][typeof key];
          }
          nextModel.validating = false;

          nextModel = validateAllFields(nextModel, config);

          if (config.crossValidate) {
            nextModel = mergeCrossErrors(nextModel, config.fields, config.crossValidate(extractValues(nextModel)), config.validationMessages);
          }

          if (config.resolver) {
            const raw = extractValues(nextModel) as Record<string, unknown>;
            const result = config.resolver(raw);
            if (!result.ok) {
              nextModel = mergeResolverErrors(nextModel, config.fields, result.errors, config.validationMessages);
            }
          }

          nextModel.valid = computeValid(nextModel, config.fields);

          if (nextModel.valid) {
            const submittedValues = extractValues(nextModel);
            const onSubmitResult = config.onSubmit?.(submittedValues as unknown as T);
            emit('form:submitted', { values: submittedValues as unknown as Record<string, unknown> });

            if (onSubmitResult && typeof (onSubmitResult as Promise<unknown>).then === 'function') {
              // Async onSubmit: enter `submitting` and let the promise drive
              // the transition through a `form:submit-resolve` message.
              nextModel = { ...nextModel, submitState: 'submitting', submitError: undefined };
              const promiseCmd = Cmd.perform<FormMsg, { ok: boolean; message?: string }>(
                async (_signal) => {
                  try {
                    await onSubmitResult;
                    return { ok: true };
                  } catch (error) {
                    return { ok: false, message: error instanceof Error ? error.message : 'Submit failed' };
                  }
                },
                (result) => ({ type: 'form:submit-resolve' as const, ok: result.ok, message: result.message }),
              );
              return [nextModel, promiseCmd];
            }

            // Sync onSubmit (or none): collapse directly to succeeded.
            nextModel = { ...nextModel, submitState: 'succeeded', submitError: undefined };
          } else {
            const errorMap: Record<string, string[]> = {};
            for (const key of fieldOrder) {
              if (nextModel.fields[key].errors.length > 0) {
                errorMap[key] = nextModel.fields[key].errors;
                emitFieldInteraction(config, nextModel, {
                  type: 'error',
                  field: key,
                  value: nextModel.fields[key].value,
                  errors: nextModel.fields[key].errors,
                });
              }
            }
            if (nextModel.formErrors.length > 0) {
              errorMap._root = nextModel.formErrors;
            }
            if (Object.keys(errorMap).length > 0) {
              config.onError?.(errorMap);
              emit('form:validation-failed', { errors: errorMap });
            }
            nextModel = { ...nextModel, submitState: 'failed', submitError: 'Validation failed' };
          }

          return [nextModel, Cmd.none()];
        }

        case 'form:submit-resolve': {
          const nextModel: FormModel<Fields> = {
            ...model,
            submitState: msg.ok ? 'succeeded' : 'failed',
            submitError: msg.ok ? undefined : (msg.message ?? 'Submit failed'),
          };
          return [nextModel, Cmd.none()];
        }

        case 'form:submit-cancel': {
          if (model.submitState !== 'submitting') return [model, Cmd.none()];
          return [{ ...model, submitState: 'cancelled', submitError: undefined }, Cmd.none()];
        }

        case 'form:reset':
          return [initModel(), createResetClearCmd(config.autosave)];

        case 'form:set-field': {
          const key = msg.field as keyof Fields & string;
          const fieldState = model.fields[key];
          const fieldConfig = config.fields[key] as FieldConfig<any> | undefined;
          if (!fieldState || !fieldConfig) return [model, Cmd.none()];

          const initialValue = model.initialValues[key] ?? fieldConfig.defaultValue ?? '';
          const nextField: FieldState = {
            ...fieldState,
            value: msg.value,
            dirty: !valuesEqual(msg.value, initialValue),
          };

          const nextModel = {
            ...model,
            fields: { ...model.fields, [key]: nextField } as FormModel<Fields>['fields'],
          };
          nextModel.valid = computeValid(nextModel, config.fields);
          return [nextModel, Cmd.none()];
        }

        case 'form:async-result': {
          const key = msg.field as keyof Fields & string;
          const fieldState = model.fields[key];
          if (!fieldState || fieldState.asyncToken !== msg.token) {
            return [model, Cmd.none()];
          }

          const values = extractValues(model) as Record<string, unknown>;
          const fieldConfig = config.fields[key] as FieldConfig<any>;
          const errors = applyMessageOverrides(msg.errors, key, values, withFieldValidationMessages(config.validationMessages, key, fieldConfig));
          const nextField: FieldState = {
            ...fieldState,
            errors,
            validating: false,
          };

          const nextModel = {
            ...model,
            fields: { ...model.fields, [key]: nextField } as FormModel<Fields>['fields'],
          };
          nextModel.validating = hasAnyValidating(nextModel);
          nextModel.valid = computeValid(nextModel, config.fields);

          if (errors.length > 0) {
            emitFieldInteraction(config, nextModel, { type: 'error', field: key, value: nextField.value, errors });
          }

          return [nextModel, Cmd.none()];
        }

        case 'form:autosave-complete':
          emit('form:autosaved', { reset: msg.reset });
          return msg.reset ? [initModel(), Cmd.none()] : [model, Cmd.none()];

        case 'form:autosave-error':
          return [{ ...model, formErrors: [...model.formErrors, msg.message], valid: false }, Cmd.none()];

        default:
          return [model, Cmd.none()];
      }
    },

    view(model: FormModel<Fields>): VNode {
      const children: VNode[] = [];
      const values = extractValues(model) as Record<string, unknown>;
      let visibleIndex = 0;

      for (let i = 0; i < fieldOrder.length; i++) {
        const key = fieldOrder[i]!;
        const fieldConfig = config.fields[key] as FieldConfig<any>;
        const fieldState = model.fields[key];
        if (!isFieldVisible(fieldConfig, values)) continue;

        const isFocused = i === model.activeField;
        const isDisabled = isFieldDisabled(fieldConfig, values);
        let validationState: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle';

        if (fieldState.validating) {
          validationState = 'validating';
        } else if (fieldState.touched || model.submitted) {
          validationState = fieldState.errors.length > 0 ? 'invalid' : 'valid';
        }

        const displayValue =
          fieldState.value === '' || fieldState.value === undefined || fieldState.value === null ? (fieldConfig.placeholder ?? '') : String(fieldState.value);

        const valueStyle = isDisabled
          ? style({ dim: true })
          : fieldState.value === '' || fieldState.value === undefined || fieldState.value === null
            ? style({ dim: true })
            : style({});

        const fieldView = formField({
          label: fieldConfig.label,
          required: fieldConfig.validate?.some((rule) => {
            const result = (rule as any)('');
            return !result.valid && result.message?.includes('required');
          }),
          hint: fieldConfig.helpText,
          error: (fieldState.touched || model.submitted) && fieldState.errors.length > 0 ? fieldState.errors[0] : undefined,
          child: text(displayValue || ' ', valueStyle),
          focused: isFocused,
          disabled: isDisabled,
          validationState,
        });

        children.push(
          focus(`${focusGroup}:${key}`, fieldView, {
            focused: isFocused,
            group: focusGroup,
            tabIndex: visibleIndex,
          }),
        );

        visibleIndex += 1;
        if (visibleIndex > 0 && i < fieldOrder.length - 1) {
          children.push(empty(0, 0));
        }
      }

      if (model.formErrors.length > 0) {
        const errorStyle = style({ color: feedbackColor(config, 'danger') });
        for (const error of model.formErrors) {
          children.push(text(error, errorStyle));
        }
      }

      children.push(text(tr(config.messages, 'form.nav.hint', undefined, config.locale), style({ color: formColor(config, 'muted'), dim: true })));
      return column(...children);
    },

    subscriptions(_model: FormModel<Fields>): Sub<FormMsg> {
      return Sub.batch<FormMsg>(
        Sub.key('tab', { type: 'form:focus-next' }),
        Sub.keyWithModifiers('tab', { shift: true }, { type: 'form:focus-prev' }),
        Sub.key('enter', { type: 'form:submit' }),
        Sub.focus((focusedId: string | null) => {
          if (focusedId) {
            const prefix = `${focusGroup}:`;
            if (focusedId.startsWith(prefix)) {
              return { type: 'form:field-focus' as const, field: focusedId.slice(prefix.length) };
            }
          }

          return { type: 'form:field-focus' as const, field: '' };
        }),
      );
    },

    getValues(model: FormModel<Fields>): FormValues<Fields> {
      return extractValues(model);
    },

    validate(model: FormModel<Fields>): FormModel<Fields> {
      return validateAllFields(model, config);
    },

    reset(_model: FormModel<Fields>): [FormModel<Fields>, Cmd<FormMsg>] {
      return [initModel(), createResetClearCmd(config.autosave)];
    },

    setValue<K extends keyof Fields & string>(model: FormModel<Fields>, field: K, value: FieldValue<Fields[K]>): FormModel<Fields> {
      const fieldState = model.fields[field];
      const fieldConfig = config.fields[field] as FieldConfig<any> | undefined;
      if (!fieldState || !fieldConfig) return model;

      const initialValue = model.initialValues[field] ?? fieldConfig.defaultValue ?? '';
      const nextField: FieldState = {
        ...fieldState,
        value,
        dirty: !valuesEqual(value, initialValue),
      };

      const nextModel = {
        ...model,
        fields: { ...model.fields, [field]: nextField } as FormModel<Fields>['fields'],
      };
      nextModel.valid = computeValid(nextModel, config.fields);
      return nextModel;
    },

    getFieldTypeRegistry(): FormFieldTypeRegistry {
      return fieldTypeRegistry;
    },

    getDirtyFields(model: FormModel<Fields>): (keyof Fields & string)[] {
      const dirty: (keyof Fields & string)[] = [];
      for (const key of model.fieldOrder) {
        if (model.fields[key].dirty) dirty.push(key);
      }
      return dirty;
    },

    getChangedValues(model: FormModel<Fields>, baseline?: Partial<FormValues<Fields>>): Partial<FormValues<Fields>> {
      const reference = baseline ?? (model.initialValues as Partial<FormValues<Fields>>);
      const changed = {} as Record<string, unknown>;
      for (const key of model.fieldOrder) {
        const current = model.fields[key].value;
        const initial = (reference as Record<string, unknown>)[key];
        if (!valuesEqual(current, initial)) {
          changed[key] = current;
        }
      }
      return changed as Partial<FormValues<Fields>>;
    },

    resetField<K extends keyof Fields & string>(model: FormModel<Fields>, field: K): FormModel<Fields> {
      const fieldState = model.fields[field];
      if (!fieldState) return model;
      const initialValue = model.initialValues[field];
      const nextField: FieldState = {
        ...fieldState,
        value: initialValue,
        errors: [],
        touched: false,
        dirty: false,
        validating: false,
      };
      const nextModel = {
        ...model,
        fields: { ...model.fields, [field]: nextField } as FormModel<Fields>['fields'],
      };
      nextModel.valid = computeValid(nextModel, config.fields);
      return nextModel;
    },

    setInitialValues(model: FormModel<Fields>, values: Partial<FormValues<Fields>>): FormModel<Fields> {
      const nextInitial: Record<string, unknown> = { ...model.initialValues };
      const nextFields: Record<string, FieldState> = { ...model.fields };
      for (const key of model.fieldOrder) {
        if (Object.hasOwn(values, key)) {
          const provided = (values as Record<string, unknown>)[key];
          nextInitial[key] = provided;
          const state = nextFields[key];
          if (state) {
            nextFields[key] = {
              ...state,
              value: provided,
              dirty: false,
              touched: false,
            };
          }
        } else {
          const state = nextFields[key];
          if (state) {
            nextFields[key] = { ...state, dirty: !valuesEqual(state.value, nextInitial[key]) };
          }
        }
      }
      const nextModel: FormModel<Fields> = {
        ...model,
        initialValues: nextInitial,
        fields: nextFields as FormModel<Fields>['fields'],
      };
      nextModel.valid = computeValid(nextModel, config.fields);
      return nextModel;
    },

    drafts: {
      async list(): Promise<readonly DraftDescriptor[]> {
        const storage = config.autosave?.drafts;
        if (!storage) return [];
        return Promise.resolve(storage.list());
      },
      async load(name: string): Promise<Partial<FormValues<Fields>> | null> {
        const storage = config.autosave?.drafts;
        if (!storage) return null;
        return Promise.resolve(storage.load(name));
      },
      async save(name: string, model: FormModel<Fields>, meta?: { readonly label?: string }): Promise<void> {
        const storage = config.autosave?.drafts;
        if (!storage) return;
        const values = extractValues(model);
        await Promise.resolve(storage.save(name, values, meta));
      },
      async delete(name: string): Promise<void> {
        const storage = config.autosave?.drafts;
        if (!storage) return;
        await Promise.resolve(storage.delete(name));
      },
      async rename(oldName: string, newName: string): Promise<void> {
        const storage = config.autosave?.drafts;
        if (!storage) return;
        await Promise.resolve(storage.rename(oldName, newName));
      },
    },
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
  }
  return false;
}
