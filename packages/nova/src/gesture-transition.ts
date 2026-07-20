/**
 * Gesture-scrubbed transitions.
 *
 * Connects drag/swipe gestures to Nova transition progress in real-time.
 * As the user drags, the transition progress follows the gesture position.
 * On release, a spring animation commits (→ 1) or cancels (→ 0) based on
 * velocity and distance thresholds.
 *
 * This bridges @celestial/nexus (gesture producer) → @celestial/nova
 * (transition renderer) → @celestial/aurora (spring physics for settle).
 *
 * Pure state machine — no side effects, no subscriptions, no mutation.
 */

import type { SpringPreset } from '@celestial/aurora';
import { spring as createSpring, type SpringAnimation } from '@celestial/aurora';
import { type MotionPreference, shouldReduceMotion } from './motion.js';
import { applyStrategy } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { RippleOrigin } from './strategies/ripple.js';

export type GestureTransitionStrategy = 'slide' | 'crossfade' | 'wipe' | 'morph' | 'blur' | 'dissolve' | 'zoom' | 'ripple' | 'flip' | 'typewriter' | 'glitch';

export type GesturePhase = 'idle' | 'dragging' | 'settling';

export interface GestureTransitionConfig extends MotionPreference {
  /** Visual strategy for the transition. Default: 'slide'. */
  strategy?: GestureTransitionStrategy;
  /** Direction for slide/wipe strategies. Default: 'left'. */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Ripple origin for ripple transitions. */
  rippleOrigin?: RippleOrigin;
  /** Flip axis for flip transitions. */
  flipAxis?: FlipAxis;
  /** Cursor for typewriter transitions. */
  typewriterCursor?: string;
  /** Progress threshold to commit the transition (0..1). Default: 0.4. */
  commitThreshold?: number;
  /** Velocity threshold to commit regardless of progress. Default: 0.3. */
  velocityThreshold?: number;
  /** Spring preset for the settle animation. Default: snappy. */
  spring?: SpringPreset;
  /** Called when the transition commits (progress settles to 1). */
  onCommit?: () => void;
  /** Called when the transition cancels (progress settles to 0). */
  onCancel?: () => void;
}

export interface GestureTransitionController {
  /** Current phase: idle, dragging, or settling via spring. */
  phase(): GesturePhase;
  /**
   * Begin a drag gesture. Call when the user starts dragging.
   * Resets any in-progress settle animation.
   */
  dragStart(): void;
  /**
   * Update drag progress. `offset` is the drag distance, `total` is the
   * maximum distance (e.g. viewport width). Progress = offset / total.
   */
  drag(offset: number, total: number): void;
  /**
   * Release the drag. The controller decides to commit or cancel based
   * on current progress and velocity, then begins a spring settle.
   * @param velocity — pixels/ms or cells/tick at release moment
   */
  release(velocity: number): void;
  /**
   * Advance the settle spring. Call every frame during settling.
   */
  tick(now: number): void;
  /** Render the current transition frame at current progress. */
  render(oldContent: string, newContent: string): string;
  /** Current progress (0..1, may overshoot during spring settle). */
  progress(): number;
  /** Whether the transition has fully settled. */
  done(): boolean;
  /** Whether the transition committed (progress settled to 1). */
  committed(): boolean;
  /** Reset to idle state. */
  reset(): void;
}

const DEFAULT_SPRING: SpringPreset = { stiffness: 400, damping: 25 };

export function createGestureTransition(config: GestureTransitionConfig = {}): GestureTransitionController {
  const strategy = config.strategy ?? 'slide';
  const direction = config.direction ?? 'left';
  const rippleOrigin = config.rippleOrigin;
  const flipAxis = config.flipAxis ?? 'horizontal';
  const typewriterCursor = config.typewriterCursor ?? '▌';
  const commitThreshold = config.commitThreshold ?? 0.4;
  const velocityThreshold = config.velocityThreshold ?? 0.3;
  const springPreset = config.spring ?? DEFAULT_SPRING;
  const reducedMotion = shouldReduceMotion(config);

  let currentPhase: GesturePhase = 'idle';
  let currentProgress = 0;
  let settleSpring: SpringAnimation | null = null;
  let didCommit = false;

  return {
    phase(): GesturePhase {
      return currentPhase;
    },

    dragStart(): void {
      currentPhase = 'dragging';
      settleSpring = null;
      didCommit = false;
      // Don't reset currentProgress — allows re-grab during settle
    },

    drag(offset: number, total: number): void {
      if (currentPhase !== 'dragging') return;
      if (total <= 0) return;
      currentProgress = Math.max(0, Math.min(1, Math.abs(offset) / total));
    },

    release(velocity: number): void {
      if (currentPhase !== 'dragging') return;

      // Decide: commit or cancel
      const shouldCommit = currentProgress >= commitThreshold || Math.abs(velocity) >= velocityThreshold;

      const target = shouldCommit ? 1 : 0;
      didCommit = shouldCommit;

      if (reducedMotion) {
        currentProgress = target;
        currentPhase = 'idle';
        settleSpring = null;
        if (shouldCommit) config.onCommit?.();
        else config.onCancel?.();
        return;
      }

      // Create a spring from current progress to target
      settleSpring = createSpring(target, {
        ...springPreset,
        from: currentProgress,
      });
      settleSpring.start();

      currentPhase = 'settling';
    },

    tick(now: number): void {
      if (currentPhase !== 'settling' || !settleSpring) return;

      settleSpring.tick(now);
      currentProgress = settleSpring.value();

      if (settleSpring.done()) {
        // Snap to exact target
        currentProgress = didCommit ? 1 : 0;
        currentPhase = 'idle';

        if (didCommit && config.onCommit) {
          config.onCommit();
        } else if (!didCommit && config.onCancel) {
          config.onCancel();
        }
      }
    },

    render(oldContent: string, newContent: string): string {
      if (currentPhase === 'idle' && currentProgress <= 0) return oldContent;
      if (currentPhase === 'idle' && currentProgress >= 1) return newContent;
      return applyStrategy(strategy, oldContent, newContent, currentProgress, {
        direction,
        rippleOrigin,
        flipAxis,
        typewriterCursor,
        clampProgress: true,
      });
    },

    progress(): number {
      return currentProgress;
    },

    done(): boolean {
      return currentPhase === 'idle' && (settleSpring === null || settleSpring.done());
    },

    committed(): boolean {
      return didCommit && currentPhase === 'idle';
    },

    reset(): void {
      currentPhase = 'idle';
      currentProgress = 0;
      settleSpring = null;
      didCommit = false;
    },
  };
}
