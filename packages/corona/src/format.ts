/**
 * Corona Format Utilities
 *
 * Type detection, number formatting, and cell display helpers
 * for table/CSV rendering.
 */

// ─── Cell type detection ────────────────────────────────────────────────────

export type CellType = 'integer' | 'float' | 'string';

const INTEGER_RE = /^[+-]?\d+$/;
const FLOAT_RE = /^[+-]?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Detect the type of a single cell value */
export function detectType(value: string): CellType {
  const trimmed = value.trim();
  if (trimmed === '') return 'string';
  if (INTEGER_RE.test(trimmed)) return 'integer';
  if (FLOAT_RE.test(trimmed)) return 'float';
  return 'string';
}

/**
 * Detect the dominant type for a column of values.
 * If all non-empty values are numeric (integer or float), returns the most
 * specific numeric type. Mixed numeric types resolve to 'float'.
 * Any non-numeric value makes the whole column 'string'.
 */
export function detectColumnType(values: string[]): CellType {
  let hasInteger = false;
  let hasFloat = false;
  let count = 0;

  for (const v of values) {
    const trimmed = v.trim();
    if (trimmed === '') continue;
    count++;
    const t = detectType(trimmed);
    if (t === 'string') return 'string';
    if (t === 'integer') hasInteger = true;
    if (t === 'float') hasFloat = true;
  }

  if (count === 0) return 'string';
  if (hasFloat) return 'float';
  if (hasInteger) return 'integer';
  return 'string';
}

// ─── Number formatting ──────────────────────────────────────────────────────

/**
 * Format an integer string with thousand separators.
 * "1234567" → "1,234,567"
 */
export function formatInteger(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^([+-]?)(\d+)$/);
  if (!match) return value;
  const [, sign, digits] = match;
  const formatted = digits!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (sign ?? '') + formatted;
}

/**
 * Format a float string with fixed decimal places.
 * "3.14159" with digits=2 → "3.14"
 */
export function formatFloat(value: string, digits: number = 3): string {
  const trimmed = value.trim();
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return value;
  // Format with fixed decimals and add thousand separators to integer part
  const fixed = num.toFixed(digits);
  const dotIdx = fixed.indexOf('.');
  if (dotIdx === -1) {
    // No decimal part (digits === 0)
    const sign = fixed.startsWith('-') ? '-' : '';
    const absInt = fixed.replace(/^-/, '');
    return sign + absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const intPart = fixed.slice(0, dotIdx);
  const decPart = fixed.slice(dotIdx + 1);
  const sign = intPart.startsWith('-') ? '-' : '';
  const absInt = intPart.replace(/^-/, '');
  const formattedInt = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + formattedInt + '.' + decPart;
}

export interface FormatOptions {
  digits?: number;
  placeholder?: string;
}

/**
 * Format a cell value according to its detected type.
 */
export function formatCell(value: string, type: CellType, options: FormatOptions = {}): string {
  const trimmed = value.trim();
  if (trimmed === '') return options.placeholder ?? '—';
  switch (type) {
    case 'integer':
      return formatInteger(trimmed);
    case 'float':
      return formatFloat(trimmed, options.digits ?? 3);
    case 'string':
      return trimmed;
  }
}

/**
 * Return a display value, substituting a placeholder for empty cells.
 */
export function displayValue(value: string, placeholder: string = '—'): string {
  return value.trim() === '' ? placeholder : value;
}

/**
 * Determine the appropriate alignment for a cell type.
 * Numbers align right, strings align left.
 */
export function alignmentForType(type: CellType): 'left' | 'right' {
  return type === 'string' ? 'left' : 'right';
}
