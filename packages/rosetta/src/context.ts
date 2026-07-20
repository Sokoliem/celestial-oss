/**
 * @celestial/rosetta — Locale context for i18n-aware TUI applications.
 *
 * Creates a unified context object that bundles direction detection,
 * message translation, number/date formatting, and bidi reordering
 * under a single locale-scoped interface.
 */

import { toBidiVisual, wrapBidi } from './bidi.js';
import { isCatalogStore } from './catalog.js';
import {
  createCollator,
  formatCompact as fmtCompact,
  formatCurrency as fmtCurrency,
  formatDate as fmtDate,
  formatDuration as fmtDuration,
  formatNumber as fmtNum,
  formatOrdinal as fmtOrdinal,
  formatRange as fmtRange,
  formatUnit as fmtUnit,
} from './format.js';
import { translateMessage } from './message.js';
import type {
  CompactFormatOptions,
  DateFormatOptions,
  Direction,
  DurationFormatStyle,
  FormatOptions,
  LocaleConfig,
  MessageCatalog,
  MessageKey,
  MessageSource,
  RangeFormatOptions,
  ResolveLocaleOptions,
  UnitFormatOptions,
} from './types.js';

/**
 * A locale-scoped context providing translation, formatting, and
 * bidi reordering capabilities.
 */
export interface LocaleContext<TCatalog extends MessageCatalog = MessageCatalog> {
  /** Resolved text direction for this locale. */
  readonly dir: Direction;
  /** BCP 47 language tag for this locale. */
  readonly lang: string;

  /**
   * Translate a message key using the locale's message catalog.
   * Falls back to the key itself if not found.
   *
   * @param key    - Message catalog key
   * @param values - Substitution values for ICU format
   * @returns The translated and formatted string
   */
  t(key: MessageKey<TCatalog>, values?: Record<string, unknown>): string;

  /**
   * Format a number according to this locale's conventions.
   */
  formatNumber(value: number, options?: FormatOptions): string;

  /**
   * Format an ordinal number according to this locale's conventions.
   */
  formatOrdinal(value: number): string;

  /**
   * Format a number using compact notation.
   */
  formatCompact(value: number, options?: CompactFormatOptions): string;

  /**
   * Format a date according to this locale's conventions.
   */
  formatDate(value: Date | number, options?: DateFormatOptions): string;

  /**
   * Format a monetary value with currency symbol.
   */
  formatCurrency(value: number, currency: string): string;

  /**
   * Format a value with a locale-aware unit label.
   */
  formatUnit(value: number, unit: Intl.NumberFormatOptions['unit'], options?: UnitFormatOptions): string;

  /**
   * Format a duration value in milliseconds.
   */
  formatDuration(value: number, style?: DurationFormatStyle): string;

  /**
   * Format a numeric or date range.
   */
  formatRange(start: number | Date, end: number | Date, options?: RangeFormatOptions): string;

  /**
   * Create a locale-aware collator for sorting and equality checks.
   */
  createCollator(options?: Intl.CollatorOptions): Intl.Collator;

  /**
   * Apply bidi reordering to text for visual display.
   * Converts logical-order text to visual-order based on the
   * locale's direction.
   */
  reorderBidi(text: string): string;

  /**
   * Wrap logical text into width-constrained visual lines.
   */
  wrapBidi(text: string, width: number): string[];
}

/**
 * Create a locale context with the given configuration.
 *
 * @param config - Locale configuration including language, direction, and optional message catalog
 * @returns A fully configured LocaleContext
 */
export function createLocaleContext<TCatalog extends MessageCatalog>(config: LocaleConfig<TCatalog>): LocaleContext<TCatalog> {
  const { lang, dir, messages } = config;

  // Resolve 'auto' direction based on the language tag
  const resolvedDir: Direction = dir === 'auto' ? (isRtlLanguage(lang) ? 'rtl' : 'ltr') : dir;

  return {
    dir: resolvedDir,
    lang,

    t(key: MessageKey<TCatalog>, values?: Record<string, unknown>): string {
      const catalog = resolveCatalog(messages);
      if (!catalog) return key;
      return translateMessage(catalog, key, values, lang);
    },

    formatNumber(value: number, options?: FormatOptions): string {
      return fmtNum(value, lang, options);
    },

    formatOrdinal(value: number): string {
      return fmtOrdinal(value, lang);
    },

    formatCompact(value: number, options?: CompactFormatOptions): string {
      return fmtCompact(value, lang, options);
    },

    formatDate(value: Date | number, options?: DateFormatOptions): string {
      return fmtDate(value, lang, options);
    },

    formatCurrency(value: number, currency: string): string {
      return fmtCurrency(value, lang, currency);
    },

    formatUnit(value: number, unit: Intl.NumberFormatOptions['unit'], options?: UnitFormatOptions): string {
      return fmtUnit(value, lang, unit, options);
    },

    formatDuration(value: number, style?: DurationFormatStyle): string {
      return fmtDuration(value, style, lang);
    },

    formatRange(start: number | Date, end: number | Date, options?: RangeFormatOptions): string {
      return fmtRange(start, end, lang, options);
    },

    createCollator(options?: Intl.CollatorOptions): Intl.Collator {
      return createCollator(lang, options);
    },

    reorderBidi(text: string): string {
      return toBidiVisual(text, resolvedDir);
    },

    wrapBidi(text: string, width: number): string[] {
      return wrapBidi(text, width, resolvedDir);
    },
  };
}

