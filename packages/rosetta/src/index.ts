/**
 * @celestial/rosetta — Internationalization, RTL, and bidi text support
 * for the Celestial TUI framework.
 *
 * Uses built-in Intl APIs for formatting and Corona width tables for
 * terminal cell measurement.
 */

// ── Bidi Algorithm ──────────────────────────────────────────────────────
export {
  reorderBidi,
  toBidiVisual,
  wrapBidi,
} from './bidi.js';
// ── Reactive Catalogs ───────────────────────────────────────────────────
export {
  catalogSub,
  createCatalogStore,
  getCatalog,
  setCatalog,
} from './catalog.js';
// ── Locale Context ──────────────────────────────────────────────────────
export type { LocaleContext, LocaleLike } from './context.js';
export { createLocaleContext, resolveLocale } from './context.js';
// ── Direction Detection ─────────────────────────────────────────────────
export {
  detectDirection,
  getCharBidiType,
  isLtrChar,
  isRtlChar,
} from './detect.js';

// ── Number / Date / Currency Formatting ─────────────────────────────────
export {
  createCollator,
  formatCompact,
  formatCompactCurrency,
  formatCompactMetric,
  formatCompactRelativeTime,
  formatCurrency,
  formatDate,
  formatDuration,
  formatList,
  formatNumber,
  formatOrdinal,
  formatRange,
  formatRelativeTime,
  formatUnit,
  relativeTimeInterval,
} from './format.js';

// ── Grapheme Segmentation ───────────────────────────────────────────────
export {
  graphemeLength,
  graphemeSlice,
  measureGraphemeWidth,
  measureTextWidth,
  segmentGraphemes,
  sliceTextByWidth,
  truncateText,
} from './grapheme.js';
// ── Message Formatting ─────────────────────────────────────────────────
export {
  formatMessage,
  translateMessage,
} from './message.js';
export type {
  CellTextAlign,
  CellTextOptions,
  DisplayLabelOptions,
  PadCellTextOptions,
  WrapCellTextOptions,
} from './terminal-text.js';
// ── Terminal Text Helpers ──────────────────────────────────────────────────
export {
  centerCellText,
  formatDisplayLabel,
  padCellText,
  truncateCellText,
  wrapCellText,
} from './terminal-text.js';
// ── Types ───────────────────────────────────────────────────────────────
export type {
  BidiCharType,
  BidiRun,
  CatalogStore,
  CompactFormatOptions,
  CompactRelativeTimeOptions,
  DateFormatOptions,
  Direction,
  DurationFormatStyle,
  FormatOptions,
  LocaleConfig,
  MessageCatalog,
  MessageKey,
  MessagePluralForm,
  MessageSource,
  RangeFormatOptions,
  ResolveLocaleOptions,
  UnitFormatOptions,
} from './types.js';
