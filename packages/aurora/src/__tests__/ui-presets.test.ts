import { describe, expect, it } from 'vitest';
import { morph, pulseUi, type SlideInValue, slideIn, snap, softFade, UI_PRESET_DESCRIPTORS, uiPresets } from '../index.js';

describe('softFade', () => {
  it('starts at 0 and ends at 1 over the default 200ms duration', () => {
    const anim = softFade();
    const start = 1000;
    anim.tick(start);
    expect(anim.value()).toBe(0);
    anim.tick(start + 200);
    expect(anim.value()).toBe(1);
    expect(anim.done()).toBe(true);
  });

  it('respects a custom duration', () => {
    const anim = softFade({ duration: 500 });
    const start = 1000;
    anim.tick(start);
    anim.tick(start + 500);
    expect(anim.done()).toBe(true);
  });

  it('reduceMotion: first tick returns 1 and done() is true', () => {
    const anim = softFade({ reduceMotion: true });
    anim.tick(1000);
    anim.tick(1001);
    expect(anim.value()).toBe(1);
    expect(anim.done()).toBe(true);
  });
});

describe('snap', () => {
  it('starts at 1 and ends at 0 over the default 100ms duration', () => {
    const anim = snap();
    const start = 1000;
    anim.tick(start);
    expect(anim.value()).toBe(1);
    anim.tick(start + 100);
    expect(anim.value()).toBe(0);
    expect(anim.done()).toBe(true);
  });

  it('reduceMotion: first tick returns 0 and done() is true', () => {
    const anim = snap({ reduceMotion: true });
    anim.tick(1000);
    anim.tick(1001);
    expect(anim.value()).toBe(0);
    expect(anim.done()).toBe(true);
  });
});

describe('pulse (UI preset)', () => {
  it('oscillates between min and max over the cycle', () => {
    const anim = pulseUi({ min: 0.6, max: 1.0 });
    const start = 1000;
    anim.tick(start); // offset 0 → min
    expect(anim.value()).toBeCloseTo(0.6, 2);
    anim.tick(start + 800); // offset 0.5 → max
    expect(anim.value()).toBeCloseTo(1.0, 2);
    anim.tick(start + 1600); // offset 1 → min again (loops)
    expect(anim.value()).toBeCloseTo(0.6, 2);
  });

  it('reduceMotion: stays at the max value', () => {
    const anim = pulseUi({ reduceMotion: true });
    anim.tick(1000);
    anim.tick(2000);
    expect(anim.value()).toBe(1);
  });

  it('honours custom min/max', () => {
    const anim = pulseUi({ min: 0.2, max: 0.9 });
    const start = 1000;
    anim.tick(start);
    expect(anim.value()).toBeCloseTo(0.2, 2);
    anim.tick(start + 800);
    expect(anim.value()).toBeCloseTo(0.9, 2);
  });
});

describe('morph', () => {
  it('starts at 0 and reaches 1 over the default 240ms', () => {
    const anim = morph();
    const start = 1000;
    anim.tick(start);
    expect(anim.value()).toBe(0);
    anim.tick(start + 240);
    expect(anim.value()).toBe(1);
    expect(anim.done()).toBe(true);
  });

  it('reduceMotion: first tick returns 1', () => {
    const anim = morph({ reduceMotion: true });
    anim.tick(1000);
    anim.tick(1001);
    expect(anim.value()).toBe(1);
    expect(anim.done()).toBe(true);
  });
});