export type LocaleLike<TCatalog extends MessageCatalog = MessageCatalog> = string | LocaleConfig<TCatalog> | LocaleContext<TCatalog> | undefined;

/**
 * Resolve a locale-like input into a stable locale context.
 *
 * @param locale - Locale tag, config, or an existing locale context
 * @param options - Resolution options and supported locale constraints
 * @returns A locale context suitable for rendering and formatting
 */
export function resolveLocale<TCatalog extends MessageCatalog>(
  locale?: LocaleLike<TCatalog>,
  options: ResolveLocaleOptions<TCatalog> = {},
): LocaleContext<TCatalog> {
  if (isLocaleContext(locale)) {
    return locale;
  }

  if (isLocaleConfig(locale)) {
    return createLocaleContext(locale);
  }

  const supportedLocales = options.supportedLocales;
  const fallbackLocale = options.fallbackLocale ?? options.defaultLocale ?? 'en-US';
  const requestedLocale = locale ?? options.defaultLocale ?? getSystemLocale();
  const lang = supportedLocales?.length ? resolveSupportedLocale(requestedLocale, supportedLocales, fallbackLocale) : requestedLocale;

  return createLocaleContext({
    lang,
    dir: options.dir ?? 'auto',
    messages: options.messages,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Common RTL language codes (ISO 639-1 and IETF subtags). */
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'he', // Hebrew
  'iw', // Hebrew (legacy)
  'fa', // Persian
  'ur', // Urdu
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'yi', // Yiddish
  'syr', // Syriac
  'dv', // Dhivehi
  'ks', // Kashmiri
  'ku', // Kurdish (when in Arabic script)
  'ckb', // Central Kurdish
  'arc', // Aramaic
]);

/**
 * Check if a language tag represents an RTL language.
 * Extracts the primary language subtag and checks against known RTL languages.
 */
function isRtlLanguage(lang: string): boolean {
  const primary = lang.split('-')[0]!.toLowerCase();
  return RTL_LANGUAGES.has(primary);
}

function getSystemLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

function isLocaleContext<TCatalog extends MessageCatalog>(locale: LocaleLike<TCatalog>): locale is LocaleContext<TCatalog> {
  return typeof locale === 'object' && locale !== null && 'formatNumber' in locale && 'reorderBidi' in locale;
}

function isLocaleConfig<TCatalog extends MessageCatalog>(locale: LocaleLike<TCatalog>): locale is LocaleConfig<TCatalog> {
  return typeof locale === 'object' && locale !== null && 'lang' in locale && 'dir' in locale;
}

function resolveCatalog<TCatalog extends MessageCatalog>(messages?: MessageSource<TCatalog>): TCatalog | undefined {
  if (!messages) {
    return undefined;
  }

  if (isCatalogStore(messages)) {
    return messages.getCatalog();
  }

  return messages;
}

function resolveSupportedLocale(requestedLocale: string, supportedLocales: readonly string[], fallbackLocale: string): string {
  const requested = canonicalizeLocale(requestedLocale);
  const fallback = canonicalizeLocale(fallbackLocale);
  const canonicalSupported = supportedLocales.map((locale) => canonicalizeLocale(locale));

  const exactMatch = canonicalSupported.find((locale) => locale.toLowerCase() === requested.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  const requestedLanguage = requested.split('-')[0]!.toLowerCase();
  const languageMatch = canonicalSupported.find((locale) => locale.split('-')[0]!.toLowerCase() === requestedLanguage);
  if (languageMatch) {
    return languageMatch;
  }

  const fallbackMatch = canonicalSupported.find((locale) => locale.toLowerCase() === fallback.toLowerCase());
  if (fallbackMatch) {
    return fallbackMatch;
  }

  return canonicalSupported[0] ?? fallback;
}

function canonicalizeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    return locale;
  }
}
