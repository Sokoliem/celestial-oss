/**
 * Animation composition system.
 *
 * Combines multiple AnimationEffects (value, transition, style) into a
 * single composed animation with parallel, sequence, and stagger modes.
 */

import type { AnimationEffect, StyleEffect, TransitionEffect, ValueEffect } from './effects.js';

// ---------------------------------------------------------------------------
// ComposedAnimation interface
// ---------------------------------------------------------------------------

export interface ComposedAnimation {
  tick(now: number): void;
  done(): boolean;
  reset(): void;
  applyTransition(oldContent: string, newContent: string): string;
  applyStyle(content: string): string;
  value(): number;
}

// ---------------------------------------------------------------------------
// Helpers to classify effects by kind
// ---------------------------------------------------------------------------

function isValueEffect(e: AnimationEffect): e is ValueEffect {
  return e.kind === 'value';
}

function isTransitionEffect(e: AnimationEffect): e is TransitionEffect {
  return e.kind === 'transition';
}

function isStyleEffect(e: AnimationEffect): e is StyleEffect {
  return e.kind === 'style';
}

// ---------------------------------------------------------------------------
// Build the composed result helpers (shared by all modes)
// ---------------------------------------------------------------------------

function buildApplyTransition(effects: AnimationEffect[]) {
  const transitions = effects.filter(isTransitionEffect);

  return (oldContent: string, newContent: string): string => {
    if (transitions.length === 0) return newContent;

    let result = newContent;
    for (const t of transitions) {
      result = t.apply(oldContent, result);
    }
    return result;
  };
}

function buildApplyStyle(effects: AnimationEffect[]) {
  const styles = effects.filter(isStyleEffect);

  return (content: string): string => {
    if (styles.length === 0) return content;

    let result = content;
    for (const s of styles) {
      result = s.apply(result);
    }
    return result;
  };
}

function buildValue(effects: AnimationEffect[]) {
  const values = effects.filter(isValueEffect);

  return (): number => {
    if (values.length === 0) return 0;
    return values[0]!.value();
  };
}

// ---------------------------------------------------------------------------
// composeParallel — all effects tick simultaneously
// ---------------------------------------------------------------------------

export function composeParallel(...effects: AnimationEffect[]): ComposedAnimation {
  const applyTransition = buildApplyTransition(effects);
  const applyStyle = buildApplyStyle(effects);
  const getValue = buildValue(effects);

  return {
    tick(now: number): void {
      for (const e of effects) {
        e.tick(now);
      }
    },

    done(): boolean {
      if (effects.length === 0) return true;
      return effects.every((e) => e.done());
    },

    reset(): void {
      for (const e of effects) {
        e.reset();
      }
    },

    applyTransition,
    applyStyle,
    value: getValue,
  };
}

// ---------------------------------------------------------------------------
// compose — alias for composeParallel
// ---------------------------------------------------------------------------

export function compose(...effects: AnimationEffect[]): ComposedAnimation {
  return composeParallel(...effects);
}

// ---------------------------------------------------------------------------
// composeSequence — one at a time in order
// ---------------------------------------------------------------------------

