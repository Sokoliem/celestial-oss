import { describe, expect, it, vi } from 'vitest';
import { schemaForm } from '../index.js';
import { createFieldTypeRegistry } from '../schema-registry.js';
import type { JsonValue } from '../schema-types.js';

type WritableCell<T> = {
  value(): T;
  write(next: T): void;
  subscribe(listener: (value: T) => void): () => void;
};

interface TestBinding<T> {
  readonly key: string;
  readonly _value?: T;
}

interface TestBindingScope {
  readonly signals: { readonly signals: Record<string, WritableCell<unknown>> };
}

const binding = {
  signal<T>(key: string) {
    return { build: (): TestBinding<T> => ({ key }) };
  },
};

function evaluate<T>(descriptor: TestBinding<T>, scope: TestBindingScope) {
  const cell = scope.signals.signals[descriptor.key] as WritableCell<T>;
  return { value: () => cell.value(), dispose: () => undefined };
}

function write<T>(descriptor: TestBinding<T>, scope: TestBindingScope, value: T): void {
  (scope.signals.signals[descriptor.key] as WritableCell<T>).write(value);
}

function createWritableCell<T>(initial: T): WritableCell<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    value() {
      return current;
    },
    write(next) {
      current = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function collectText(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];

  const vnode = node as {
    kind?: string;
    content?: string;
    children?: unknown[];
    child?: unknown;
    fallback?: unknown;
    render?: (() => unknown) | ((context?: unknown) => unknown);
  };

  switch (vnode.kind) {
    case 'text':
      return typeof vnode.content === 'string' ? [vnode.content] : [];
    case 'row':
    case 'column':
    case 'box':
    case 'tabGroup':
      return (vnode.children ?? []).flatMap((child) => collectText(child));
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      return vnode.child ? collectText(vnode.child) : [];
    case 'component':
    case 'memo':
      return typeof vnode.render === 'function' ? collectText(vnode.render()) : [];
    case 'suspense':
      return [...collectText(vnode.child), ...collectText(vnode.fallback)];
    default:
      return [];
  }
}

function findNode(node: unknown, predicate: (candidate: { kind?: string; children?: unknown[]; content?: string }) => boolean): unknown {
  if (!node || typeof node !== 'object') return null;

  const vnode = node as {
    kind?: string;
    children?: unknown[];
    child?: unknown;
    fallback?: unknown;
    render?: (() => unknown) | ((context?: unknown) => unknown);
    content?: string;
  };

  if (predicate(vnode)) {
    return node;
  }

  for (const child of vnode.children ?? []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }

  if (vnode.child) {
    const match = findNode(vnode.child, predicate);
    if (match) return match;
  }

  if (vnode.fallback) {
    const match = findNode(vnode.fallback, predicate);
    if (match) return match;
  }

  if (typeof vnode.render === 'function') {
    const rendered = vnode.render();
    const match = findNode(rendered, predicate);
    if (match) return match;
  }

  return null;
}

