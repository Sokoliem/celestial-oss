# @celestial/rosetta

Internationalization, RTL/bidi text support, grapheme segmentation, locale resolution, and locale-aware formatting for the Celestial TUI framework. Uses built-in Intl APIs plus Corona's terminal width tables.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Features

- **Message Formatting** — ICU MessageFormat subset with plural, select, and interpolation
- **Bidi Algorithm** — Full Unicode Bidi Algorithm (UAX #9) for RTL text reordering
- **Direction Detection** — First-strong-character rule for paragraph-level direction
- **Grapheme Segmentation** — User-perceived character splitting for cursor movement and width calculation
- **Width Helpers** — Grapheme-aware width measurement, slicing, truncation, padding, centering, and wrapping for terminal layouts
- **Locale Context** — Unified context bundling translation, formatting, bidi, and locale resolution under a single locale
- **Formatting** — Locale-aware number, date, currency, compact metric, compact relative time, unit, and list formatting

## Quick Start

```typescript
import { formatCompactMetric, formatDisplayLabel, resolveLocale, truncateText } from '@celestial/rosetta';

const locale = resolveLocale('ar-EG', {
  supportedLocales: ['en-US', 'ar-EG'],
  fallbackLocale: 'en-US',
});

locale.formatDate(Date.now(), { dateStyle: 'long' });
locale.formatUnit(12, 'byte', { unitDisplay: 'short' });
truncateText('👨‍👩‍👧‍👦 family status', 10);
formatCompactMetric(12_400);
formatDisplayLabel('مرحبا / hello', { width: 12, baseDirection: 'auto', pad: true });
```

## Usage

### Message Formatting

```typescript
import { formatMessage, translateMessage } from '@celestial/rosetta';

formatMessage('Hello {name}', { name: 'World' });
formatMessage('{count, plural, one {# item} other {# items}}', { count: 1 }, 'en');
formatMessage('{gender, select, male {He} female {She} other {They}}', { gender: 'female' });
formatMessage("Escaped: '{not_a_var}'", {});
```

### Message Catalog Translation

```typescript
import { translateMessage } from '@celestial/rosetta';

const catalog = {
  greeting: 'Hello {name}',
  itemCount: {
    one: '{count, plural, one {# item} other {# items}}',
    other: '{count, plural, one {# item} other {# items}}',
  },
};

translateMessage(catalog, 'greeting', { name: 'World' }, 'en');
translateMessage(catalog, 'unknownKey');
```

### Direction Detection

```typescript
import { detectDirection, isRtlChar, isLtrChar, getCharBidiType } from '@celestial/rosetta';

detectDirection('مرحبا');
detectDirection('Hello');
isRtlChar('م'.codePointAt(0)!);
isLtrChar('H'.codePointAt(0)!);
getCharBidiType('م'.codePointAt(0)!);
```

### Bidi Reordering

```typescript
import { reorderBidi, toBidiVisual } from '@celestial/rosetta';

const runs = reorderBidi('Hello مرحبا World', 'ltr');
runs[0];
toBidiVisual('Hello مرحبا World', 'ltr');
```

### Locale Context

```typescript
import { createLocaleContext, resolveLocale } from '@celestial/rosetta';

const ctx = createLocaleContext({
  lang: 'de-DE',
  dir: 'auto',
  messages: {
    items: '{count, plural, one {# Artikel} other {# Artikel}}',
  },
});

ctx.t('items', { count: 5 });
ctx.formatNumber(1234.56, { style: 'currency', currency: 'EUR' });
ctx.formatDate(Date.now(), { dateStyle: 'full' });
ctx.formatCurrency(19.99, 'EUR');
ctx.formatUnit(24, 'hour', { unitDisplay: 'short' });
ctx.reorderBidi('mixed English und Deutsch Text');

const locale = resolveLocale('fr-CA', {
  supportedLocales: ['en-US', 'fr-FR'],
  fallbackLocale: 'en-US',
});

locale.lang;
```

### Grapheme Segmentation

```typescript
import {
  centerCellText,
  formatDisplayLabel,
  graphemeLength,
  graphemeSlice,
  measureTextWidth,
  padCellText,
  segmentGraphemes,
  sliceTextByWidth,
  truncateCellText,
  truncateText,
  wrapCellText,
} from '@celestial/rosetta';

segmentGraphemes('café');
graphemeLength('👨‍👩‍👧‍👦');
graphemeSlice('café', 0, 3);
measureTextWidth('A🇺🇸B');
sliceTextByWidth('AB界CD', 4);
truncateText('AB界CD', 5);
truncateCellText('AB界CD', 5);
padCellText('status', 10, { align: 'right' });
centerCellText('OK', 6);
wrapCellText('A long localized label', 8, { maxLines: 2 });
formatDisplayLabel('مرحبا / hello', { width: 12, baseDirection: 'auto', pad: true });
```

### Number / Date / Currency Formatting

```typescript
import {
  formatCompactCurrency,
  formatCompactMetric,
  formatCompactRelativeTime,
  formatCurrency,
  formatDate,
  formatList,
  formatNumber,
  formatRelativeTime,
  formatUnit,
} from '@celestial/rosetta';

formatNumber(1234.5, 'de-DE');
formatNumber(0.85, 'en-US', { style: 'percent' });
formatCompactMetric(12_400, 'en-US');
formatCompactCurrency(1_200, 'en-US', 'USD');
formatCompactRelativeTime(5 * 60_000);
formatDate(Date.now(), 'ja-JP', { dateStyle: 'long' });
formatCurrency(9.99, 'en-US', 'USD');
formatUnit(12, 'en-US', 'byte', { unitDisplay: 'short' });
formatRelativeTime(-3, 'day', 'en-US');
formatRelativeTime(2, 'hour', 'es');
formatList(['Alice', 'Bob', 'Charlie'], 'en-US');
formatList(['Alice', 'Bob', 'Charlie'], 'en-US', 'disjunction');
```

## API Reference

### Direction Detection

| Function | Signature | Description |
|----------|-----------|-------------|
| `detectDirection` | `(text: string) => 'ltr' \| 'rtl'` | Detect paragraph direction via first strong character (UAX #9 P2/P3) |
| `isRtlChar` | `(cp: number) => boolean` | Check if a code point is an RTL character |
| `isLtrChar` | `(cp: number) => boolean` | Check if a code point is an LTR character |
| `getCharBidiType` | `(cp: number) => BidiCharType` | Classify a code point into its UAX #9 bidi type |

### Bidi Algorithm

| Function | Signature | Description |
|----------|-----------|-------------|
| `reorderBidi` | `(text: string, baseDirection?: Direction) => BidiRun[]` | Run full Unicode Bidi Algorithm, return runs with resolved levels |
| `toBidiVisual` | `(text: string, baseDirection?: Direction) => string` | Convert logical-order text to visual-order for display |

### Message Formatting

| Function | Signature | Description |
|----------|-----------|-------------|
| `formatMessage` | `(template: string, values: Record<string, unknown>, locale?: string) => string` | Format an ICU MessageFormat template with values |
| `translateMessage` | `(catalog: MessageCatalog, key: string, values?: Record<string, unknown>, locale?: string) => string` | Look up and format a message from a catalog |

### Formatting

| Function | Signature | Description |
|----------|-----------|-------------|
| `formatNumber` | `(value: number, locale: string, options?: FormatOptions) => string` | Format a number per locale conventions |
| `formatDate` | `(value: Date \| number, locale: string, options?: DateFormatOptions) => string` | Format a date per locale conventions |
| `formatCurrency` | `(value: number, locale: string, currency: string) => string` | Format a monetary value with currency symbol |
| `formatCompactMetric` | `(value: number, locale?: string, options?: CompactFormatOptions) => string` | Format a compact metric value for dense dashboards |
| `formatCompactCurrency` | `(value: number, locale?: string, currency?: string, options?: CompactFormatOptions) => string` | Format compact currency with locale grouping |
| `formatCompactRelativeTime` | `(deltaMs: number, options?: CompactRelativeTimeOptions) => string` | Format a deterministic compact relative-time label from milliseconds |
| `formatUnit` | `(value: number, locale: string, unit: Intl.NumberFormatOptions['unit'], options?: UnitFormatOptions) => string` | Format a numeric value with a locale-aware unit label |
| `formatRelativeTime` | `(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string) => string` | Format relative time (e.g. "3 days ago") |
| `formatList` | `(items: string[], locale: string, type?: 'conjunction' \| 'disjunction') => string` | Format a list with locale-appropriate conjunction/disjunction |

### Grapheme Segmentation

| Function | Signature | Description |
|----------|-----------|-------------|
| `segmentGraphemes` | `(text: string) => string[]` | Split text into grapheme clusters |
| `graphemeLength` | `(text: string) => number` | Count grapheme clusters in a string |
| `graphemeSlice` | `(text: string, start: number, end?: number) => string` | Slice by grapheme cluster indices |
| `measureGraphemeWidth` | `(grapheme: string) => number` | Measure the terminal-cell width of a single grapheme cluster |
| `measureTextWidth` | `(text: string) => number` | Measure the terminal-cell width of a string |
| `sliceTextByWidth` | `(text: string, maxWidth: number) => string` | Slice a string so its rendered width stays within a cell budget |
| `truncateText` | `(text: string, maxWidth: number, ellipsis?: string) => string` | Truncate text to a cell budget without splitting grapheme clusters |
| `truncateCellText` | `(text: string, width: number, options?: CellTextOptions) => string` | Truncate terminal cell text with configurable ellipsis |
| `padCellText` | `(text: string, width: number, options?: PadCellTextOptions) => string` | Pad terminal text left, right, or centered after safe truncation |
| `centerCellText` | `(text: string, width: number, options?: CellTextOptions) => string` | Center terminal text in a fixed cell width |
| `wrapCellText` | `(text: string, width: number, options?: WrapCellTextOptions) => string[]` | Wrap text to terminal-cell lines with optional clipping |
| `formatDisplayLabel` | `(text: string, options: DisplayLabelOptions) => string` | Apply bidi visual order plus cell-safe truncation and optional padding |

### Locale Context

| Function | Signature | Description |
|----------|-----------|-------------|
| `createLocaleContext` | `(config: LocaleConfig) => LocaleContext` | Create a locale-scoped context for translation, formatting, and bidi |
| `resolveLocale` | `(locale?: LocaleLike, options?: ResolveLocaleOptions) => LocaleContext` | Resolve a locale tag, config, or existing context into a stable locale context |

## Types Reference

```typescript
type Direction = 'ltr' | 'rtl' | 'auto';

interface MessagePluralForm {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

interface MessageCatalog {
  [key: string]: string | MessagePluralForm;
}

interface LocaleConfig {
  lang: string;
  dir: Direction;
  messages?: MessageCatalog;
}

interface BidiRun {
  text: string;
  level: number;
  start: number;
  end: number;
}

type FormatOptions = Intl.NumberFormatOptions;
type CompactFormatOptions = Omit<Intl.NumberFormatOptions, 'notation'>;
type UnitFormatOptions = Omit<Intl.NumberFormatOptions, 'style' | 'unit'>;
type DateFormatOptions = Intl.DateTimeFormatOptions;

interface CompactRelativeTimeOptions {
  includeSuffix?: boolean;
  nowLabel?: string;
  futurePrefix?: string;
  pastSuffix?: string;
}

type CellTextAlign = 'left' | 'right' | 'center';

interface CellTextOptions {
  ellipsis?: string;
}

interface PadCellTextOptions extends CellTextOptions {
  align?: CellTextAlign;
}

interface WrapCellTextOptions extends CellTextOptions {
  maxLines?: number;
  preserveWords?: boolean;
}

interface DisplayLabelOptions extends PadCellTextOptions {
  width: number;
  baseDirection?: Direction;
  pad?: boolean;
}

interface ResolveLocaleOptions {
  defaultLocale?: string;
  fallbackLocale?: string;
  supportedLocales?: readonly string[];
  dir?: Direction;
  messages?: MessageCatalog;
}

type BidiCharType =
  | 'L' | 'R' | 'AL' | 'AN' | 'EN' | 'ES' | 'ET' | 'CS'
  | 'NSM' | 'BN' | 'B' | 'S' | 'WS' | 'ON'
  | 'LRE' | 'LRO' | 'RLE' | 'RLO' | 'PDF'
  | 'LRI' | 'RLI' | 'FSI' | 'PDI';

interface LocaleContext {
  readonly dir: Direction;
  readonly lang: string;
  t(key: string, values?: Record<string, unknown>): string;
  formatNumber(value: number, options?: FormatOptions): string;
  formatDate(value: Date | number, options?: DateFormatOptions): string;
  formatCurrency(value: number, currency: string): string;
  formatUnit(value: number, unit: Intl.NumberFormatOptions['unit'], options?: UnitFormatOptions): string;
  reorderBidi(text: string): string;
}

type LocaleLike = string | LocaleConfig | LocaleContext | undefined;
```

## License

MIT
