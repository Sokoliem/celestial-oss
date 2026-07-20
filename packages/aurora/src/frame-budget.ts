import { assertFiniteNumber, assertNonNegativeNumber, assertPositiveNumber } from './validation.js';

export interface FrameBudget {
  beginFrame(now?: number): void;
  consume(costMs: number): void;
  endFrame(now?: number): void;
  remaining(): number;
  overBudget(): boolean;
  fidelity(): number;
  recommendation(): FrameFidelityRecommendation;
  reset(): void;
}

export type FrameFidelityTier = 'full' | 'high' | 'reduced' | 'minimal';

export interface FrameFidelityRecommendation {
  tier: FrameFidelityTier;
  fidelity: number;
  allowAnimation: boolean;
  allowDecorativeAnimation: boolean;
  allowExpensiveEffects: boolean;
}

export function recommendFrameFidelity(fidelity: number, overBudget = false): FrameFidelityRecommendation {
  const normalized = Math.max(0, Math.min(1, assertFiniteNumber(fidelity, 'fidelity')));
  const adjusted = overBudget ? Math.min(normalized, 0.74) : normalized;

  if (adjusted >= 0.95) {
    return {
      tier: 'full',
      fidelity: normalized,
      allowAnimation: true,
      allowDecorativeAnimation: true,
      allowExpensiveEffects: true,
    };
  }

  if (adjusted >= 0.75) {
    return {
      tier: 'high',
      fidelity: normalized,
      allowAnimation: true,
      allowDecorativeAnimation: true,
      allowExpensiveEffects: false,
    };
  }

  if (adjusted >= 0.45) {
    return {
      tier: 'reduced',
      fidelity: normalized,
      allowAnimation: true,
      allowDecorativeAnimation: false,
      allowExpensiveEffects: false,
    };
  }

  return {
    tier: 'minimal',
    fidelity: normalized,
    allowAnimation: false,
    allowDecorativeAnimation: false,
    allowExpensiveEffects: false,
  };
}

export function createFrameBudget(targetFps: number): FrameBudget {
  const frameBudgetMs = 1000 / assertPositiveNumber(targetFps, 'targetFps');
  let frameStart: number | null = null;
  let spentMs = 0;
  let fidelityValue = 1;
  let overBudgetFrame = false;

  function beginFrame(now?: number): void {
    frameStart = now === undefined ? Date.now() : assertFiniteNumber(now, 'now');
    spentMs = 0;
    overBudgetFrame = false;
  }

  function consume(costMs: number): void {
    spentMs += assertNonNegativeNumber(costMs, 'costMs');
    overBudgetFrame = spentMs > frameBudgetMs;
  }

  function endFrame(now?: number): void {
    if (frameStart === null) {
      beginFrame(now);
      return;
    }

    const frameEnd = now === undefined ? Date.now() : assertFiniteNumber(now, 'now');
    const elapsed = Math.max(spentMs, frameEnd - frameStart);
    overBudgetFrame = elapsed > frameBudgetMs;

    if (overBudgetFrame) {
      fidelityValue = Math.max(0.25, fidelityValue - 0.1);
    } else if (elapsed <= frameBudgetMs * 0.8) {
      fidelityValue = Math.min(1, fidelityValue + 0.05);
    }
  }

  function remaining(): number {
    return Math.max(0, frameBudgetMs - spentMs);
  }

  function overBudget(): boolean {
    return overBudgetFrame;
  }

  function fidelity(): number {
    return fidelityValue;
  }

  function recommendation(): FrameFidelityRecommendation {
    return recommendFrameFidelity(fidelityValue, overBudgetFrame);
  }

  function reset(): void {
    frameStart = null;
    spentMs = 0;
    fidelityValue = 1;
    overBudgetFrame = false;
  }

  return {
    beginFrame,
    consume,
    endFrame,
    remaining,
    overBudget,
    fidelity,
    recommendation,
    reset,
  };
}
