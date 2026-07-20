import { text } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { formField } from '../form-field.js';

/**
 * Recursively collect all text content strings from a VNode tree.
 */
function collectText(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as { kind?: string; content?: unknown; children?: unknown[] };
  if (n.kind === 'text') return [String(n.content ?? '')];
  if (!Array.isArray(n.children)) return [];
  return n.children.flatMap((c) => collectText(c));
}

/**
 * Find the style attached to a text node whose content matches the given string.
 */
function findStyleForText(node: unknown, content: string): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as { kind?: string; content?: unknown; style?: Record<string, unknown>; children?: unknown[] };
  if (n.kind === 'text' && String(n.content ?? '') === content) return n.style;
  if (!Array.isArray(n.children)) return undefined;
  for (const c of n.children) {
    const found = findStyleForText(c, content);
    if (found) return found;
  }
  return undefined;
}

/**
 * Collect the content strings from the top-level column children in order.
 * Returns an array of arrays, where each sub-array represents one column child's text.
 */
function collectColumnRows(node: unknown): string[][] {
  if (!node || typeof node !== 'object') return [];
  const n = node as { kind?: string; children?: unknown[] };
  if (n.kind !== 'column' || !Array.isArray(n.children)) return [];
  return n.children.map((child) => collectText(child));
}

const placeholder = text('input-placeholder');