export function composeSequence(...effects: AnimationEffect[]): ComposedAnimation {
  let currentIndex = 0;

  function currentEffect(): AnimationEffect | undefined {
    return effects[currentIndex];
  }

  return {
    tick(now: number): void {
      if (effects.length === 0) return;

      const current = currentEffect();
      if (!current) return;

      current.tick(now);

      // Advance to next when current is done (unless it's the last).
      // The initialization tick sets the next effect's startTime so its
      // elapsed time is computed correctly on subsequent ticks.
      if (current.done() && currentIndex < effects.length - 1) {
        currentIndex++;
        const next = currentEffect();
        if (next) {
          next.tick(now);
        }
      }
    },

    done(): boolean {
      if (effects.length === 0) return true;
      const last = effects[effects.length - 1];
      return currentIndex === effects.length - 1 && (last ? last.done() : true);
    },

    reset(): void {
      currentIndex = 0;
      for (const e of effects) {
        e.reset();
      }
    },

    applyTransition(oldContent: string, newContent: string): string {
      if (effects.length === 0) return newContent;
      // Apply all transition effects that have been reached
      const active = effects.slice(0, currentIndex + 1);
      const transitions = active.filter(isTransitionEffect);
      if (transitions.length === 0) return newContent;
      let result = newContent;
      for (const t of transitions) {
        result = t.apply(oldContent, result);
      }
      return result;
    },

    applyStyle(content: string): string {
      if (effects.length === 0) return content;
      const active = effects.slice(0, currentIndex + 1);
      const styles = active.filter(isStyleEffect);
      if (styles.length === 0) return content;
      let result = content;
      for (const s of styles) {
        result = s.apply(result);
      }
      return result;
    },

    value(): number {
      if (effects.length === 0) return 0;
      // Return the current active effect's value if it's a ValueEffect
      const active = effects.slice(0, currentIndex + 1);
      const values = active.filter(isValueEffect);
      if (values.length === 0) return 0;
      return values[values.length - 1]!.value();
    },
  };
}

// ---------------------------------------------------------------------------
// composeStagger — like parallel but each effect starts offset by delayMs
// ---------------------------------------------------------------------------

export function composeStagger(effects: AnimationEffect[], delayMs: number): ComposedAnimation {
  let startTime: number | null = null;
  const started: boolean[] = effects.map(() => false);

  return {
    tick(now: number): void {
      if (effects.length === 0) return;

      if (startTime === null) {
        startTime = now;
      }

      const elapsed = now - startTime;

      for (let i = 0; i < effects.length; i++) {
        const effectDelay = i * delayMs;
        if (elapsed >= effectDelay) {
          const virtualTime = elapsed - effectDelay;
          if (!started[i]) {
            started[i] = true;
            // Initialize the effect with a tick at virtual time 0
            // so its internal startTime is set correctly
            effects[i]!.tick(0);
          }
          effects[i]!.tick(virtualTime);
        }
      }
    },

    done(): boolean {
      if (effects.length === 0) return true;
      return effects.every((e) => e.done());
    },

    reset(): void {
      startTime = null;
      for (let i = 0; i < effects.length; i++) {
        started[i] = false;
        effects[i]!.reset();
      }
    },

    applyTransition(oldContent: string, newContent: string): string {
      const transitions = effects.filter(isTransitionEffect);
      if (transitions.length === 0) return newContent;
      let result = newContent;
      for (const t of transitions) {
        result = t.apply(oldContent, result);
      }
      return result;
    },

    applyStyle(content: string): string {
      const styles = effects.filter(isStyleEffect);
      if (styles.length === 0) return content;
      let result = content;
      for (const s of styles) {
        result = s.apply(result);
      }
      return result;
    },

    value(): number {
      const values = effects.filter(isValueEffect);
      if (values.length === 0) return 0;
      return values[0]!.value();
    },
  };
}

// ---------------------------------------------------------------------------
// composeRandom — like stagger, but each effect's start delay is sampled
// deterministically from [0, maxDelayMs] using a seeded golden-ratio hash.
// Useful for ambient/idle effects (twinkles, parallax shimmer) where you
// want effects firing on independent schedules without lockstep.
// ---------------------------------------------------------------------------

const RANDOM_DELAY_PHI = 0.6180339887498949;
function seededDelay(index: number, maxDelayMs: number, seed: number): number {
  const hash = ((index * 9277 + seed * 6151) * RANDOM_DELAY_PHI) % 1;
  const positive = hash < 0 ? hash + 1 : hash;
  return positive * maxDelayMs;
}

