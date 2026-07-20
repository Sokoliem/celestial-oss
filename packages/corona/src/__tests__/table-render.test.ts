import { describe, expect, it, vi } from 'vitest';
import { renderStaticTable } from '../table-render.js';

// Mock terminal detection to avoid TTY dependencies in tests
vi.mock('../terminal.js', () => ({
  detectBackground: () => 'dark',
  supportsColor: () => false,
  terminalWidth: () => 80,
}));

describe('renderStaticTable', () => {
  it('should render a basic table', () => {
    const result = renderStaticTable({
      headers: ['Name', 'Age'],
      rows: [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    });

    expect(result).toContain('Name');
    expect(result).toContain('Age');
    expect(result).toContain('Alice');
    expect(result).toContain('30');
    expect(result).toContain('Bob');
    expect(result).toContain('25');
  });

  it('should format numbers by default', () => {
    const result = renderStaticTable({
      headers: ['Value'],
      rows: [['1234567']],
    });

    expect(result).toContain('1,234,567');
  });

  it('should skip formatting when formatNumbers is false', () => {
    const result = renderStaticTable({
      headers: ['Value'],
      rows: [['1234567']],
      formatNumbers: false,
    });

    expect(result).toContain('1234567');
    expect(result).not.toContain('1,234,567');
  });

  it('should show placeholder for empty cells', () => {
    const result = renderStaticTable({
      headers: ['Name'],
      rows: [[''], ['  ']],
    });

    expect(result).toContain('—');
  });

  it('should support custom placeholder', () => {
    const result = renderStaticTable({
      headers: ['Name'],
      rows: [['']],
      emptyPlaceholder: 'N/A',
    });

    expect(result).toContain('N/A');
  });

  it('should render with different border styles', () => {
    const rounded = renderStaticTable({
      headers: ['A'],
      rows: [['1']],
      border: 'rounded',
    });
    expect(rounded).toContain('╭');

    const double = renderStaticTable({
      headers: ['A'],
      rows: [['1']],
      border: 'double',
    });
    expect(double).toContain('╔');
  });

  it('should add row numbers', () => {
    const result = renderStaticTable({
      headers: ['Name'],
      rows: [['Alice'], ['Bob']],
      rowNumbers: true,
    });

    expect(result).toContain('#');
    expect(result).toContain('1');
    expect(result).toContain('2');
  });

  it('should add title', () => {
    const result = renderStaticTable({
      headers: ['A'],
      rows: [['1']],
      title: 'My Data',
    });

    expect(result).toContain('My Data');
  });

  it('should handle empty data', () => {
    const result = renderStaticTable({
      headers: ['A', 'B'],
      rows: [],
    });

    expect(result).toContain('A');
    expect(result).toContain('B');
  });
});