describe('schemaForm', () => {
  it('renders schema sections and keeps the resolved preview live', () => {
    const onChange = vi.fn();
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'text',
            name: 'title',
            label: 'Title',
            default: 'Launch plan',
          },
          {
            kind: 'text',
            name: 'audience',
            label: 'Audience',
            default: 'engineers',
          },
          {
            kind: 'promptTemplate',
            name: 'prompt',
            label: 'Prompt',
            default: 'Ship {{title}} for {{audience}}',
          },
        ],
        layout: {
          sections: [
            {
              title: 'General',
              fields: ['title', 'audience', 'prompt'],
            },
          ],
        },
      },
      value: {},
      onChange,
    });

    let [model] = form.init();
    const initialText = collectText(form.view(model)).join('\n');

    expect(initialText).toContain('General');
    expect(initialText).toContain('Title');
    expect(initialText).toContain('Preview');
    expect(form.getResolved(model).resolvedTemplate).toBe('Ship Launch plan for engineers');

    const previewRow = findNode(
      form.view(model),
      (candidate) => candidate.kind === 'row' && collectText(candidate).join('') === 'Ship Launch plan for engineers',
    ) as {
      children?: unknown[];
    } | null;
    expect(previewRow?.children).toHaveLength(4);

    [model] = form.update(
      {
        type: 'schema-form:set-field',
        field: 'title',
        value: 'Launch plan!',
      },
      model,
    );

    expect(onChange).toHaveBeenLastCalledWith({
      audience: 'engineers',
      prompt: 'Ship {{title}} for {{audience}}',
      title: 'Launch plan!',
    });
    expect(form.getResolved(model).resolvedTemplate).toBe('Ship Launch plan! for engineers');
    const updatedPreviewRow = findNode(
      form.view(model),
      (candidate) => candidate.kind === 'row' && collectText(candidate).join('') === 'Ship Launch plan! for engineers',
    ) as {
      children?: unknown[];
    } | null;
    expect(updatedPreviewRow?.children).toHaveLength(4);
  });

  it('submits resolved values when the schema is valid', () => {
    const onSubmit = vi.fn();
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'text',
            name: 'branch',
            label: 'Branch',
            required: true,
          },
        ],
      },
      value: {
        branch: 'release/v2',
      },
      onChange: vi.fn(),
      onSubmit,
    });

    const [model] = form.init();
    const [submitted] = form.update({ type: 'schema-form:submit' }, model);

    expect(submitted.submitted).toBe(true);
    expect(submitted.validation.valid).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith({ branch: 'release/v2' });
  });

  it('tracks validation errors and skips locked fields during navigation', () => {
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'text',
            name: 'title',
            label: 'Title',
            required: true,
          },
          {
            kind: 'text',
            name: 'slug',
            label: 'Slug',
          },
          {
            kind: 'text',
            name: 'details',
            label: 'Details',
            visibleWhen: { field: 'title', equals: 'ready' },
          },
        ],
      },
      value: {},
      locked: ['slug'],
      onChange: vi.fn(),
    });

    let [model] = form.init();
    expect(model.activeField).toBe('title');

    [model] = form.update({ type: 'schema-form:focus-next' }, model);
    expect(model.activeField).toBe('title');

    [model] = form.update({ type: 'schema-form:submit' }, model);
    expect(model.validation.valid).toBe(false);
    expect(model.validation.fieldErrors.title).toEqual(['This field is required']);
  });

  it('routes focus cycling through the nexus focus stack', () => {
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'text',
            name: 'title',
            label: 'Title',
          },
          {
            kind: 'text',
            name: 'details',
            label: 'Details',
          },
        ],
      },
      value: {},
      onChange: vi.fn(),
    });

    let [model] = form.init();
    expect(model.activeField).toBe('title');
    expect(model.focusStack.layers[0]?.activeFocusId).toBe('title');

    [model] = form.update({ type: 'schema-form:focus-next' }, model);
    expect(model.activeField).toBe('details');
    expect(model.focusStack.layers[0]?.activeFocusId).toBe('details');

    [model] = form.update({ type: 'schema-form:focus-prev' }, model);
    expect(model.activeField).toBe('title');
    expect(model.focusStack.layers[0]?.activeFocusId).toBe('title');
  });

  it('bridges writable Flux bindings through schema-form changes', () => {
    const mode = createWritableCell('buffered');
    const scope = {
      signals: {
        signals: { mode },
        streams: {},
      },
      props: {},
      context: new Map<string, unknown>(),
    };
    const modeBinding = binding.signal<string>('mode').build();
    const modeHandle = evaluate(modeBinding, scope);
    const onChange = vi.fn((next: Record<string, JsonValue>) => {
      write(modeBinding, scope, next.mode as string);
    });
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'text',
            name: 'mode',
            label: 'Mode',
            required: true,
          },
        ],
      },
      value: {
        mode: modeHandle.value(),
      },
      onChange,
    });

    let [model] = form.init();
    expect(form.getValues(model).mode).toBe('buffered');

    [model] = form.update({ type: 'schema-form:set-field', field: 'mode', value: 'sync' }, model);

    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'sync',
    });
    expect(mode.value()).toBe('sync');
    modeHandle.dispose();
  });

  it('supports multi-enum fields and custom field registry rendering hooks', () => {
    const registry = createFieldTypeRegistry([
      {
        typeKey: 'cron',
        version: '1.0.0',
        describeValue: (_field, value) => `cron:${String(value)}`,
        renderInput: (_field, value, _onChange, _context) => ({
          kind: 'text',
          content: `Custom ${String(value)}`,
        }),
      },
    ]);

    const onChange = vi.fn();
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'multiEnum',
            name: 'targets',
            label: 'Targets',
            options: [
              { label: 'Alpha', value: 'alpha' },
              { label: 'Beta', value: 'beta' },
            ],
          },
          {
            kind: 'custom',
            name: 'schedule',
            label: 'Schedule',
            typeKey: 'cron',
            options: {},
            default: '0 * * * *',
          },
        ],
      },
      value: {},
      onChange,
      fieldTypeRegistry: registry,
    });

    let [model] = form.init();
    const initialText = collectText(form.view(model)).join('\n');
    expect(initialText).toContain('Custom 0 * * * *');

    [model] = form.update(
      {
        type: 'schema-form:field-msg',
        field: 'targets',
        msg: { type: 'toggle' },
      },
      model,
    );

    expect(onChange).toHaveBeenLastCalledWith({
      schedule: '0 * * * *',
      targets: ['alpha'],
    });
    expect(form.getValues(model)).toEqual({
      schedule: '0 * * * *',
      targets: ['alpha'],
    } satisfies Record<string, JsonValue>);
  });

  it('keeps transient field state when unrelated values change', () => {
    const form = schemaForm({
      schema: {
        fields: [
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
            kind: 'text',
            name: 'title',
            label: 'Title',
            default: 'Launch plan',
          },
        ],
      },
      value: {},
      onChange: vi.fn(),
    });

    let [model] = form.init();
    [model] = form.update(
      {
        type: 'schema-form:field-msg',
        field: 'mode',
        msg: { type: 'down' },
      },
      model,
    );

    expect((model.fieldModels.mode as { highlighted: number }).highlighted).toBe(1);

    [model] = form.update(
      {
        type: 'schema-form:set-field',
        field: 'title',
        value: 'Launch checklist',
      },
      model,
    );

    expect((model.fieldModels.mode as { highlighted: number }).highlighted).toBe(1);
  });

  it('updates date fields from interactive field messages', () => {
    const onChange = vi.fn();
    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'date',
            name: 'releaseDate',
            label: 'Release Date',
          },
        ],
      },
      value: {
        releaseDate: '2026-04-20',
      },
      onChange,
    });

    let [model] = form.init();
    [model] = form.update(
      {
        type: 'schema-form:field-msg',
        field: 'releaseDate',
        msg: { type: 'cursor-right' },
      },
      model,
    );
    [model] = form.update(
      {
        type: 'schema-form:field-msg',
        field: 'releaseDate',
        msg: { type: 'select' },
      },
      model,
    );

    expect(onChange).toHaveBeenLastCalledWith({
      releaseDate: '2026-04-21',
    });
    expect(form.getValues(model)).toEqual({
      releaseDate: '2026-04-21',
    } satisfies Record<string, JsonValue>);
  });

  it('emits changes through custom field render callbacks', () => {
    let changeSchedule: ((next: JsonValue) => void) | null = null;
    const onChange = vi.fn();
    const registry = createFieldTypeRegistry([
      {
        typeKey: 'cron',
        version: '1.0.0',
        renderInput: (_field, value, onFieldChange) => {
          changeSchedule = onFieldChange;
          return {
            kind: 'text',
            content: `Schedule ${String(value)}`,
          };
        },
      },
    ]);

    const form = schemaForm({
      schema: {
        fields: [
          {
            kind: 'custom',
            name: 'schedule',
            label: 'Schedule',
            typeKey: 'cron',
            options: {},
            default: '0 * * * *',
          },
        ],
      },
      value: {},
      onChange,
      fieldTypeRegistry: registry,
    });

    const [model] = form.init();
    form.view(model);

    expect(changeSchedule).not.toBeNull();
    changeSchedule?.('15 * * * *');

    expect(onChange).toHaveBeenCalledWith({
      schedule: '15 * * * *',
    });
  });
});
