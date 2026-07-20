import { describe, expect, it } from 'vitest';
import { analyzeMessageCoverage } from '../coverage.js';

describe('analyzeMessageCoverage', () => {
  it('returns empty report when nothing was dispatched', () => {
    const report = analyzeMessageCoverage([], ['A', 'B', 'C']);

    expect(report.totalDispatched).toBe(0);
    expect(report.uniqueTypes).toBe(0);
    expect(report.byType.size).toBe(0);
    expect(report.uncovered).toEqual(['A', 'B', 'C']);
    expect(report.coverage).toBe(0);
  });

  it('reports full coverage when all types dispatched', () => {
    const dispatched = [{ type: 'A' }, { type: 'B' }, { type: 'C' }];
    const report = analyzeMessageCoverage(dispatched, ['A', 'B', 'C']);

    expect(report.totalDispatched).toBe(3);
    expect(report.uniqueTypes).toBe(3);
    expect(report.uncovered).toEqual([]);
    expect(report.coverage).toBe(1);
  });

  it('reports partial coverage correctly', () => {
    const dispatched = [{ type: 'A' }, { type: 'A' }];
    const report = analyzeMessageCoverage(dispatched, ['A', 'B', 'C']);

    expect(report.totalDispatched).toBe(2);
    expect(report.uniqueTypes).toBe(1);
    expect(report.uncovered).toEqual(['B', 'C']);
    expect(report.coverage).toBeCloseTo(1 / 3);
  });

  it('tracks firstSeen and lastSeen with explicit timestamps', () => {
    const dispatched = [
      { type: 'X', timestamp: 100 },
      { type: 'X', timestamp: 200 },
      { type: 'X', timestamp: 300 },
    ];
    const report = analyzeMessageCoverage(dispatched, ['X']);

    const entry = report.byType.get('X')!;
    expect(entry.count).toBe(3);
    expect(entry.firstSeen).toBe(100);
    expect(entry.lastSeen).toBe(300);
  });

  it('uses array index when no timestamp provided', () => {
    const dispatched = [{ type: 'A' }, { type: 'B' }, { type: 'A' }];
    const report = analyzeMessageCoverage(dispatched, ['A', 'B']);

    const a = report.byType.get('A')!;
    expect(a.firstSeen).toBe(0);
    expect(a.lastSeen).toBe(2);

    const b = report.byType.get('B')!;
    expect(b.firstSeen).toBe(1);
    expect(b.lastSeen).toBe(1);
  });

  it('counts dispatched types not in the defined list', () => {
    const dispatched = [{ type: 'A' }, { type: 'UNKNOWN' }];
    const report = analyzeMessageCoverage(dispatched, ['A', 'B']);

    expect(report.totalDispatched).toBe(2);
    expect(report.uniqueTypes).toBe(2);
    expect(report.byType.has('UNKNOWN')).toBe(true);
    expect(report.uncovered).toEqual(['B']);
    expect(report.coverage).toBe(0.5);
  });

  it('handles empty defined list with full coverage', () => {
    const report = analyzeMessageCoverage([{ type: 'X' }], []);

    expect(report.totalDispatched).toBe(1);
    expect(report.coverage).toBe(1);
    expect(report.uncovered).toEqual([]);
  });

  it('handles both empty dispatched and defined lists', () => {
    const report = analyzeMessageCoverage([], []);

    expect(report.totalDispatched).toBe(0);
    expect(report.coverage).toBe(1);
  });
});
