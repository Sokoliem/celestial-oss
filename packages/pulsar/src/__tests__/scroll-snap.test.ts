import { describe, expect, it } from 'vitest';
import { type BlockBoundary, type BlockSnapOverlay, createBlockSnapScroll } from '../scroll-snap.js';

function makeOverlay(initialTop = 0, lineCount = 100, viewportHeight = 10): BlockSnapOverlay & { topLine: number } {
  let topLine = initialTop;
  return {
    get lineCount() {
      return lineCount;
    },
    get viewportHeight() {
      return viewportHeight;
    },
    getTopLine() {
      return topLine;
    },
    scrollTo(line: number) {
      topLine = line;
    },
    get topLine() {
      return topLine;
    },
  };
}

const BLOCKS: BlockBoundary[] = [
  { startLine: 0, endLine: 5 },
  { startLine: 5, endLine: 12 },
  { startLine: 12, endLine: 20 },
  { startLine: 20, endLine: 30 },
];

describe('createBlockSnapScroll', () => {
  it('identifies current block from top line', () => {
    const overlay = makeOverlay(7);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    expect(ctrl.currentBlock()).toBe(1); // block 1 covers lines 5-12
  });

  it('snaps down to next block start', () => {
    const overlay = makeOverlay(0);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    ctrl.snapDown();
    const { line, done } = ctrl.tick(2000);
    expect(done).toBe(true);
    expect(line).toBe(5);
  });

  it('snaps up to previous block start', () => {
    const overlay = makeOverlay(15);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    ctrl.snapUp();
    const { line, done } = ctrl.tick(2000);
    expect(done).toBe(true);
    expect(line).toBe(5);
  });

  it('snaps directly to a specific block', () => {
    const overlay = makeOverlay(0);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    ctrl.snapToBlock(2);
    const { line, done } = ctrl.tick(2000);
    expect(done).toBe(true);
    expect(line).toBe(12);
  });

  it('clamps block index to valid range', () => {
    const overlay = makeOverlay(0);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    ctrl.snapToBlock(99);
    const { line, done } = ctrl.tick(2000);
    expect(done).toBe(true);
    expect(line).toBe(20); // last block
  });

  it('respects reduceMotion by jumping instantly', () => {
    const overlay = makeOverlay(0);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS, { reduceMotion: true });
    ctrl.snapDown();
    expect(overlay.topLine).toBe(5);
    const { done } = ctrl.tick(0);
    expect(done).toBe(true);
  });

  it('returns intermediate values during animation', () => {
    const overlay = makeOverlay(0);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    ctrl.snapDown();
    const atStart = ctrl.tick(0);
    expect(atStart.line).toBe(0);
    expect(atStart.done).toBe(false);
    const mid = ctrl.tick(100);
    expect(mid.line).toBeGreaterThan(0);
    expect(mid.line).toBeLessThan(5);
  });

  it('cancels an in-progress animation', () => {
    const overlay = makeOverlay(0);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS);
    ctrl.snapDown();
    ctrl.cancel();
    const { line, done } = ctrl.tick(100);
    expect(line).toBe(0);
    expect(done).toBe(true);
  });

  it('in presentation mode centers a small block', () => {
    const overlay = makeOverlay(0, 100);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS, { presentation: true });
    ctrl.snapToBlock(0); // block 0 is 5 lines tall
    const { line, done } = ctrl.tick(2000);
    expect(done).toBe(true);
    // Centering: startLine 0, block height 5, viewport 100
    // 0 - floor((100 - 5) / 2) = -47, clamped to 0
    expect(line).toBe(0);
  });

  it('in presentation mode aligns top when block is taller than viewport', () => {
    const overlay = makeOverlay(0, 30, 10);
    const ctrl = createBlockSnapScroll(overlay, BLOCKS, { presentation: true });
    ctrl.snapToBlock(3); // block 3 starts at line 20, height 10, same as viewport
    const { line, done } = ctrl.tick(2000);
    expect(done).toBe(true);
    expect(line).toBe(20);
  });

  it('normalizes malformed blocks, indices, dimensions, and elapsed time', () => {
    const overlay = makeOverlay(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN);
    const ctrl = createBlockSnapScroll(overlay, [
      { startLine: Number.NaN, endLine: 4 },
      { startLine: 10.9, endLine: 5 },
    ]);
    expect(() => ctrl.snapToBlock(Number.POSITIVE_INFINITY)).not.toThrow();
    const sample = ctrl.tick(Number.POSITIVE_INFINITY);
    expect(Number.isFinite(sample.line)).toBe(true);
  });
});
