import { type MotionPreference, shouldReduceMotion } from './motion.js';
import { applyStrategy } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { GlitchOpts } from './strategies/glitch.js';
import type { RippleOrigin } from './strategies/ripple.js';

export type TransitionBuilderType =
  | 'slide'
  | 'fade'
  | 'crossfade'
  | 'wipe'
  | 'morph'
  | 'blur'
  | 'dissolve'
  | 'zoom'
  | 'ripple'
  | 'flip'
  | 'typewriter'
  | 'glitch'
  | 'none';

export interface TransitionState {
  startTime: number;
  progress: number;
  complete: boolean;
}

export interface TransitionConfig extends MotionPreference {
  type?: TransitionBuilderType;
  direction?: 'left' | 'right' | 'up' | 'down';
  duration?: number;
  easing?: (t: number) => number;
  rippleOrigin?: RippleOrigin;
  flipAxis?: FlipAxis;
  typewriterCursor?: string;
  glitchOpts?: GlitchOpts;
}

export interface TransitionPairConfig {
  enter: TransitionConfig;
  exit?: TransitionConfig;
}

export interface TransitionController {
  start(startTime: number): TransitionState;
  tick(state: TransitionState, now: number): TransitionState;
  render(oldContent: string, newContent: string, state: TransitionState): string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface NormalizedTransitionConfig {
  type: TransitionBuilderType;
  direction: 'left' | 'right' | 'up' | 'down';
  duration: number;
  easing: (t: number) => number;
  rippleOrigin: RippleOrigin;
  flipAxis: FlipAxis;
  typewriterCursor: string;
  glitchOpts: GlitchOpts | undefined;
  reduceMotion: boolean;
}

function normalizeConfig(config: TransitionConfig | TransitionPairConfig): NormalizedTransitionConfig {
  const source =
    'enter' in config
      ? {
          ...config.enter,
          direction: config.exit?.direction ?? config.enter.direction,
          duration: config.exit?.duration ?? config.enter.duration,
        }
      : config;
  return {
    type: source.type ?? 'crossfade',
    direction: source.direction ?? 'left',
    duration: source.duration ?? 6,
    easing: source.easing ?? ((t: number) => t),
    rippleOrigin: source.rippleOrigin ?? { x: 0.5, y: 0.5 },
    flipAxis: source.flipAxis ?? 'horizontal',
    typewriterCursor: source.typewriterCursor ?? '▌',
    glitchOpts: source.glitchOpts,
    reduceMotion: shouldReduceMotion(source),
  };
}

export function createTransition(config: TransitionConfig | TransitionPairConfig): TransitionController {
  const normalized = normalizeConfig(config);

  return {
    start(startTime: number): TransitionState {
      return { startTime, progress: normalized.reduceMotion ? 1 : 0, complete: normalized.reduceMotion };
    },

    tick(state: TransitionState, now: number): TransitionState {
      if (normalized.reduceMotion) return { startTime: state.startTime, progress: 1, complete: true };
      const rawProgress = normalized.duration <= 0 ? 1 : clamp((now - state.startTime) / normalized.duration);
      const easedProgress = clamp(normalized.easing(rawProgress));
      return {
        startTime: state.startTime,
        progress: easedProgress,
        complete: rawProgress >= 1 || easedProgress >= 1,
      };
    },

    render(oldContent: string, newContent: string, state: TransitionState): string {
      if (normalized.reduceMotion) return newContent;
      return applyStrategy(normalized.type, oldContent, newContent, clamp(state.progress), {
        direction: normalized.direction,
        rippleOrigin: normalized.rippleOrigin,
        flipAxis: normalized.flipAxis,
        typewriterCursor: normalized.typewriterCursor,
        glitchOpts: normalized.glitchOpts,
      });
    },
  };
}

export function slideTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'slide' });
}

export function fadeTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'fade' });
}

export function wipeTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'wipe' });
}

export function morphTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'morph' });
}

export function blurTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'blur' });
}

export function dissolveTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'dissolve' });
}

export function zoomTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'zoom' });
}

export function rippleTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'ripple' });
}

export function flipTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'flip' });
}

export function typewriterTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'typewriter' });
}

export function glitchTransition(config: Omit<TransitionConfig, 'type'> = {}): TransitionController {
  return createTransition({ ...config, type: 'glitch' });
}
