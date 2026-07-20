import { describe, expect, it } from 'vitest';
import {
  catalogSub,
  createCatalogStore,
  createCollator,
  createLocaleContext,
  detectDirection,
  formatCompact,
  formatCurrency,
  formatDate,
  formatDuration,
  formatList,
  formatMessage,
  formatNumber,
  formatOrdinal,
  formatRange,
  formatRelativeTime,
  formatUnit,
  getCharBidiType,
  graphemeLength,
  graphemeSlice,
  isLtrChar,
  isRtlChar,
  measureTextWidth,
  relativeTimeInterval,
  reorderBidi,
  resolveLocale,
  segmentGraphemes,
  toBidiVisual,
  translateMessage,
  truncateText,
  wrapBidi,
} from '../index.js';

describe('integration: all exports available', () => {
  it('exports all public functions', () => {
    expect(typeof createLocaleContext).toBe('function');
    expect(typeof detectDirection).toBe('function');
    expect(typeof reorderBidi).toBe('function');
    expect(typeof toBidiVisual).toBe('function');
    expect(typeof wrapBidi).toBe('function');
    expect(typeof formatMessage).toBe('function');
    expect(typeof formatNumber).toBe('function');
    expect(typeof formatOrdinal).toBe('function');
    expect(typeof formatCompact).toBe('function');
    expect(typeof formatDate).toBe('function');
    expect(typeof formatCurrency).toBe('function');
    expect(typeof formatDuration).toBe('function');
    expect(typeof formatRange).toBe('function');
    expect(typeof formatRelativeTime).toBe('function');
    expect(typeof relativeTimeInterval).toBe('function');
    expect(typeof formatList).toBe('function');
    expect(typeof formatUnit).toBe('function');
    expect(typeof createCollator).toBe('function');
    expect(typeof segmentGraphemes).toBe('function');
    expect(typeof graphemeLength).toBe('function');
    expect(typeof graphemeSlice).toBe('function');
    expect(typeof measureTextWidth).toBe('function');
    expect(typeof truncateText).toBe('function');
    expect(typeof isRtlChar).toBe('function');
    expect(typeof isLtrChar).toBe('function');
    expect(typeof getCharBidiType).toBe('function');
    expect(typeof translateMessage).toBe('function');
    expect(typeof resolveLocale).toBe('function');
    expect(typeof createCatalogStore).toBe('function');
    expect(typeof catalogSub).toBe('function');
  });
});