describe('formField enhanced features', () => {
  // --- Existing behavior preservation ---

  it('preserves existing label rendering', () => {
    const result = formField({ label: 'Username', child: placeholder });
    const texts = collectText(result);
    expect(texts.some((t) => t === 'Username')).toBe(true);
  });

  it('preserves required asterisk rendering', () => {
    const result = formField({ label: 'Email', required: true, child: placeholder });
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('*'))).toBe(true);
  });

  it('preserves error gutter and message', () => {
    const result = formField({ label: 'Field', error: 'Bad value', child: placeholder });
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('│'))).toBe(true);
    expect(texts.some((t) => t === 'Bad value')).toBe(true);
  });

  it('preserves hint text rendering', () => {
    const result = formField({ label: 'Field', hint: 'Enter a value', child: placeholder });
    const texts = collectText(result);
    expect(texts.some((t) => t === 'Enter a value')).toBe(true);
  });

  // --- Success message ---

  it('renders success message in green when no error', () => {
    const result = formField({
      label: 'Username',
      success: 'Valid username',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t === 'Valid username')).toBe(true);

    const successStyle = findStyleForText(result, 'Valid username');
    expect(successStyle).toBeDefined();
    // Green color means fg is set (not dim — success uses color.green without dim)
    expect(successStyle?.fg).toBeDefined();
  });

  // --- Warning message ---

  it('renders warning message in yellow when no error', () => {
    const result = formField({
      label: 'Username',
      warning: 'Username is common',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t === 'Username is common')).toBe(true);

    const warningStyle = findStyleForText(result, 'Username is common');
    expect(warningStyle).toBeDefined();
    expect(warningStyle?.dim).toBe(true);
  });

  // --- Error takes priority over warning and success ---

  it('error takes priority over warning and success', () => {
    const result = formField({
      label: 'Email',
      error: 'Invalid email',
      warning: 'Warning message',
      success: 'Success message',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t === 'Invalid email')).toBe(true);
    expect(texts.some((t) => t === 'Warning message')).toBe(false);
    expect(texts.some((t) => t === 'Success message')).toBe(false);
  });

  // --- Character count ---

  it('renders charCount as current/max', () => {
    const result = formField({
      label: 'Bio',
      charCount: { current: 5, max: 100 },
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t === '5/100')).toBe(true);
  });

  it('renders charCount red and bold when over limit', () => {
    const result = formField({
      label: 'Bio',
      charCount: { current: 150, max: 100 },
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t === '150/100')).toBe(true);

    const countStyle = findStyleForText(result, '150/100');
    expect(countStyle).toBeDefined();
    expect(countStyle?.bold).toBe(true);
    // Should have a red fg color
    expect(countStyle?.fg).toBeDefined();
  });

  // --- Validation state indicators ---

  it('shows green checkmark for validationState valid', () => {
    const result = formField({
      label: 'Username',
      validationState: 'valid',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('✓'))).toBe(true);

    const checkStyle = findStyleForText(result, ' ✓');
    expect(checkStyle).toBeDefined();
    expect(checkStyle?.fg).toBeDefined();
  });

  it('shows red X for validationState invalid', () => {
    const result = formField({
      label: 'Username',
      validationState: 'invalid',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('✗'))).toBe(true);

    const xStyle = findStyleForText(result, ' ✗');
    expect(xStyle).toBeDefined();
    expect(xStyle?.fg).toBeDefined();
  });

  it('shows spinner for validationState validating', () => {
    const result = formField({
      label: 'Username',
      validationState: 'validating',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('⟳'))).toBe(true);

    const spinStyle = findStyleForText(result, ' ⟳');
    expect(spinStyle).toBeDefined();
    expect(spinStyle?.dim).toBe(true);
  });

  it('shows no indicator for validationState idle', () => {
    const result = formField({
      label: 'Username',
      validationState: 'idle',
      child: placeholder,
    });
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('✓'))).toBe(false);
    expect(texts.some((t) => t.includes('✗'))).toBe(false);
    expect(texts.some((t) => t.includes('⟳'))).toBe(false);
  });

  // --- Help text ---

  it('renders helpText as last row and always visible', () => {
    const result = formField({
      label: 'Username',
      hint: 'Some hint',
      helpText: 'Choose a unique username',
      child: placeholder,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Choose a unique username')).toBe(true);
    // Hint should also be visible
    expect(texts.some((t) => t === 'Some hint')).toBe(true);

    // helpText should be the last child of the column
    const rows = collectColumnRows(result);
    const lastRow = rows[rows.length - 1];
    expect(lastRow).toBeDefined();
    expect(lastRow!.some((t) => t === 'Choose a unique username')).toBe(true);
  });

  // --- Disabled state ---

  it('disabled renders label dim without focused color', () => {
    const result = formField({
      label: 'Username',
      focused: true,
      disabled: true,
      child: placeholder,
    });

    const labelStyle = findStyleForText(result, 'Username');
    expect(labelStyle).toBeDefined();
    expect(labelStyle?.bold).toBe(true);
    expect(labelStyle?.dim).toBe(true);
    // Should NOT have cyan fg when disabled, even if focused
    expect(labelStyle?.fg).toBeUndefined();
    expect(labelStyle?.fgRgb).toBeUndefined();
  });

  // --- Green gutter when valid and no error ---

  it('renders green gutter when validationState is valid and no error', () => {
    const result = formField({
      label: 'Username',
      validationState: 'valid',
      child: placeholder,
    });

    const texts = collectText(result);
    // Should have a gutter character
    expect(texts.some((t) => t.includes('│'))).toBe(true);

    // The gutter should be green (has fg set, not red)
    const gutterStyle = findStyleForText(result, '│ ');
    expect(gutterStyle).toBeDefined();
    expect(gutterStyle?.fg).toBeDefined();
  });

  // --- Yellow gutter when warning and no error ---

  it('renders yellow gutter when warning is present and no error', () => {
    const result = formField({
      label: 'Username',
      warning: 'Username is common',
      child: placeholder,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t.includes('│'))).toBe(true);

    const gutterStyle = findStyleForText(result, '│ ');
    expect(gutterStyle).toBeDefined();
    expect(gutterStyle?.fg).toBeDefined();
  });

  // --- charCount and error coexist ---

  it('charCount and error coexist on the same message row', () => {
    const result = formField({
      label: 'Bio',
      error: 'Too long',
      charCount: { current: 250, max: 200 },
      child: placeholder,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Too long')).toBe(true);
    expect(texts.some((t) => t === '250/200')).toBe(true);
  });

  // --- Warning priority over success and hint ---

  it('warning takes priority over success and hint', () => {
    const result = formField({
      label: 'Field',
      warning: 'Watch out',
      success: 'All good',
      hint: 'Some hint',
      child: placeholder,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Watch out')).toBe(true);
    expect(texts.some((t) => t === 'All good')).toBe(false);
    // Hint is also suppressed when warning is present
    expect(texts.some((t) => t === 'Some hint')).toBe(false);
  });

  // --- Success priority over hint ---

  it('success takes priority over hint', () => {
    const result = formField({
      label: 'Field',
      success: 'All good',
      hint: 'Some hint',
      child: placeholder,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'All good')).toBe(true);
    expect(texts.some((t) => t === 'Some hint')).toBe(false);
  });

  // --- Disabled required asterisk is gray ---

  it('renders required asterisk in gray when disabled', () => {
    const result = formField({
      label: 'Email',
      required: true,
      disabled: true,
      child: placeholder,
    });

    // The asterisk text should be present and styled with gray
    const texts = collectText(result);
    expect(texts.some((t) => t.includes('*'))).toBe(true);
  });

  // --- charCount renders dim when under limit ---

  it('renders charCount dim when under limit', () => {
    const result = formField({
      label: 'Bio',
      charCount: { current: 10, max: 100 },
      child: placeholder,
    });

    const countStyle = findStyleForText(result, '10/100');
    expect(countStyle).toBeDefined();
    expect(countStyle?.dim).toBe(true);
    expect(countStyle?.bold).toBeUndefined();
  });
});
