/**
 * @celestial/rosetta — Number, date, currency, and list formatting.
 *
 * Thin wrappers around the built-in Intl APIs providing a consistent
 * interface and sensible defaults for terminal UI applications.
 */

import type {
  CompactFormatOptions,
  CompactRelativeTimeOptions,
  DateFormatOptions,
  DurationFormatStyle,
  FormatOptions,
  RangeFormatOptions,
  UnitFormatOptions,
} from './types.js';

type DateTimeFormatWithRange = Intl.DateTimeFormat & {
  formatRange?: Intl.DateTimeFormat['formatRange'];
};

type NumberFormatWithRange = Intl.NumberFormat & {
  formatRange?: (startNumber: number, endNumber: number) => string;
};

interface DurationFields {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

interface DurationFormatter {
  format(duration: DurationFields): string;
}

type DurationFormatterConstructor = new (locales?: string | string[], options?: { style?: DurationFormatStyle }) => DurationFormatter;

const DurationFormatCtor = (Intl as typeof Intl & { DurationFormat?: DurationFormatterConstructor }).DurationFormat;
const ORDINAL_SUFFIXES: Record<string, Partial<Record<Intl.LDMLPluralRule, string>>> = {
  en: {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  },
  fr: {
    one: 'er',
    other: 'e',
  },
};

/**
 * Format a number according to locale conventions.
 *
 * @param value   - The number to format
 * @param locale  - BCP 47 locale string (e.g. 'en-US', 'de-DE')
 * @param options - Formatting options
 * @returns The formatted number string
 */
export function formatNumber(value: number, locale: string, options?: FormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a number using locale-aware compact notation.
 *
 * @param value - The numeric value to format
 * @param locale - BCP 47 locale string
 * @param options - Number formatting options merged onto compact notation defaults
 * @returns The compact formatted number string
 */
export function formatCompact(value: number, locale: string, options?: CompactFormatOptions): string {
  return new Intl.NumberFormat(locale, {
    ...options,
    notation: 'compact',
    compactDisplay: options?.compactDisplay ?? 'short',
  }).format(value);
}

/**
 * Format a compact metric number for dense terminal dashboards.
 */
export function formatCompactMetric(value: number, locale = 'en-US', options?: CompactFormatOptions): string {
  return formatCompact(value, locale, {
    maximumFractionDigits: 1,
    ...options,
  });
}

/**
 * Format compact currency with locale grouping and a short magnitude label.
 */
export function formatCompactCurrency(value: number, locale = 'en-US', currency = 'USD', options?: CompactFormatOptions): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    ...options,
    notation: 'compact',
    compactDisplay: options?.compactDisplay ?? 'short',
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format an ordinal number using Intl.PluralRules ordinal categories.
 *
 * Falls back to plain number formatting for locales without a known suffix map.
 *
 * @param value - The ordinal value to format
 * @param locale - BCP 47 locale string
 * @returns The formatted ordinal string
 */
export function formatOrdinal(value: number, locale: string): string {
  const numeric = formatNumber(value, locale);
  const language = getPrimaryLanguage(locale);
  const suffixMap = ORDINAL_SUFFIXES[language];

  if (!suffixMap) {
    return numeric;
  }

  const category = new Intl.PluralRules(locale, { type: 'ordinal' }).select(Math.abs(value));
  const suffix = suffixMap[category] ?? suffixMap.other ?? '';
  return `${numeric}${suffix}`;
}

/**
 * Format a date according to locale conventions.
 *
 * @param value   - Date object or timestamp in milliseconds
 * @param locale  - BCP 47 locale string
 * @param options - Date/time style options
 * @returns The formatted date string
 */
export function formatDate(value: Date | number, locale: string, options?: DateFormatOptions): string {
  const date = typeof value === 'number' ? new Date(value) : value;
  const intlOpts: Intl.DateTimeFormatOptions = { ...options };

  // Default to medium dateStyle if nothing is specified
  if (!options || Object.keys(options).length === 0) {
    intlOpts.dateStyle = 'medium';
  }

  return new Intl.DateTimeFormat(locale, intlOpts).format(date);
}

/**
 * Format a monetary value with its currency symbol.
 *
 * @param value    - The monetary amount
 * @param locale   - BCP 47 locale string
 * @param currency - ISO 4217 currency code (e.g. 'USD', 'EUR', 'JPY')
 * @returns The formatted currency string
 */
export function formatCurrency(value: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format a numeric value with a locale-aware unit label.
 *
 * @param value - The numeric value to format
 * @param locale - BCP 47 locale string
 * @param unit - Intl unit identifier (e.g. 'byte', 'kilometer', 'percent')
 * @param options - Number formatting options excluding style/unit
 * @returns The formatted unit string
 */
export function formatUnit(value: number, locale: string, unit: Intl.NumberFormatOptions['unit'], options?: UnitFormatOptions): string {
  return new Intl.NumberFormat(locale, {
    ...options,
    style: 'unit',
    unit,
  }).format(value);
}

/**
 * Format a relative time expression (e.g. "3 days ago", "in 2 hours").
 *
 * @param value - The numeric value (negative = past, positive = future)
 * @param unit  - The time unit
 * @param locale - BCP 47 locale string
 * @returns The formatted relative time string
 */
export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
}

/**
 * Return the next ideal refresh interval for a relative-time display.
 *
 * @param value - The target date or timestamp being rendered relative to now
 * @param now - Optional current timestamp used for deterministic tests
 * @returns Milliseconds until the relative label is likely to change
 */
export function relativeTimeInterval(value: Date | number, now = Date.now()): number {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  const deltaMs = Math.abs(timestamp - now);

  if (deltaMs < 60_000) {
    return 1_000;
  }

  if (deltaMs < 3_600_000) {
    return msUntilNextBoundary(deltaMs, 60_000);
  }

  if (deltaMs < 86_400_000) {
    return msUntilNextBoundary(deltaMs, 3_600_000);
  }

  if (deltaMs < 7 * 86_400_000) {
    return msUntilNextBoundary(deltaMs, 86_400_000);
  }

  if (deltaMs < 30 * 86_400_000) {
    return msUntilNextBoundary(deltaMs, 7 * 86_400_000);
  }

  return msUntilNextBoundary(deltaMs, 30 * 86_400_000);
}

/**
 * Format a compact relative-time label from a millisecond delta.
 * Positive deltas are past values ("5m ago"); negative deltas are future
 * values ("in 5m"). Labels stay deterministic for tests and dashboards.
 */
export function formatCompactRelativeTime(deltaMs: number, options: CompactRelativeTimeOptions = {}): string {
  const includeSuffix = options.includeSuffix ?? true;
  const absMs = Math.abs(deltaMs);
  if (absMs < 30_000) {
    return options.nowLabel ?? 'just now';
  }

  const seconds = Math.floor(absMs / 1000);
  const value =
    seconds < 60
      ? `${seconds}s`
      : seconds < 3_600
        ? `${Math.floor(seconds / 60)}m`
        : seconds < 86_400
          ? `${Math.floor(seconds / 3_600)}h`
          : seconds < 30 * 86_400
            ? `${Math.floor(seconds / 86_400)}d`
            : seconds < 365 * 86_400
              ? `${Math.floor(seconds / (30 * 86_400))}mo`
              : `${Math.floor(seconds / (365 * 86_400))}y`;

  if (!includeSuffix) return value;
  return deltaMs < 0 ? `${options.futurePrefix ?? 'in '}${value}` : `${value}${options.pastSuffix ?? ' ago'}`;
}

/**
 * Format a list of items using locale-appropriate conjunction or disjunction.
 *
 * @param items - Array of strings to join
 * @param locale - BCP 47 locale string
 * @param type  - 'conjunction' (A, B, and C) or 'disjunction' (A, B, or C)
 * @returns The formatted list string
 */
export function formatList(items: string[], locale: string, type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(locale, {
    style: 'long',
    type,
  }).format(items);
}

/**
 * Create a locale-aware string collator for sorting and equality checks.
 *
 * @param locale - BCP 47 locale string
 * @param options - Optional Intl.Collator options
 * @returns A configured Intl.Collator instance
 */
export function createCollator(locale: string, options?: Intl.CollatorOptions): Intl.Collator {
  return new Intl.Collator(locale, options);
}

/**
 * Format a duration value in milliseconds.
 *
 * Uses Intl.DurationFormat when available, otherwise falls back to a small
 * locale-aware formatter tuned for terminal labels.
 *
 * @param value - Duration in milliseconds
 * @param style - Desired output style
 * @param locale - BCP 47 locale string
 * @returns The formatted duration string
 */
export function formatDuration(value: number, style: DurationFormatStyle = 'short', locale = 'en-US'): string {
  const sign = value < 0 ? '-' : '';
  const fields = toDurationFields(Math.abs(value));

  if (DurationFormatCtor) {
    try {
      const formatter = new DurationFormatCtor(locale, { style });
      return `${sign}${formatter.format(fields)}`;
    } catch {
      // Fall through to deterministic formatter below.
    }
  }

  return `${sign}${formatDurationFallback(fields, style, locale)}`;
}

/**
 * Format a numeric or date range using the appropriate Intl range formatter.
 *
 * @param start - Start value (number or Date)
 * @param end - End value (number or Date)
 * @param locale - BCP 47 locale string
 * @param options - Range formatting configuration
 * @returns The formatted range string
 */
export function formatRange(start: number | Date, end: number | Date, locale: string, options: RangeFormatOptions = {}): string {
  const style = resolveRangeStyle(start, end, options);

  if (style === 'date') {
    const formatter = new Intl.DateTimeFormat(locale, options.dateOptions) as DateTimeFormatWithRange;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    if (typeof formatter.formatRange === 'function') {
      return formatter.formatRange(startDate, endDate);
    }

    return `${formatter.format(startDate)}–${formatter.format(endDate)}`;
  }

  const [startNumber, endNumber] = [coerceNumber(start), coerceNumber(end)];
  const numberOptions = buildRangeNumberOptions(style, options);
  const formatter = new Intl.NumberFormat(locale, numberOptions) as NumberFormatWithRange;

  if (typeof formatter.formatRange === 'function') {
    return formatter.formatRange(startNumber, endNumber);
  }

  return `${formatter.format(startNumber)}–${formatter.format(endNumber)}`;
}

function getPrimaryLanguage(locale: string): string {
  try {
    return (Intl.getCanonicalLocales(locale)[0] ?? locale).split('-')[0]!.toLowerCase();
  } catch {
    return locale.split('-')[0]!.toLowerCase();
  }
}

function msUntilNextBoundary(deltaMs: number, unitMs: number): number {
  const remainder = deltaMs % unitMs;
  return Math.max(1, remainder === 0 ? unitMs : unitMs - remainder);
}

function toDurationFields(value: number): DurationFields {
  const totalMilliseconds = Math.trunc(value);
  const days = Math.floor(totalMilliseconds / 86_400_000);
  const hours = Math.floor((totalMilliseconds % 86_400_000) / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;

  return {
    ...(days > 0 ? { days } : {}),
    ...(hours > 0 ? { hours } : {}),
    ...(minutes > 0 ? { minutes } : {}),
    ...(seconds > 0 ? { seconds } : {}),
    ...(milliseconds > 0 || totalMilliseconds === 0 ? { milliseconds } : {}),
  };
}

function formatDurationFallback(fields: DurationFields, style: DurationFormatStyle, locale: string): string {
  if (style === 'digital') {
    return formatDigitalDuration(fields, locale);
  }

  const labelMap =
    style === 'long'
      ? { days: ' day', hours: ' hour', minutes: ' minute', seconds: ' second', milliseconds: ' millisecond' }
      : style === 'narrow'
        ? { days: 'd', hours: 'h', minutes: 'm', seconds: 's', milliseconds: 'ms' }
        : { days: 'd', hours: 'h', minutes: 'm', seconds: 's', milliseconds: 'ms' };

  const numberFormatter = new Intl.NumberFormat(locale);
  const parts: string[] = [];

  for (const key of ['days', 'hours', 'minutes', 'seconds', 'milliseconds'] as const) {
    const rawValue = fields[key];
    if (!rawValue) continue;

    const suffix = labelMap[key];
    if (style === 'long') {
      const plural = rawValue === 1 ? '' : 's';
      parts.push(`${numberFormatter.format(rawValue)}${suffix}${plural}`);
    } else {
      parts.push(`${numberFormatter.format(rawValue)}${suffix}`);
    }
  }

  return parts.length > 0 ? parts.join(style === 'long' ? ', ' : ' ') : `${numberFormatter.format(0)}ms`;
}

function formatDigitalDuration(fields: DurationFields, locale: string): string {
  const totalHours = (fields.days ?? 0) * 24 + (fields.hours ?? 0);
  const minutes = fields.minutes ?? 0;
  const seconds = fields.seconds ?? 0;
  const showHours = totalHours > 0;
  const numberFormatter = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });

  if (showHours) {
    return `${totalHours}:${numberFormatter.format(minutes)}:${numberFormatter.format(seconds)}`;
  }

  return `${minutes}:${numberFormatter.format(seconds)}`;
}

function resolveRangeStyle(start: number | Date, end: number | Date, options: RangeFormatOptions): 'number' | 'currency' | 'unit' | 'date' {
  if (options.style) {
    return options.style;
  }

  if (start instanceof Date || end instanceof Date) {
    return 'date';
  }

  if (options.currency) {
    return 'currency';
  }

  if (options.unit) {
    return 'unit';
  }

  return 'number';
}

function buildRangeNumberOptions(style: 'number' | 'currency' | 'unit', options: RangeFormatOptions): Intl.NumberFormatOptions {
  if (style === 'currency') {
    if (!options.currency) {
      throw new Error('formatRange(style=currency) requires a currency code');
    }

    return {
      ...options.numberOptions,
      style: 'currency',
      currency: options.currency,
    };
  }

  if (style === 'unit') {
    if (!options.unit) {
      throw new Error('formatRange(style=unit) requires a unit');
    }

    return {
      ...options.unitOptions,
      style: 'unit',
      unit: options.unit,
    };
  }

  return options.numberOptions ?? {};
}

function coerceNumber(value: number | Date): number {
  if (typeof value === 'number') {
    return value;
  }

  throw new TypeError('Numeric range formatting requires number values');
}
