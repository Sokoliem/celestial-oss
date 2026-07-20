import { describe, expect, it } from 'vitest';
import { createFieldAdapter, extractValue, getAdapterForType, injectValue } from '../field-adapter.js';

// ─── createFieldAdapter ─────────────────────────────────────────────────────

describe('createFieldAdapter', () => {
  it('creates a text adapter by default', () => {
    const adapter = createFieldAdapter({ label: 'Name', defaultValue: '' });
    expect(adapter).toBeDefined();
    expect(adapter.type).toBe('text');
  });

  it('creates a text adapter for type "text"', () => {
    const adapter = createFieldAdapter({ label: 'Name', type: 'text', defaultValue: '' });
    expect(adapter.type).toBe('text');
  });

  it('creates a password adapter for type "password"', () => {
    const adapter = createFieldAdapter({ label: 'Pass', type: 'password', defaultValue: '' });
    expect(adapter.type).toBe('password');
  });

  it('creates a number adapter for type "number"', () => {
    const adapter = createFieldAdapter({ label: 'Age', type: 'number', defaultValue: 0 });
    expect(adapter.type).toBe('number');
  });

  it('creates a boolean adapter for type "boolean"', () => {
    const adapter = createFieldAdapter({ label: 'Agree', type: 'boolean', defaultValue: false });
    expect(adapter.type).toBe('boolean');
  });

  it('creates a select adapter for type "select"', () => {
    const adapter = createFieldAdapter({
      label: 'Color',
      type: 'select',
      options: ['red', 'green', 'blue'],
      defaultValue: '',
    });
    expect(adapter.type).toBe('select');
  });

  it('creates a textarea adapter for type "textarea"', () => {
    const adapter = createFieldAdapter({ label: 'Bio', type: 'textarea', defaultValue: '' });
    expect(adapter.type).toBe('textarea');
  });

  it('creates a slider adapter for type "slider"', () => {
    const adapter = createFieldAdapter({ label: 'Volume', type: 'slider', defaultValue: 50 });
    expect(adapter.type).toBe('slider');
  });

  it('creates an autocomplete adapter for type "autocomplete"', () => {
    const adapter = createFieldAdapter({
      label: 'City',
      type: 'autocomplete',
      options: ['New York', 'London', 'Tokyo'],
      defaultValue: '',
    });
    expect(adapter.type).toBe('autocomplete');
  });

  it('creates a date adapter for type "date"', () => {
    const adapter = createFieldAdapter({ label: 'DOB', type: 'date' });
    expect(adapter.type).toBe('date');
  });

  it('returns an init function that produces [model, cmd]', () => {
    const adapter = createFieldAdapter({ label: 'Name', defaultValue: '' });
    const [model, cmd] = adapter.init();
    expect(model).toBeDefined();
    expect(cmd).toBeDefined();
  });

  it('returns an update function', () => {
    const adapter = createFieldAdapter({ label: 'Name', defaultValue: '' });
    expect(typeof adapter.update).toBe('function');
  });

  it('returns a view function', () => {
    const adapter = createFieldAdapter({ label: 'Name', defaultValue: '' });
    expect(typeof adapter.view).toBe('function');
  });
});

// ─── getAdapterForType ──────────────────────────────────────────────────────

describe('getAdapterForType', () => {
  it('returns "textInput" for text type', () => {
    expect(getAdapterForType('text')).toBe('textInput');
  });

  it('returns "textInput" for password type', () => {
    expect(getAdapterForType('password')).toBe('textInput');
  });

  it('returns "numberInput" for number type', () => {
    expect(getAdapterForType('number')).toBe('numberInput');
  });

  it('returns "checkbox" for boolean type', () => {
    expect(getAdapterForType('boolean')).toBe('checkbox');
  });

  it('returns "select" for select type', () => {
    expect(getAdapterForType('select')).toBe('select');
  });

  it('returns "textarea" for textarea type', () => {
    expect(getAdapterForType('textarea')).toBe('textarea');
  });

  it('returns "slider" for slider type', () => {
    expect(getAdapterForType('slider')).toBe('slider');
  });

  it('returns "autocomplete" for autocomplete type', () => {
    expect(getAdapterForType('autocomplete')).toBe('autocomplete');
  });

  it('returns "datePicker" for date type', () => {
    expect(getAdapterForType('date')).toBe('datePicker');
  });

  it('returns "textInput" for undefined type', () => {
    expect(getAdapterForType(undefined)).toBe('textInput');
  });
});

// ─── extractValue ───────────────────────────────────────────────────────────

