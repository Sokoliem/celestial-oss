/**
 * Math unicode tests (A3)
 */

import { describe, expect, it } from 'vitest';
import { mathToUnicode } from '../math-unicode.js';

describe('mathToUnicode', () => {
  it('converts simple symbols', () => {
    expect(mathToUnicode('\\pi')).toBe('π');
    expect(mathToUnicode('\\alpha')).toBe('α');
    expect(mathToUnicode('\\times')).toBe('×');
    expect(mathToUnicode('\\infty')).toBe('∞');
  });

  it('converts superscripts', () => {
    expect(mathToUnicode('x^2')).toBe('x²');
    expect(mathToUnicode('x^{2}')).toBe('x²');
    expect(mathToUnicode('n^{th}')).toBe('nᵗʰ');
  });

  it('converts subscripts', () => {
    expect(mathToUnicode('a_1')).toBe('a₁');
    expect(mathToUnicode('a_{ij}')).toBe('aᵢⱼ');
  });

  it('converts sqrt', () => {
    expect(mathToUnicode('\\sqrt{x}')).toBe('√x');
    expect(mathToUnicode('\\sqrt{2}')).toBe('√2');
  });

  it('converts fractions', () => {
    expect(mathToUnicode('\\frac{1}{2}')).toBe('½');
    expect(mathToUnicode('\\frac{3}{4}')).toBe('¾');
    expect(mathToUnicode('\\frac{a}{b}')).toBe('a⁄b');
  });

  it('converts combined expressions', () => {
    expect(mathToUnicode('x^2 + y^2')).toBe('x² + y²');
    expect(mathToUnicode('E = mc^2')).toBe('E = mc²');
  });

  it('returns null for unsupported constructs', () => {
    expect(mathToUnicode('\\begin{matrix}\\end{matrix}')).toBeNull();
    expect(mathToUnicode('\\hat{x}')).toBeNull();
  });

  it('returns null for unbalanced braces', () => {
    expect(mathToUnicode('x^{2')).toBeNull();
    expect(mathToUnicode('x^}2{')).toBeNull();
  });

  it('returns null for unknown commands', () => {
    expect(mathToUnicode('\\unknown')).toBeNull();
  });

  it('handles empty string', () => {
    expect(mathToUnicode('')).toBe('');
  });
});
