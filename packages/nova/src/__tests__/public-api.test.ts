import { describe, expect, it } from 'vitest';
import {
  beginTransition,
  blur,
  blurTransition,
  captureElements,
  createGestureTransition,
  createSharedElementState,
  createSharedElementTransition,
  createSpringTransition,
  createSwipeNavigator,
  createTransition,
  crossfade,
  dissolve,
  dissolveTransition,
  endTransition,
  fadeChar,
  fadeLinePerChar,
  fadeStyledChar,
  fadeText,
  fadeTransition,
  getInterpolatedRect,
  getTransitionProgress,
  isTransitioning,
  morph,
  morphTransition,
  parseStyledChars,
  resetTransitionState,
  slide,
  slideTransition,
  stripAnsi,
  transition,
  wipe,
  wipeTransition,
  zoom,
  zoomTransition,
} from '../index.js';

describe('public API', () => {
  it('re-exports the documented transition primitives and helpers from the package root', () => {
    expect(typeof transition).toBe('function');
    expect(typeof resetTransitionState).toBe('function');
    expect(typeof slide).toBe('function');
    expect(typeof crossfade).toBe('function');
    expect(typeof wipe).toBe('function');
    expect(typeof morph).toBe('function');
    expect(typeof fadeText).toBe('function');
    expect(typeof fadeChar).toBe('function');
    expect(typeof fadeLinePerChar).toBe('function');
    expect(typeof fadeStyledChar).toBe('function');
    expect(typeof parseStyledChars).toBe('function');
    expect(typeof stripAnsi).toBe('function');
  });

  it('re-exports new strategy functions from the package root', () => {
    expect(typeof blur).toBe('function');
    expect(typeof dissolve).toBe('function');
    expect(typeof zoom).toBe('function');
  });

  it('re-exports the documented builder APIs from the package root', () => {
    expect(typeof createTransition).toBe('function');
    expect(typeof createSwipeNavigator).toBe('function');
    expect(typeof slideTransition).toBe('function');
    expect(typeof fadeTransition).toBe('function');
    expect(typeof wipeTransition).toBe('function');
  });

  it('re-exports new builder convenience functions from the package root', () => {
    expect(typeof morphTransition).toBe('function');
    expect(typeof blurTransition).toBe('function');
    expect(typeof dissolveTransition).toBe('function');
    expect(typeof zoomTransition).toBe('function');
  });

  it('re-exports shared-element helpers from the package root', () => {
    expect(typeof createSharedElementState).toBe('function');
    expect(typeof captureElements).toBe('function');
    expect(typeof beginTransition).toBe('function');
    expect(typeof endTransition).toBe('function');
    expect(typeof getTransitionProgress).toBe('function');
    expect(typeof isTransitioning).toBe('function');
    expect(typeof getInterpolatedRect).toBe('function');
  });

  it('re-exports spring transition from the package root', () => {
    expect(typeof createSpringTransition).toBe('function');
  });

  it('re-exports gesture transition from the package root', () => {
    expect(typeof createGestureTransition).toBe('function');
  });

  it('re-exports shared element transition compositor from the package root', () => {
    expect(typeof createSharedElementTransition).toBe('function');
  });
});
