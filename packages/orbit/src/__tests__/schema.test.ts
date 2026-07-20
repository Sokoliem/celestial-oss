import { describe, expect, it } from 'vitest';
import { ARG_SCHEMA_ZOD, createFieldTypeRegistry, createInMemoryRecentValueStore, validateArgSchema } from '../index.js';

describe('ARG_SCHEMA_ZOD', () => {
  it('accepts the baseline field kinds for schema-driven forms', () => {
    const result = ARG_SCHEMA_ZOD.safeParse({
      fields: [
        { kind: 'text', name: 'title', label: 'Title' },
        { kind: 'number', name: 'count', label: 'Count' },
        { kind: 'boolean', name: 'enabled', label: 'Enabled' },
        {
          kind: 'enum',
          name: 'mode',
          label: 'Mode',
          options: [
            { label: 'Basic', value: 'basic' },
            { label: 'Advanced', value: 'advanced' },
          ],
        },
        {
          kind: 'multiEnum',
          name: 'features',
          label: 'Features',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
        { kind: 'path', name: 'workspacePath', label: 'Workspace Path' },
        { kind: 'branch', name: 'branchName', label: 'Branch' },
        { kind: 'commit', name: 'commitSha', label: 'Commit' },
        { kind: 'date', name: 'releaseDate', label: 'Release Date' },
        { kind: 'duration', name: 'timeout', label: 'Timeout' },
        { kind: 'promptTemplate', name: 'prompt', label: 'Prompt' },
        { kind: 'json', name: 'payload', label: 'Payload' },
        {
          kind: 'custom',
          name: 'schedule',
          label: 'Schedule',
          typeKey: 'cron',
          options: { timezone: 'UTC' },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts the Phase-2 adapter-parity field kinds', () => {
    const result = ARG_SCHEMA_ZOD.safeParse({
      fields: [
        { kind: 'tags', name: 'tags', label: 'Tags' },
        { kind: 'rating', name: 'rating', label: 'Rating', maxValue: 10 },
        { kind: 'range', name: 'range', label: 'Range', min: 0, max: 100, step: 5 },
        {
          kind: 'segmented',
          name: 'tone',
          label: 'Tone',
          options: [
            { label: 'Calm', value: 'calm' },
            { label: 'Excited', value: 'excited' },
          ],
        },
        { kind: 'toggle', name: 'beta', label: 'Beta features' },
        { kind: 'color', name: 'accent', label: 'Accent' },
        { kind: 'file', name: 'attachment', label: 'Attachment' },
        {
          kind: 'radio',
          name: 'level',
          label: 'Level',
          options: [
            { label: 'Beginner', value: 'beginner' },
            { label: 'Advanced', value: 'advanced' },
          ],
        },
        {
          kind: 'multi-select',
          name: 'languages',
          label: 'Languages',
          options: [
            { label: 'English', value: 'en' },
            { label: 'Polish', value: 'pl' },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('validateArgSchema', () => {
  it('rejects duplicate field names and missing field references', () => {
    const result = validateArgSchema({
      fields: [
        { kind: 'text', name: 'mode', label: 'Mode' },
        {
          kind: 'text',
          name: 'mode',
          label: 'Duplicate Mode',
          visibleWhen: { field: 'missing', equals: 'advanced' },
        },
      ],
      validation: {
        rules: [{ kind: 'equal', left: 'mode', right: 'missing', message: 'Must match' }],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining(['Field names must be unique', 'Unknown field reference "missing"']));
    }
  });
});

describe('createFieldTypeRegistry', () => {
  it('registers, resolves, lists, and unregisters custom field descriptors', () => {
    const registry = createFieldTypeRegistry();
    const unregister = registry.register({
      typeKey: 'cron',
      version: '1.0.0',
      defaultValue: () => '0 * * * *',
      validate: (_field, value) => (typeof value === 'string' && value.split(' ').length === 5 ? [] : ['Cron must have five segments']),
      describeValue: (_field, value) => String(value),
    });

    expect(registry.resolve('cron')?.version).toBe('1.0.0');
    expect(registry.list().map((descriptor) => descriptor.typeKey)).toContain('cron');

    unregister();

    expect(registry.resolve('cron')).toBeNull();
    expect(registry.list()).toHaveLength(0);
  });
});

describe('createInMemoryRecentValueStore', () => {
  it('deduplicates recent values and respects the requested cap', () => {
    const store = createInMemoryRecentValueStore();

    store.record('branch', 'main');
    store.record('branch', 'release');
    store.record('branch', 'main');
    store.record('branch', 'feature');

    expect(store.list('branch', 3)).toEqual(['feature', 'main', 'release']);

    store.clear('branch');

    expect(store.list('branch', 3)).toEqual([]);
  });

  it('deduplicates object values regardless of key order', () => {
    const store = createInMemoryRecentValueStore();

    store.record('filters', {
      owner: 'me',
      status: 'open',
    });
    store.record('filters', {
      status: 'open',
      owner: 'me',
    });

    expect(store.list('filters', 5)).toEqual([
      {
        status: 'open',
        owner: 'me',
      },
    ]);
  });
});