describe('slideIn', () => {
  it('animates x from distance to 0 and opacity from 0 to 1', () => {
    const anim = slideIn(4);
    const start = 1000;
    anim.tick(start);
    const initial = anim.value() as SlideInValue;
    expect(initial.x).toBe(4);
    expect(initial.opacity).toBe(0);

    anim.tick(start + 280);
    const final = anim.value() as SlideInValue;
    expect(final.x).toBe(0);
    expect(final.opacity).toBe(1);
    expect(anim.done()).toBe(true);
  });

  it('reduceMotion: first tick is at the settled state', () => {
    const anim = slideIn(4, { reduceMotion: true });
    anim.tick(1000);
    anim.tick(1001);
    const v = anim.value() as SlideInValue;
    expect(v.x).toBe(0);
    expect(v.opacity).toBe(1);
    expect(anim.done()).toBe(true);
  });

  it('default distance is 4 cells', () => {
    const anim = slideIn();
    anim.tick(1000);
    const initial = anim.value() as SlideInValue;
    expect(initial.x).toBe(4);
  });
});

describe('uiPresets registry', () => {
  it('exposes all five presets by name', () => {
    expect(uiPresets.softFade).toBe(softFade);
    expect(uiPresets.snap).toBe(snap);
    expect(uiPresets.pulse).toBe(pulseUi);
    expect(uiPresets.morph).toBe(morph);
    expect(uiPresets.slideIn).toBe(slideIn);
  });
});

describe('UI_PRESET_DESCRIPTORS', () => {
  it('has descriptor metadata for every preset', () => {
    expect(UI_PRESET_DESCRIPTORS.softFade.defaultDurationMs).toBe(200);
    expect(UI_PRESET_DESCRIPTORS.snap.defaultDurationMs).toBe(100);
    expect(UI_PRESET_DESCRIPTORS.pulse.defaultDurationMs).toBe(1600);
    expect(UI_PRESET_DESCRIPTORS.morph.defaultDurationMs).toBe(240);
    expect(UI_PRESET_DESCRIPTORS.slideIn.defaultDurationMs).toBe(280);
  });

  it('flags pulse as the only looping preset', () => {
    expect(UI_PRESET_DESCRIPTORS.pulse.loops).toBe(true);
    expect(UI_PRESET_DESCRIPTORS.softFade.loops).toBe(false);
    expect(UI_PRESET_DESCRIPTORS.snap.loops).toBe(false);
    expect(UI_PRESET_DESCRIPTORS.morph.loops).toBe(false);
    expect(UI_PRESET_DESCRIPTORS.slideIn.loops).toBe(false);
  });

  it('descriptor object is frozen', () => {
    expect(Object.isFrozen(UI_PRESET_DESCRIPTORS)).toBe(true);
  });
});

describe('reduce-motion final-frame contract', () => {
  // Each preset, with reduceMotion off, must reach the same final value
  // as it would with reduceMotion on. This is the "motion is decorative;
  // content survives" contract.
  it('softFade settles to 1 in both modes', () => {
    const animOn = softFade({ reduceMotion: false });
    animOn.tick(1000);
    animOn.tick(1200);
    const animOff = softFade({ reduceMotion: true });
    animOff.tick(1000);
    animOff.tick(1001);
    expect(animOn.value()).toBe(animOff.value());
  });

  it('snap settles to 0 in both modes', () => {
    const animOn = snap({ reduceMotion: false });
    animOn.tick(1000);
    animOn.tick(1100);
    const animOff = snap({ reduceMotion: true });
    animOff.tick(1000);
    animOff.tick(1001);
    expect(animOn.value()).toBe(animOff.value());
  });

  it('morph settles to 1 in both modes', () => {
    const animOn = morph({ reduceMotion: false });
    animOn.tick(1000);
    animOn.tick(1240);
    const animOff = morph({ reduceMotion: true });
    animOff.tick(1000);
    animOff.tick(1001);
    expect(animOn.value()).toBe(animOff.value());
  });

  it('slideIn settles to {x:0, opacity:1} in both modes', () => {
    const animOn = slideIn(4, { reduceMotion: false });
    animOn.tick(1000);
    animOn.tick(1280);
    const animOff = slideIn(4, { reduceMotion: true });
    animOff.tick(1000);
    animOff.tick(1001);
    expect(animOn.value()).toEqual(animOff.value());
  });
});