describe('extractValue', () => {
  it('extracts string from text model', () => {
    const model = { value: 'hello', cursor: 5, focused: false };
    expect(extractValue('text', model)).toBe('hello');
  });

  it('extracts string from password model', () => {
    const model = { value: 'secret', cursor: 6, focused: false };
    expect(extractValue('password', model)).toBe('secret');
  });

  it('extracts number from number model', () => {
    const model = { value: 42, editing: false, buffer: '', focused: false };
    expect(extractValue('number', model)).toBe(42);
  });

  it('extracts boolean from boolean model', () => {
    const model = { checked: true, focused: false };
    expect(extractValue('boolean', model)).toBe(true);
  });

  it('extracts index-based value from select model', () => {
    const options = [
      { label: 'Red', value: 'red' },
      { label: 'Green', value: 'green' },
    ];
    const model = { open: false, highlighted: 0, selected: 1, focused: false };
    expect(extractValue('select', model, options)).toBe('green');
  });

  it('returns empty string for null select', () => {
    const model = { open: false, highlighted: 0, selected: null, focused: false };
    expect(extractValue('select', model, [])).toBe('');
  });

  it('extracts joined string from textarea model', () => {
    const model = { lines: ['line 1', 'line 2'], cursorRow: 0, cursorCol: 0, scrollOffset: 0, focused: false };
    expect(extractValue('textarea', model)).toBe('line 1\nline 2');
  });

  it('extracts number from slider model', () => {
    const model = { value: 75, focused: false };
    expect(extractValue('slider', model)).toBe(75);
  });

  it('extracts string from autocomplete model', () => {
    const model = { query: 'Lon', suggestions: ['London'], highlighted: 0, open: true };
    expect(extractValue('autocomplete', model)).toBe('Lon');
  });

  it('extracts SimpleDate from date model', () => {
    const model = { viewYear: 2025, viewMonth: 6, cursorDay: 15, selected: { year: 2025, month: 6, day: 15 }, focused: false };
    expect(extractValue('date', model)).toEqual({ year: 2025, month: 6, day: 15 });
  });

  it('returns null for date model with no selection', () => {
    const model = { viewYear: 2025, viewMonth: 6, cursorDay: 15, selected: null, focused: false };
    expect(extractValue('date', model)).toBeNull();
  });
});

// ─── injectValue ────────────────────────────────────────────────────────────

describe('injectValue', () => {
  it('injects string into text model', () => {
    const model = { value: 'old', cursor: 3, focused: false };
    const result = injectValue('text', model, 'new') as typeof model;
    expect(result.value).toBe('new');
    expect(result.cursor).toBe(3); // cursor stays at end of new value's length
  });

  it('injects string into password model', () => {
    const model = { value: 'old', cursor: 3, focused: false };
    const result = injectValue('password', model, 'newpass') as typeof model;
    expect(result.value).toBe('newpass');
  });

  it('injects number into number model', () => {
    const model = { value: 10, editing: false, buffer: '', focused: false };
    const result = injectValue('number', model, 42) as typeof model;
    expect(result.value).toBe(42);
  });

  it('injects boolean into boolean model', () => {
    const model = { checked: false, focused: false };
    const result = injectValue('boolean', model, true) as typeof model;
    expect(result.checked).toBe(true);
  });

  it('injects string value as index into select model', () => {
    const options = [
      { label: 'Red', value: 'red' },
      { label: 'Green', value: 'green' },
    ];
    const model = { open: false, highlighted: 0, selected: 0, focused: false };
    const result = injectValue('select', model, 'green', options) as typeof model;
    expect(result.selected).toBe(1);
  });

  it('sets selected to null for unknown select value', () => {
    const options = [{ label: 'Red', value: 'red' }];
    const model = { open: false, highlighted: 0, selected: 0, focused: false };
    const result = injectValue('select', model, 'unknown', options) as typeof model;
    expect(result.selected).toBeNull();
  });

  it('injects string into textarea model as lines', () => {
    const model = { lines: [''], cursorRow: 0, cursorCol: 0, scrollOffset: 0, focused: false };
    const result = injectValue('textarea', model, 'line 1\nline 2') as typeof model;
    expect(result.lines).toEqual(['line 1', 'line 2']);
  });

  it('injects number into slider model', () => {
    const model = { value: 50, focused: false };
    const result = injectValue('slider', model, 75) as typeof model;
    expect(result.value).toBe(75);
  });

  it('injects string into autocomplete model', () => {
    const model = { query: '', suggestions: [], highlighted: 0, open: false };
    const result = injectValue('autocomplete', model, 'Tokyo') as typeof model;
    expect(result.query).toBe('Tokyo');
  });

  it('injects SimpleDate into date model', () => {
    const model = { viewYear: 2025, viewMonth: 1, cursorDay: 1, selected: null, focused: false };
    const date = { year: 2025, month: 6, day: 15 };
    const result = injectValue('date', model, date) as typeof model;
    expect(result.selected).toEqual(date);
    expect(result.viewYear).toBe(2025);
    expect(result.viewMonth).toBe(6);
    expect(result.cursorDay).toBe(15);
  });
});
