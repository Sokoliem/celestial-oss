import { describe, expect, it } from 'vitest';
import { alignmentForType, detectColumnType, detectType, displayValue, formatCell, formatFloat, formatInteger } from '../format.js';

describe('format', () => {
  describe('detectType', () => {
    it('should detect integers', () => {
      expect(detectType('42')).toBe('integer');
      expect(detectType('-100')).toBe('integer');
      expect(detectType('+0')).toBe('integer');
      expect(detectType('1234567890')).toBe('integer');
    });

    it('should detect floats', () => {
      expect(detectType('3.14')).toBe('float');
      expect(detectType('-0.5')).toBe('float');
      expect(detectType('.123')).toBe('float');
      expect(detectType('1.0e10')).toBe('float');
      expect(detectType('2.5E-3')).toBe('float');
    });

    it('should detect strings', () => {
      expect(detectType('hello')).toBe('string');
      expect(detectType('12abc')).toBe('string');
      expect(detectType('')).toBe('string');
      expect(detectType('  ')).toBe('string');
    });
  });

  describe('detectColumnType', () => {
    it('should detect integer column', () => {
      expect(detectColumnType(['1', '2', '3', '100'])).toBe('integer');
    });

    it('should detect float column', () => {
      expect(detectColumnType(['1.5', '2.3', '3.7'])).toBe('float');
    });

    it('should promote mixed int/float to float', () => {
      expect(detectColumnType(['1', '2.5', '3'])).toBe('float');
    });

    it('should return string if any non-numeric value', () => {
      expect(detectColumnType(['1', '2', 'abc'])).toBe('string');
    });

    it('should ignore empty values', () => {
      expect(detectColumnType(['1', '', '3', '  '])).toBe('integer');
    });

    it('should return string for all-empty column', () => {
      expect(detectColumnType(['', '', ''])).toBe('string');
    });
  });

  describe('formatInteger', () => {
    it('should add thousand separators', () => {
      expect(formatInteger('1234567')).toBe('1,234,567');
      expect(formatInteger('100')).toBe('100');
      expect(formatInteger('1000')).toBe('1,000');
    });

    it('should handle negative numbers', () => {
      expect(formatInteger('-1234567')).toBe('-1,234,567');
    });

    it('should return unchanged for non-integer', () => {
      expect(formatInteger('abc')).toBe('abc');
    });
  });

  describe('formatFloat', () => {
    it('should format with default 3 decimal places', () => {
      expect(formatFloat('3.14159')).toBe('3.142');
    });

    it('should format with custom decimal places', () => {
      expect(formatFloat('3.14159', 2)).toBe('3.14');
      expect(formatFloat('3.14159', 0)).toBe('3');
    });

    it('should add thousand separators to integer part', () => {
      expect(formatFloat('1234567.89', 2)).toBe('1,234,567.89');
    });
  });

  describe('formatCell', () => {
    it('should format integers', () => {
      expect(formatCell('1234567', 'integer')).toBe('1,234,567');
    });

    it('should format floats', () => {
      expect(formatCell('3.14159', 'float', { digits: 2 })).toBe('3.14');
    });

    it('should return placeholder for empty cells', () => {
      expect(formatCell('', 'string')).toBe('—');
      expect(formatCell('  ', 'integer', { placeholder: '-' })).toBe('-');
    });

    it('should pass strings through', () => {
      expect(formatCell('hello', 'string')).toBe('hello');
    });
  });

  describe('displayValue', () => {
    it('should substitute placeholder for empty values', () => {
      expect(displayValue('')).toBe('—');
      expect(displayValue('  ')).toBe('—');
    });

    it('should return non-empty values as-is', () => {
      expect(displayValue('hello')).toBe('hello');
    });

    it('should accept custom placeholder', () => {
      expect(displayValue('', 'N/A')).toBe('N/A');
    });
  });

  describe('alignmentForType', () => {
    it('should return right for numeric types', () => {
      expect(alignmentForType('integer')).toBe('right');
      expect(alignmentForType('float')).toBe('right');
    });

    it('should return left for string type', () => {
      expect(alignmentForType('string')).toBe('left');
    });
  });
});
