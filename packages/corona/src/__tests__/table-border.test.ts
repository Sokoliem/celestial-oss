import { describe, expect, it } from 'vitest';
import { getTableBorder, listTableBorders, renderTableGrid, tableBorder } from '../table-border.js';

describe('table-border', () => {
  describe('tableBorder presets', () => {
    it('should have 18 named styles', () => {
      const names = listTableBorders();
      expect(names.length).toBeGreaterThanOrEqual(18);
    });

    it('should have rounded style with correct corner chars', () => {
      expect(tableBorder.rounded.chars.topLeft).toBe('╭');
      expect(tableBorder.rounded.chars.topRight).toBe('╮');
      expect(tableBorder.rounded.chars.bottomLeft).toBe('╰');
      expect(tableBorder.rounded.chars.bottomRight).toBe('╯');
      expect(tableBorder.rounded.chars.cross).toBe('┼');
    });

    it('should have double style with double-line chars', () => {
      expect(tableBorder.double.chars.topLeft).toBe('╔');
      expect(tableBorder.double.chars.cross).toBe('╬');
      expect(tableBorder.double.chars.vertical).toBe('║');
    });

    it('should have heavy style with thick chars', () => {
      expect(tableBorder.heavy.chars.topLeft).toBe('┏');
      expect(tableBorder.heavy.chars.cross).toBe('╋');
    });

    it('should have compact style without frame', () => {
      expect(tableBorder.compact.frame).toBe(false);
      expect(tableBorder.compact.columnSeparators).toBe(false);
    });

    it('should have markdown style', () => {
      expect(tableBorder.markdown.chars.vertical).toBe('|');
      expect(tableBorder.markdown.chars.horizontal).toBe('-');
      expect(tableBorder.markdown.frame).toBe(false);
    });

    it('should have none style with no rendering', () => {
      expect(tableBorder.none.frame).toBe(false);
      expect(tableBorder.none.headerSeparator).toBe(false);
    });

    it('should have with_love style with heart corners', () => {
      expect(tableBorder.with_love.chars.topLeft).toBe('♥');
      expect(tableBorder.with_love.chars.bottomRight).toBe('♥');
    });

    it('should have reinforced style with mixed corners', () => {
      expect(tableBorder.reinforced.chars.topLeft).toBe('┍');
      expect(tableBorder.reinforced.chars.headerHorizontal).toBe('━');
    });
  });

  describe('getTableBorder', () => {
    it('should return style by name', () => {
      expect(getTableBorder('rounded')).toBe(tableBorder.rounded);
      expect(getTableBorder('double')).toBe(tableBorder.double);
    });

    it('should return undefined for unknown name', () => {
      expect(getTableBorder('nonexistent')).toBeUndefined();
    });
  });

  describe('renderTableGrid', () => {
    it('should render a simple table with rounded borders', () => {
      const result = renderTableGrid(
        tableBorder.rounded,
        ['Name', 'Age'],
        [
          ['Alice', '30'],
          ['Bob', '25'],
        ],
        { colWidths: [5, 3] },
      );

      expect(result).toContain('╭');
      expect(result).toContain('╯');
      expect(result).toContain('Name');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    it('should render without frame for compact style', () => {
      const result = renderTableGrid(tableBorder.compact, ['A', 'B'], [['1', '2']], { colWidths: [3, 3] });

      expect(result).not.toContain('╭');
      expect(result).not.toContain('│');
    });

    it('should render row numbers when requested', () => {
      const result = renderTableGrid(tableBorder.rounded, ['Name'], [['Alice'], ['Bob'], ['Charlie']], { colWidths: [7], rowNumbers: true });

      expect(result).toContain('#');
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
    });

    it('should respect column alignments', () => {
      const result = renderTableGrid(tableBorder.none, ['Num'], [['42']], { colWidths: [5], colAligns: ['right'] });

      // Right-aligned: spaces before number
      expect(result).toContain('   42');
    });

    it('should render title when provided', () => {
      const result = renderTableGrid(tableBorder.rounded, ['A'], [['1']], { colWidths: [3], title: 'My Table' });

      expect(result).toContain('My Table');
    });
  });
});
