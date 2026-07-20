/**
 * Block-snap scroll controller (B6)
 *
 * Provides spring-physics scrolling that snaps to block boundaries.
 * Works with any overlay-like object that exposes `scrollTo(line)`,
 * `getTopLine()`, and `lineCount`.
 *
 * Usage:
 *
 *   const controller = createBlockSnapScroll(overlay, blocks, {
 *     presentation: true,
 *     reduceMotion: false,
 *   });
 *   controller.snapDown();
 *   // In the render loop:
 *   const { line, done } = controller.tick(elapsedMs);
 *   overlay.scrollTo(line);
 */

import { spring as createSpring } from '@celestial/aurora';

export interface BlockBoundary {
  readonly startLine: number;
  readonly endLine: number;
}

export interface BlockSnapOverlay {
  readonly lineCount: number;
  readonly viewportHeight: number;
  scrollTo(line: number): void;
  getTopLine(): number;
}

export interface BlockSnapScrollOptions {
  readonly presentation?: boolean;
  readonly reduceMotion?: boolean;
}

export interface BlockSnapAnimation {
  readonly from: number;
  readonly to: number;
  readonly active: boolean;
  readonly startTime: number;
}

export interface BlockSnapController {
  /** Snap to the previous block boundary. */
  snapUp(): void;
  /** Snap to the next block boundary. */
  snapDown(): void;
  /** Snap directly to the block at `index`. */
  snapToBlock(index: number): void;
  /** Return the index of the block containing the current top line. */
  currentBlock(): number;
  /** Cancel any in-progress snap animation. */
  cancel(): void;
  /** Sample the spring at `elapsed` ms past the animation start. */
  tick(elapsed: number): { line: number; done: boolean };
}

const SNAP_SPRING = {
  stiffness: 300,
  damping: 30,
  mass: 1,
} as const;

const FIXED_DT_MS = 16;
const MAX_SCROLL_VALUE = 1_000_000_000;
const MAX_ELAPSED_MS = 60_000;

function finiteInteger(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(-MAX_SCROLL_VALUE, Math.min(MAX_SCROLL_VALUE, Math.floor(value)));
}

function startSnapAnimation(from: number, to: number): BlockSnapAnimation {
  return {
    from,
    to,
    active: from !== to,
    startTime: Date.now(),
  };
}

function tickSnapAnimation(anim: BlockSnapAnimation, elapsed: number): { value: number; done: boolean } {
  if (!anim.active || anim.from === anim.to) return { value: anim.to, done: true };
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, Math.min(MAX_ELAPSED_MS, elapsed)) : elapsed === Number.POSITIVE_INFINITY ? MAX_ELAPSED_MS : 0;
  if (safeElapsed <= 0) return { value: anim.from, done: false };

  const s = createSpring(anim.to, {
    from: anim.from,
    stiffness: SNAP_SPRING.stiffness,
    damping: SNAP_SPRING.damping,
    mass: SNAP_SPRING.mass,
  });

  s.tick(0);
  for (let t = FIXED_DT_MS; t <= safeElapsed; t += FIXED_DT_MS) {
    s.tick(t);
    if (s.done()) break;
  }
  return { value: Math.round(s.value()), done: s.done() };
}

function clampLine(line: number, lineCount: number, viewportHeight: number): number {
  const safeLineCount = Math.max(0, finiteInteger(lineCount));
  const safeViewportHeight = Math.max(1, finiteInteger(viewportHeight, 1));
  const maxTop = Math.max(0, safeLineCount - safeViewportHeight);
  return Math.max(0, Math.min(finiteInteger(line), maxTop));
}

function resolveTargetLine(block: BlockBoundary, lineCount: number, viewportHeight: number, presentation: boolean): number {
  if (presentation) {
    const blockHeight = block.endLine - block.startLine;
    if (blockHeight < viewportHeight) {
      // Center the block
      return clampLine(block.startLine - Math.floor((viewportHeight - blockHeight) / 2), lineCount, viewportHeight);
    }
  }
  // Align to top of block
  return clampLine(block.startLine, lineCount, viewportHeight);
}

export function createBlockSnapScroll(overlay: BlockSnapOverlay, blocks: readonly BlockBoundary[], options?: BlockSnapScrollOptions): BlockSnapController {
  const presentation = options?.presentation ?? false;
  const reduceMotion = options?.reduceMotion ?? false;
  const safeBlocks = blocks
    .filter((block) => Number.isFinite(block.startLine) && Number.isFinite(block.endLine))
    .map((block) => {
      const startLine = Math.max(0, finiteInteger(block.startLine));
      return { startLine, endLine: Math.max(startLine, finiteInteger(block.endLine)) };
    })
    .sort((left, right) => left.startLine - right.startLine);
  let anim: BlockSnapAnimation | null = null;

  function currentBlockIndex(): number {
    const top = Math.max(0, finiteInteger(overlay.getTopLine()));
    for (let i = safeBlocks.length - 1; i >= 0; i--) {
      if (top >= safeBlocks[i]!.startLine) return i;
    }
    return 0;
  }

  function startSnapTo(targetLine: number): void {
    const from = Math.max(0, finiteInteger(overlay.getTopLine()));
    const to = clampLine(targetLine, overlay.lineCount, overlay.viewportHeight);
    if (reduceMotion) {
      overlay.scrollTo(to);
      anim = null;
      return;
    }
    anim = startSnapAnimation(from, to);
  }

  return {
    snapUp(): void {
      const idx = currentBlockIndex();
      const targetIdx = Math.max(0, idx - 1);
      const targetLine = resolveTargetLine(safeBlocks[targetIdx] ?? { startLine: 0, endLine: 0 }, overlay.lineCount, overlay.viewportHeight, presentation);
      startSnapTo(targetLine);
    },

    snapDown(): void {
      const idx = currentBlockIndex();
      const targetIdx = Math.min(safeBlocks.length - 1, idx + 1);
      const targetLine = resolveTargetLine(safeBlocks[targetIdx] ?? { startLine: 0, endLine: 0 }, overlay.lineCount, overlay.viewportHeight, presentation);
      startSnapTo(targetLine);
    },

    snapToBlock(index: number): void {
      const targetIdx = Math.max(0, Math.min(safeBlocks.length - 1, finiteInteger(index)));
      const targetLine = resolveTargetLine(safeBlocks[targetIdx] ?? { startLine: 0, endLine: 0 }, overlay.lineCount, overlay.viewportHeight, presentation);
      startSnapTo(targetLine);
    },

    currentBlock(): number {
      return currentBlockIndex();
    },

    cancel(): void {
      anim = null;
    },

    tick(elapsed: number): { line: number; done: boolean } {
      if (!anim) {
        return { line: Math.max(0, finiteInteger(overlay.getTopLine())), done: true };
      }
      const result = tickSnapAnimation(anim, elapsed);
      if (result.done) {
        anim = null;
      }
      return { line: result.value, done: result.done };
    },
  };
}
