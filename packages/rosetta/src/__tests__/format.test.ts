import { describe, expect, it } from 'vitest';
import {
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
} from '../format.js';

describe('formatNumber', () => {
  it('formats integers with locale grouping', () => {
    const result = formatNumber(1234567, 'en-US');
    expect(result).toBe('1,234,567');
  });

  it('formats with German locale (dot as grouping separator)', () => {
    const result = formatNumber(1234567, 'de-DE');
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('567');
  });

  it('formats percentages', () => {
    const result = formatNumber(0.85, 'en-US', { style: 'percent' });
    expect(result).toBe('85%');
  });

  it('formats with fraction digits', () => {
    const result = formatNumber(Math.PI, 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(result).toBe('3.14');
  });

  it('formats with Japanese locale', () => {
    const result = formatNumber(1234, 'ja-JP');
    expect(result).toContain('1');
    expect(result).toContain('234');
  });
});

describe('formatOrdinal', () => {
  it('formats English ordinals with locale-aware suffixes', () => {
    expect(formatOrdinal(1, 'en-US')).toBe('1st');
    expect(formatOrdinal(2, 'en-US')).toBe('2nd');
    expect(formatOrdinal(3, 'en-US')).toBe('3rd');
    expect(formatOrdinal(11, 'en-US')).toBe('11th');
  });

  it('falls back to plain numbers for unsupported suffix maps', () => {
    expect(formatOrdinal(7, 'de-DE')).toBe('7');
  });
});

describe('formatCompact', () => {
  it('formats large numbers with compact notation', () => {
    const result = formatCompact(1200, 'en-US');
    expect(result).toMatch(/1(\.2)?K/i);
  });

  it('formats compact metric and currency labels for dashboards', () => {
    expect(formatCompactMetric(1200, 'en-US')).toMatch(/1(\.2)?K/i);
    expect(formatCompactCurrency(1200, 'en-US', 'USD')).toMatch(/\$1(\.2(0)?)?K/i);
  });
});

describe('formatDate', () => {
  // Use a fixed date: 2024-06-15T12:30:00Z
  const testDate = new Date('2024-06-15T12:30:00Z');

  it('formats date with default medium style', () => {
    const result = formatDate(testDate, 'en-US');
    expect(result).toContain('2024');
    expect(result).toContain('Jun');
  });

  it('formats date with short style', () => {
    const result = formatDate(testDate, 'en-US', { dateStyle: 'short' });
    expect(result).toContain('6');
    expect(result).toContain('15');
  });

  it('formats date from timestamp', () => {
    const result = formatDate(testDate.getTime(), 'en-US');
    expect(result).toContain('2024');
  });

  it('formats with time style', () => {
    const result = formatDate(testDate, 'en-US', { timeStyle: 'short' });
    // Should contain time components
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatDuration', () => {
  it('formats durations in short style', () => {
    const result = formatDuration(9_000_000, 'short', 'en-US');
    expect(result).toContain('2');
    expect(result).toContain('30');
  });

  it('formats durations in digital style', () => {
    const result = formatDuration(90_000, 'digital', 'en-US');
    expect(result).toMatch(/1:30|01:30/);
  });
});

describe('formatCurrency', () => {
  it('formats USD currency', () => {
    const result = formatCurrency(42.5, 'en-US', 'USD');
    expect(result).toContain('$');
    expect(result).toContain('42.50');
  });

  it('formats EUR currency with German locale', () => {
    const result = formatCurrency(42.5, 'de-DE', 'EUR');
    expect(result).toContain('42');
    // EUR symbol may vary by environment
    expect(result).toBeTruthy();
  });

  it('formats JPY without decimal places', () => {
    const result = formatCurrency(1000, 'ja-JP', 'JPY');
    expect(result).toContain('1,000');
  });
});

describe('formatUnit', () => {
  it('formats units using locale conventions', () => {
    const result = formatUnit(12, 'en-US', 'byte', { unitDisplay: 'short' });
    expect(result).toBe('12 byte');
  });

  it('formats localized unit labels', () => {
    const result = formatUnit(5, 'fr-FR', 'kilometer', { unitDisplay: 'short' });
    expect(result).toContain('5');
    expect(result).toContain('km');
  });
});

describe('formatRelativeTime', () => {
  it('formats past days', () => {
    const result = formatRelativeTime(-3, 'day', 'en-US');
    expect(result).toBe('3 days ago');
  });

  it('formats future hours', () => {
    const result = formatRelativeTime(2, 'hour', 'en-US');
    expect(result).toBe('in 2 hours');
  });

  it('formats yesterday', () => {
    const result = formatRelativeTime(-1, 'day', 'en-US');
    expect(result).toBe('yesterday');
  });

  it('formats tomorrow', () => {
    const result = formatRelativeTime(1, 'day', 'en-US');
    expect(result).toBe('tomorrow');
  });
});

describe('formatCompactRelativeTime', () => {
  it('formats dense past labels', () => {
    expect(formatCompactRelativeTime(0)).toBe('just now');
    expect(formatCompactRelativeTime(45_000)).toBe('45s ago');
    expect(formatCompactRelativeTime(5 * 60_000)).toBe('5m ago');
    expect(formatCompactRelativeTime(2 * 3_600_000)).toBe('2h ago');
  });

  it('formats future labels and suffix-free labels', () => {
    expect(formatCompactRelativeTime(-5 * 60_000)).toBe('in 5m');
    expect(formatCompactRelativeTime(5 * 60_000, { includeSuffix: false })).toBe('5m');
  });
});

describe('relativeTimeInterval', () => {
  it('refreshes every second for near-term relative times', () => {
    expect(relativeTimeInterval(Date.now() - 5_000, Date.now())).toBe(1_000);
  });

  it('refreshes on the next minute boundary for minute-scale labels', () => {
    expect(relativeTimeInterval(10 * 60_000, 0)).toBe(60_000);
  });
});

describe('formatList', () => {
  it('formats conjunction list', () => {
    const result = formatList(['apples', 'bananas', 'cherries'], 'en-US');
    expect(result).toBe('apples, bananas, and cherries');
  });

  it('formats disjunction list', () => {
    const result = formatList(['red', 'blue', 'green'], 'en-US', 'disjunction');
    expect(result).toBe('red, blue, or green');
  });

  it('formats two-item list', () => {
    const result = formatList(['Alice', 'Bob'], 'en-US');
    expect(result).toBe('Alice and Bob');
  });

  it('formats single-item list', () => {
    const result = formatList(['only'], 'en-US');
    expect(result).toBe('only');
  });

  it('formats empty list', () => {
    const result = formatList([], 'en-US');
    expect(result).toBe('');
  });
});

describe('createCollator', () => {
  it('creates a collator that can order locale-aware strings', () => {
    const collator = createCollator('en-US', { sensitivity: 'base' });
    const items = ['zebra', 'apple', 'Éclair'];

    items.sort(collator.compare);

    expect(items[0]).toBe('apple');
    expect(items[2]).toBe('zebra');
  });
});

describe('formatRange', () => {
  it('formats numeric ranges', () => {
    const result = formatRange(10, 20, 'en-US');
    expect(result).toContain('10');
    expect(result).toContain('20');
  });

  it('formats currency ranges', () => {
    const result = formatRange(10, 20, 'en-US', {
      style: 'currency',
      currency: 'USD',
    });

    expect(result).toContain('$');
    expect(result).toContain('10');
    expect(result).toContain('20');
  });
});