describe('integration: end-to-end i18n workflow', () => {
  it('creates an English context, translates, formats, and displays', () => {
    const ctx = createLocaleContext({
      lang: 'en-US',
      dir: 'ltr',
      messages: {
        welcome: 'Welcome, {name}!',
        items: '{count, plural, one {You have # item} other {You have # items}}',
        price: 'Total: {total}',
      },
    });

    // Direction
    expect(ctx.dir).toBe('ltr');

    // Translation
    expect(ctx.t('welcome', { name: 'Alice' })).toBe('Welcome, Alice!');
    expect(ctx.t('items', { count: 1 })).toBe('You have 1 item');
    expect(ctx.t('items', { count: 42 })).toBe('You have 42 items');

    // Number formatting
    const price = ctx.formatNumber(1299.99, { minimumFractionDigits: 2 });
    expect(price).toBe('1,299.99');

    // Currency formatting
    const currency = ctx.formatCurrency(49.99, 'USD');
    expect(currency).toContain('$');
    expect(currency).toContain('49.99');

    // Unit formatting
    const distance = ctx.formatUnit(12, 'kilometer', { unitDisplay: 'short' });
    expect(distance).toContain('12');
    expect(distance).toContain('km');

    // Date formatting
    const date = ctx.formatDate(new Date('2024-12-25'));
    expect(date).toContain('2024');

    // Bidi (no-op for LTR)
    expect(ctx.reorderBidi('Hello World')).toBe('Hello World');
  });

  it('creates an Arabic context with RTL support', () => {
    const ctx = createLocaleContext({
      lang: 'ar-EG',
      dir: 'auto', // should resolve to RTL
      messages: {
        greeting: 'مرحبا {name}',
      },
    });

    // Direction auto-detected as RTL
    expect(ctx.dir).toBe('rtl');

    // Translation
    expect(ctx.t('greeting', { name: 'أحمد' })).toBe('مرحبا أحمد');

    // Bidi reordering
    const visual = ctx.reorderBidi('مرحبا Hello');
    expect(visual).toBeTruthy();
    expect(visual.length).toBe('مرحبا Hello'.length);
  });

  it('combines grapheme segmentation with bidi', () => {
    const text = 'Hello 👨‍👩‍👧‍👦 World';

    // Grapheme count treats family emoji as 1
    // H, e, l, l, o, ' ', 👨‍👩‍👧‍👦, ' ', W, o, r, l, d = 13
    expect(graphemeLength(text)).toBe(13);
    const graphemes = segmentGraphemes(text);
    // H, e, l, l, o, ' ', 👨‍👩‍👧‍👦, ' ', W, o, r, l, d = 13
    expect(graphemes).toHaveLength(13);

    // Slicing around the emoji
    const slice = graphemeSlice(text, 5, 8);
    expect(slice).toContain('👨‍👩‍👧‍👦');

    // Direction detection on LTR text
    expect(detectDirection(text)).toBe('ltr');
  });

  it('detects direction correctly for mixed content', () => {
    expect(detectDirection('Hello World')).toBe('ltr');
    expect(detectDirection('مرحبا بالعالم')).toBe('rtl');
    expect(detectDirection('שלום עולם')).toBe('rtl');
    expect(detectDirection('123 Hello')).toBe('ltr');
    expect(detectDirection('123 مرحبا')).toBe('rtl');
  });

  it('formats numbers and dates across locales', () => {
    // US
    expect(formatNumber(1234.56, 'en-US')).toBe('1,234.56');

    // German
    const deCurrency = formatCurrency(42.5, 'de-DE', 'EUR');
    expect(deCurrency).toBeTruthy();

    // Relative time
    expect(formatRelativeTime(-1, 'day', 'en-US')).toBe('yesterday');
    expect(formatRelativeTime(1, 'day', 'en-US')).toBe('tomorrow');

    // List formatting
    expect(formatList(['a', 'b', 'c'], 'en-US')).toBe('a, b, and c');
    expect(formatList(['x', 'y'], 'en-US', 'disjunction')).toBe('x or y');
    expect(formatUnit(32, 'en-US', 'byte', { unitDisplay: 'short' })).toContain('32');
  });

  it('handles the complete message format feature set', () => {
    // Simple substitution
    expect(formatMessage('Hello {name}', { name: 'World' })).toBe('Hello World');

    // Plural
    expect(formatMessage('{n, plural, one {# dog} other {# dogs}}', { n: 1 })).toBe('1 dog');

    // Select
    expect(formatMessage('{g, select, male {He} female {She} other {They}}', { g: 'female' })).toBe('She');

    // Escaped braces
    expect(formatMessage("'{escaped}'", {})).toBe('{escaped}');
  });

  it('handles bidi with mixed scripts and numbers', () => {
    const runs = reorderBidi('Hello שלום 42 World');
    expect(runs.length).toBeGreaterThanOrEqual(2);

    const allText = runs.map((r) => r.text).join('');
    expect(allText.length).toBe('Hello שלום 42 World'.length);
  });

  it('supports locale resolution and width-aware truncation together', () => {
    const locale = resolveLocale('fr-CA', {
      supportedLocales: ['en-US', 'fr-FR'],
      fallbackLocale: 'en-US',
    });

    expect(locale.lang).toBe('fr-FR');
    expect(measureTextWidth('A🇺🇸B')).toBe(4);
    expect(truncateText('AB界CD', 5)).toBe('AB界…');
  });

  it('supports catalog hot-reload with the exported helpers', () => {
    const store = createCatalogStore({
      status: 'Ready',
    });
    const observed: string[] = [];
    const unsubscribe = catalogSub(store, (catalog) => {
      observed.push(catalog.status);
    });
    const ctx = createLocaleContext({
      lang: 'en-US',
      dir: 'ltr',
      messages: store,
    });

    expect(ctx.t('status')).toBe('Ready');

    store.setCatalog({
      status: 'Running',
    });

    expect(ctx.t('status')).toBe('Running');
    expect(observed).toEqual(['Running']);

    unsubscribe();
  });
});
