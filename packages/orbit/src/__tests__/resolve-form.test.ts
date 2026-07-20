import { describe, expect, it } from 'vitest';
import { createFieldTypeRegistry, createInMemoryRecentValueStore, resolveForm } from '../index.js';

describe('resolveForm', () => {
  it('applies defaults, respects visibility predicates, and resolves prompt templates', () => {
    const recentValues = createInMemoryRecentValueStore();
    recentValues.record('mode-history', 'advanced');
    recentValues.record('mode-history', 'basic');

    const result = resolveForm(
      {
        fields: [
          {
            kind: 'enum',
            name: 'mode',
            label: 'Mode',
            default: 'basic',
            recent: { storeKey: 'mode-history', maxItems: 2 },
            options: [
              { label: 'Basic', value: 'basic' },
              { label: 'Advanced', value: 'advanced' },
            ],
          },
          {
            kind: 'text',
            name: 'details',
            label: 'Details',
            visibleWhen: { field: 'mode', equals: 'advanced' },
          },
          {
            kind: 'promptTemplate',
            name: 'prompt',
            label: 'Prompt',
            default: 'Mode: {{mode}}',
          },
        ],
      },
      {},
      { recentValueStore: recentValues },
    );

    expect(result.values.mode).toBe('basic');
    expect(result.fields.mode.recentValues).toEqual(['basic', 'advanced']);
    expect(result.fields.details.visible).toBe(false);
    expect(result.template).toBe('Mode: {{mode}}');
    expect(result.resolvedTemplate).toBe('Mode: basic');
    expect(result.validation.valid).toBe(true);
  });

  it('reports field and form validation failures', () => {
    const result = resolveForm(
      {
        fields: [
          {
            kind: 'text',
            name: 'password',
            label: 'Password',
            required: true,
          },
          {
            kind: 'text',
            name: 'confirmPassword',
            label: 'Confirm Password',
            required: true,
          },
        ],
        validation: {
          rules: [
            {
              kind: 'equal',
              left: 'password',
              right: 'confirmPassword',
              message: 'Passwords must match',
            },
          ],
        },
      },
      {
        password: 'celestial',
        confirmPassword: 'nebula',
      },
    );

    expect(result.validation.valid).toBe(false);
    expect(result.validation.fieldErrors.confirmPassword).toEqual(['Passwords must match']);
  });

  it('parses json fields and validates custom field descriptors', () => {
    const registry = createFieldTypeRegistry();
    registry.register({
      typeKey: 'cron',
      version: '1.0.0',
      validate: (_field, value) => (typeof value === 'string' && value.split(' ').length === 5 ? [] : ['Cron must have five segments']),
    });

    const result = resolveForm(
      {
        fields: [
          {
            kind: 'json',
            name: 'payload',
            label: 'Payload',
            required: true,
          },
          {
            kind: 'custom',
            name: 'schedule',
            label: 'Schedule',
            typeKey: 'cron',
            options: {},
          },
        ],
      },
      {
        payload: '{"enabled":true,"count":2}',
        schedule: 'daily',
      },
      { fieldTypeRegistry: registry },
    );

    expect(result.values.payload).toEqual({ enabled: true, count: 2 });
    expect(result.validation.fieldErrors.schedule).toEqual(['Cron must have five segments']);
  });

  it('uses contextual git data when validating branch fields', () => {
    const result = resolveForm(
      {
        fields: [
          {
            kind: 'branch',
            name: 'branchName',
            label: 'Branch',
            required: true,
          },
        ],
      },
      {
        branchName: 'feature/schema-core',
      },
      {
        context: {
          git: {
            branches: ['main', 'release/1.0'],
          },
        },
      },
    );

    expect(result.validation.valid).toBe(false);
    expect(result.validation.fieldErrors.branchName).toEqual(['Branch is not available in the current context']);
  });

  it('reports invalid regex patterns as field errors instead of throwing', () => {
    const result = resolveForm(
      {
        fields: [
          {
            kind: 'text',
            name: 'title',
            label: 'Title',
            validation: {
              pattern: '[',
            },
          },
        ],
      },
      {
        title: 'release-notes',
      },
    );

    expect(result.validation.valid).toBe(false);
    expect(result.validation.fieldErrors.title).toEqual(['Field validation pattern is invalid']);
  });

  it('treats object equality as structural for visibility and equality rules', () => {
    const result = resolveForm(
      {
        fields: [
          {
            kind: 'json',
            name: 'payload',
            label: 'Payload',
          },
          {
            kind: 'json',
            name: 'expected',
            label: 'Expected',
          },
          {
            kind: 'text',
            name: 'details',
            label: 'Details',
            visibleWhen: {
              field: 'payload',
              equals: {
                owner: 'me',
                status: 'open',
              },
            },
          },
        ],
        validation: {
          rules: [
            {
              kind: 'equal',
              left: 'payload',
              right: 'expected',
              message: 'Payload must match',
            },
          ],
        },
      },
      {
        payload: {
          status: 'open',
          owner: 'me',
        },
        expected: {
          owner: 'me',
          status: 'open',
        },
      },
    );

    expect(result.fields.details.visible).toBe(true);
    expect(result.validation.valid).toBe(true);
  });

  it('requires every comparison in a visibility clause to match', () => {
    const result = resolveForm(
      {
        fields: [
          {
            kind: 'text',
            name: 'mode',
            label: 'Mode',
          },
          {
            kind: 'text',
            name: 'advancedNotes',
            label: 'Advanced Notes',
            visibleWhen: {
              field: 'mode',
              equals: 'advanced',
              in: ['basic'],
            },
          },
        ],
      },
      {
        mode: 'advanced',
      },
    );

    expect(result.fields.advancedNotes.visible).toBe(false);
  });
});
