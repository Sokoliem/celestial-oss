import { describe, expect, it } from 'vitest';
import { formatMessage, translateMessage } from '../message.js';
import type { MessageCatalog } from '../types.js';

describe('formatMessage', () => {
  it('returns plain text unchanged', () => {
    expect(formatMessage('Hello World', {})).toBe('Hello World');
  });

  it('substitutes simple named arguments', () => {
    expect(formatMessage('Hello {name}', { name: 'World' })).toBe('Hello World');
  });

  it('substitutes multiple arguments', () => {
    expect(formatMessage('{greeting} {name}!', { greeting: 'Hi', name: 'Alice' })).toBe('Hi Alice!');
  });

  it('leaves unknown arguments as-is', () => {
    expect(formatMessage('Hello {unknown}', {})).toBe('Hello {unknown}');
  });

  it('handles plural with one/other', () => {
    const tpl = '{count, plural, one {# item} other {# items}}';
    expect(formatMessage(tpl, { count: 1 })).toBe('1 item');
    expect(formatMessage(tpl, { count: 5 })).toBe('5 items');
    expect(formatMessage(tpl, { count: 0 })).toBe('0 items');
  });

  it('handles plural with zero category', () => {
    const _tpl = '{count, plural, zero {no items} one {# item} other {# items}}';
    // Note: English Intl.PluralRules returns "other" for 0, not "zero"
    // Only languages like Arabic use "zero" category
    // So we test with exact match instead
    const tpl2 = '{count, plural, =0 {no items} one {# item} other {# items}}';
    expect(formatMessage(tpl2, { count: 0 })).toBe('no items');
  });

  it('handles exact plural matches', () => {
    const tpl = '{count, plural, =0 {none} =1 {exactly one} other {# things}}';
    expect(formatMessage(tpl, { count: 0 })).toBe('none');
    expect(formatMessage(tpl, { count: 1 })).toBe('exactly one');
    expect(formatMessage(tpl, { count: 42 })).toBe('42 things');
  });

  it('handles select format', () => {
    const tpl = '{gender, select, male {He} female {She} other {They}}';
    expect(formatMessage(tpl, { gender: 'male' })).toBe('He');
    expect(formatMessage(tpl, { gender: 'female' })).toBe('She');
    expect(formatMessage(tpl, { gender: 'nonbinary' })).toBe('They');
  });

  it('handles nested substitution in plural', () => {
    const tpl = '{count, plural, one {# {type}} other {# {type}s}}';
    expect(formatMessage(tpl, { count: 1, type: 'file' })).toBe('1 file');
    expect(formatMessage(tpl, { count: 3, type: 'file' })).toBe('3 files');
  });

  it('handles escaped single quotes', () => {
    const tpl = "'{literal}' text";
    expect(formatMessage(tpl, {})).toBe('{literal} text');
  });

  it('handles doubled single quotes as literal quote', () => {
    const tpl = "it''s a test";
    expect(formatMessage(tpl, {})).toBe("it's a test");
  });

  it('handles empty template', () => {
    expect(formatMessage('', {})).toBe('');
  });

  it('handles template with only an argument', () => {
    expect(formatMessage('{x}', { x: 42 })).toBe('42');
  });
});

describe('translateMessage', () => {
  const catalog: MessageCatalog = {
    greeting: 'Hello {name}',
    items: {
      one: '{count} item',
      other: '{count} items',
    },
    static: 'This is static text',
  };

  it('translates a simple message', () => {
    expect(translateMessage(catalog, 'greeting', { name: 'World' })).toBe('Hello World');
  });

  it('translates a plural message', () => {
    expect(translateMessage(catalog, 'items', { count: 1 })).toBe('1 item');
    expect(translateMessage(catalog, 'items', { count: 5 })).toBe('5 items');
  });

  it('returns static text without values', () => {
    expect(translateMessage(catalog, 'static')).toBe('This is static text');
  });

  it('returns key for missing messages', () => {
    expect(translateMessage(catalog, 'missing.key')).toBe('missing.key');
  });
});
