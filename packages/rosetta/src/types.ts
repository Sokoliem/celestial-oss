/**
 * @celestial/rosetta — Type definitions for i18n, RTL, and bidi text support.
 */

/** Text flow direction. */
export type Direction = 'ltr' | 'rtl' | 'auto';

/** Plural form following CLDR categories. */
export interface MessagePluralForm {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** A catalog of translatable messages keyed by identifier. */
export interface MessageCatalog {
  [key: string]: string | MessagePluralForm;
}

/** Narrow string keys from a catalog for compile-time translation safety. */
export type MessageKey<TCatalog extends MessageCatalog> = [Extract<keyof TCatalog, string>] extends [never] ? string : Extract<keyof TCatalog, string>;

/** Mutable catalog source used for hot-reloading translations at runtime. */
export interface CatalogStore<TCatalog extends MessageCatalog = MessageCatalog> {
  getCatalog(): TCatalog;
  setCatalog(catalog: TCatalog): void;
  subscribe(listener: (catalog: TCatalog) => void): () => void;
}

/** A locale message source may be a static object or a reactive store. */
export type MessageSource<TCatalog extends MessageCatalog = MessageCatalog> = TCatalog | CatalogStore<TCatalog>;

/** Configuration for a single locale. */
export interface LocaleConfig<TCatalog extends MessageCatalog = MessageCatalog> {
  lang: string;
  dir: Direction;
  messages?: MessageSource<TCatalog>;
}

/** A run of text with a resolved bidi embedding level. */
export interface BidiRun {
  text: string;
  level: number;
  start: number;
  end: number;
}

/** Options for number formatting. */
export type FormatOptions = Intl.NumberFormatOptions;

/** Options for compact number formatting. */
export type CompactFormatOptions = Omit<Intl.NumberFormatOptions, 'notation'>;

/** Options for compact relative-time labels used in dense terminal UIs. */
export interface CompactRelativeTimeOptions {
  nowLabel?: string;
  pastSuffix?: string;
  futurePrefix?: string;
  includeSuffix?: boolean;
}

/** Options for unit formatting. */
export type UnitFormatOptions = Omit<Intl.NumberFormatOptions, 'style' | 'unit'>;

/** Options for date/time formatting. */
export type DateFormatOptions = Intl.DateTimeFormatOptions;

/** Duration formatting styles supported by Rosetta. */
export type DurationFormatStyle = 'long' | 'short' | 'narrow' | 'digital';

/** Supported range formatting modes. */
export type RangeFormatStyle = 'number' | 'currency' | 'unit' | 'date';

/** Options for number/date/unit/currency range formatting. */
export interface RangeFormatOptions {
  style?: RangeFormatStyle;
  currency?: string;
  unit?: Intl.NumberFormatOptions['unit'];
  numberOptions?: FormatOptions;
  unitOptions?: UnitFormatOptions;
  dateOptions?: DateFormatOptions;
}

/** Options for resolving a locale into a stable context. */
export interface ResolveLocaleOptions<TCatalog extends MessageCatalog = MessageCatalog> {
  defaultLocale?: string;
  fallbackLocale?: string;
  supportedLocales?: readonly string[];
  dir?: Direction;
  messages?: MessageSource<TCatalog>;
}

/**
 * Unicode Bidirectional character type (UAX #9).
 * Covers strong, weak, neutral, and explicit directional categories.
 */
export type BidiCharType =
  | 'L' // Left-to-Right
  | 'R' // Right-to-Left
  | 'AL' // Arabic Letter
  | 'AN' // Arabic Number
  | 'EN' // European Number
  | 'ES' // European Separator
  | 'ET' // European Terminator
  | 'CS' // Common Separator
  | 'NSM' // Nonspacing Mark
  | 'BN' // Boundary Neutral
  | 'B' // Paragraph Separator
  | 'S' // Segment Separator
  | 'WS' // Whitespace
  | 'ON' // Other Neutral
  | 'LRE' // Left-to-Right Embedding
  | 'LRO' // Left-to-Right Override
  | 'RLE' // Right-to-Left Embedding
  | 'RLO' // Right-to-Left Override
  | 'PDF' // Pop Directional Formatting
  | 'LRI' // Left-to-Right Isolate
  | 'RLI' // Right-to-Left Isolate
  | 'FSI' // First Strong Isolate
  | 'PDI'; // Pop Directional Isolate
