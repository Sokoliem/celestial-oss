import { describe, expect, it } from 'vitest';
import { createCatalogStore } from '../catalog.js';
import { createLocaleContext, resolveLocale } from '../context.js';
import type { LocaleConfig } from '../types.js';

describe('createLocaleContext', () => {
  it('creates a context with explicit LTR direction', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    expect(ctx.dir).toBe('ltr');
    expect(ctx.lang).toBe('en-US');
  });

  it('creates a context with explicit RTL direction', () => {
    const ctx = createLocaleContext({ lang: 'ar-EG', dir: 'rtl' });
    expect(ctx.dir).toBe('rtl');
    expect(ctx.lang).toBe('ar-EG');
  });

  it('resolves auto direction for Arabic as RTL', () => {
    const ctx = createLocaleContext({ lang: 'ar', dir: 'auto' });
    expect(ctx.dir).toBe('rtl');
  });

  it('resolves auto direction for English as LTR', () => {
    const ctx = createLocaleContext({ lang: 'en', dir: 'auto' });
    expect(ctx.dir).toBe('ltr');
  });

  it('resolves auto direction for Hebrew as RTL', () => {
    const ctx = createLocaleContext({ lang: 'he', dir: 'auto' });
    expect(ctx.dir).toBe('rtl');
  });

  it('resolves auto direction for Persian as RTL', () => {
    const ctx = createLocaleContext({ lang: 'fa-IR', dir: 'auto' });
    expect(ctx.dir).toBe('rtl');
  });

  it('translates messages from catalog', () => {
    const config: LocaleConfig = {
      lang: 'en-US',
      dir: 'ltr',
      messages: {
        hello: 'Hello {name}!',
        goodbye: 'Goodbye',
      },
    };
    const ctx = createLocaleContext(config);
    expect(ctx.t('hello', { name: 'World' })).toBe('Hello World!');
    expect(ctx.t('goodbye')).toBe('Goodbye');
  });

  it('returns the key for missing messages', () => {
    const ctx = createLocaleContext({
      lang: 'en',
      dir: 'ltr',
      messages: {},
    });
    expect(ctx.t('missing.key')).toBe('missing.key');
  });

  it('returns the key when no catalog is provided', () => {
    const ctx = createLocaleContext({ lang: 'en', dir: 'ltr' });
    expect(ctx.t('any.key')).toBe('any.key');
  });

  it('reads updates from a reactive catalog store', () => {
    const messages = createCatalogStore({
      greeting: 'Hello',
    });
    const ctx = createLocaleContext({
      lang: 'en-US',
      dir: 'ltr',
      messages,
    });

    expect(ctx.t('greeting')).toBe('Hello');

    messages.setCatalog({
      greeting: 'Hi there',
    });

    expect(ctx.t('greeting')).toBe('Hi there');
  });

  it('formats numbers according to locale', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    expect(ctx.formatNumber(1234)).toBe('1,234');
  });

  it('formats dates according to locale', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    const date = new Date('2024-06-15T12:00:00Z');
    const result = ctx.formatDate(date);
    expect(result).toContain('2024');
  });

  it('formats currency according to locale', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    const result = ctx.formatCurrency(42.5, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('42.50');
  });

  it('formats units according to locale', () => {
    const ctx = createLocaleContext({ lang: 'fr-FR', dir: 'ltr' });
    const result = ctx.formatUnit(3, 'hour', { unitDisplay: 'short' });
    expect(result).toContain('3');
    expect(result).toContain('h');
  });

  it('formats ordinal, compact, duration, and range values', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });

    expect(ctx.formatOrdinal(2)).toBe('2nd');
    expect(ctx.formatCompact(12_000)).toMatch(/12K/i);
    expect(ctx.formatDuration(90_000, 'digital')).toMatch(/1:30|01:30/);

    const range = ctx.formatRange(10, 20, { style: 'currency', currency: 'USD' });
    expect(range).toContain('$');
    expect(range).toContain('10');
    expect(range).toContain('20');
  });

  it('creates locale-aware collators', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    const collator = ctx.createCollator({ sensitivity: 'base' });

    expect(['zebra', 'apple', 'Éclair'].sort(collator.compare)[0]).toBe('apple');
  });

  it('applies bidi reordering', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    const result = ctx.reorderBidi('Hello World');
    expect(result).toBe('Hello World');
  });

  it('wraps bidi-aware lines using the locale direction', () => {
    const ctx = createLocaleContext({ lang: 'en-US', dir: 'ltr' });

    expect(ctx.wrapBidi('Hello wide world', 6)).toEqual(['Hello', 'wide', 'world']);
  });

  it('handles plural messages in catalog', () => {
    const config: LocaleConfig = {
      lang: 'en-US',
      dir: 'ltr',
      messages: {
        items: {
          one: '{count} item',
          other: '{count} items',
        },
      },
    };
    const ctx = createLocaleContext(config);
    expect(ctx.t('items', { count: 1 })).toBe('1 item');
    expect(ctx.t('items', { count: 5 })).toBe('5 items');
  });
});

describe('resolveLocale', () => {
  it('returns an existing locale context unchanged', () => {
    const locale = createLocaleContext({ lang: 'en-US', dir: 'ltr' });
    expect(resolveLocale(locale)).toBe(locale);
  });

  it('creates a context from a locale config', () => {
    const locale = resolveLocale({ lang: 'ar-EG', dir: 'auto' });
    expect(locale.lang).toBe('ar-EG');
    expect(locale.dir).toBe('rtl');
  });

  it('matches supported locales by language family', () => {
    const locale = resolveLocale('fr-CA', {
      supportedLocales: ['en-US', 'fr-FR'],
      fallbackLocale: 'en-US',
    });
    expect(locale.lang).toBe('fr-FR');
  });

  it('falls back when the requested locale is unsupported', () => {
    const locale = resolveLocale('ja-JP', {
      supportedLocales: ['en-US', 'fr-FR'],
      fallbackLocale: 'en-US',
    });
    expect(locale.lang).toBe('en-US');
  });
});