export function composeRandom(effects: AnimationEffect[], maxDelayMs: number, seed = 42): ComposedAnimation {
  let startTime: number | null = null;
  const delays = effects.map((_, i) => seededDelay(i, maxDelayMs, seed));
  const started: boolean[] = effects.map(() => false);

  return {
    tick(now: number): void {
      if (effects.length === 0) return;
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      for (let i = 0; i < effects.length; i++) {
        if (elapsed < delays[i]!) continue;
        const virtualTime = elapsed - delays[i]!;
        if (!started[i]) {
          started[i] = true;
          effects[i]!.tick(0);
        }
        effects[i]!.tick(virtualTime);
      }
    },

    done(): boolean {
      if (effects.length === 0) return true;
      return effects.every((e) => e.done());
    },

    reset(): void {
      startTime = null;
      for (let i = 0; i < effects.length; i++) {
        started[i] = false;
        effects[i]!.reset();
      }
    },

    applyTransition: buildApplyTransition(effects),
    applyStyle: buildApplyStyle(effects),
    value: buildValue(effects),
  };
}

// ---------------------------------------------------------------------------
// composeConditional — branch between two animations based on a predicate.
// At each tick the predicate is re-evaluated; the chosen branch is ticked
// and used for apply/value. The unselected branch is NOT ticked (its state
// is frozen). When the active branch toggles, the newly-active branch is
// re-initialised at this tick.
// ---------------------------------------------------------------------------

export function composeConditional(predicate: (now: number) => boolean, thenAnim: ComposedAnimation, elseAnim: ComposedAnimation): ComposedAnimation {
  let lastBranch: 'then' | 'else' | null = null;

  function selectBranch(now: number): { active: ComposedAnimation; tag: 'then' | 'else' } {
    const tag = predicate(now) ? 'then' : 'else';
    return { active: tag === 'then' ? thenAnim : elseAnim, tag };
  }

  return {
    tick(now: number): void {
      const { active, tag } = selectBranch(now);
      if (lastBranch !== null && lastBranch !== tag) {
        // Branch flipped — reset the newly-active branch to start fresh.
        active.reset();
      }
      lastBranch = tag;
      active.tick(now);
    },

    done(): boolean {
      // Done only when the currently-active branch is done. We can't
      // evaluate the predicate here without `now`, so we use whichever
      // branch was active on the last tick. Before any tick, we're done
      // iff both branches are done (vacuously true for empty branches).
      if (lastBranch === null) return thenAnim.done() && elseAnim.done();
      return (lastBranch === 'then' ? thenAnim : elseAnim).done();
    },

    reset(): void {
      thenAnim.reset();
      elseAnim.reset();
      lastBranch = null;
    },

    applyTransition(oldContent: string, newContent: string): string {
      const branch = lastBranch === 'else' ? elseAnim : thenAnim;
      return branch.applyTransition(oldContent, newContent);
    },

    applyStyle(content: string): string {
      const branch = lastBranch === 'else' ? elseAnim : thenAnim;
      return branch.applyStyle(content);
    },

    value(): number {
      const branch = lastBranch === 'else' ? elseAnim : thenAnim;
      return branch.value();
    },
  };
}

// ---------------------------------------------------------------------------
// composeNested — wrap a ComposedAnimation so it satisfies the
// AnimationEffect interface (specifically as a TransitionEffect). This lets
// you pass a composed animation into another compose call:
//   composeParallel(asTransition, otherEffect)
// ---------------------------------------------------------------------------

export function composeNested(animation: ComposedAnimation): TransitionEffect {
  return {
    kind: 'transition' as const,
    tick(now: number): void {
      animation.tick(now);
    },
    // ComposedAnimation has no progress() method — surface a binary value
    // (1 when done, 0 otherwise). Consumers that need finer-grained progress
    // should compose the underlying ValueEffects directly.
    progress(): number {
      return animation.done() ? 1 : 0;
    },
    done(): boolean {
      return animation.done();
    },
    reset(): void {
      animation.reset();
    },
    apply(oldContent: string, newContent: string): string {
      return animation.applyTransition(oldContent, newContent);
    },
  };
}
