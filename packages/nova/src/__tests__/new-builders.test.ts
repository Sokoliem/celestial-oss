import { describe, expect, it } from 'vitest';
import { blurTransition, createTransition, dissolveTransition, morphTransition, type TransitionState, zoomTransition } from '../index.js';

function expectState(state: TransitionState, progress: number, complete: boolean): void {
  expect(state.progress).toBeCloseTo(progress, 5);
  expect(state.complete).toBe(complete);
}

describe('morphTransition builder', () => {
  it('creates a controller that animates morph frames', () => {
    const controller = morphTransition({ duration: 10 });
    const started = controller.start(0);
    expectState(started, 0, false);

    const mid = controller.tick(started, 5);
    expectState(mid, 0.5, false);

    const rendered = controller.render('old', 'new', mid);
    expect(typeof rendered).toBe('string');
  });

  it('returns new content at progress 1', () => {
    const controller = morphTransition({ duration: 10 });
    const done = controller.tick(controller.start(0), 10);
    expectState(done, 1, true);
    expect(controller.render('old', 'new', done)).toBe('new');
  });
});

describe('blurTransition builder', () => {
  it('creates a controller that animates blur frames', () => {
    const controller = blurTransition({ duration: 10 });
    const started = controller.start(0);
    const mid = controller.tick(started, 5);

    const rendered = controller.render('Hello', 'World', mid);
    expect(rendered).toContain('\x1b[38;2;');
  });

  it('returns old content at start and new content at end', () => {
    const controller = blurTransition({ duration: 10 });
    const start = controller.start(0);
    const atZero = controller.tick(start, 0);
    expect(controller.render('old', 'new', atZero)).toBe('old');

    const atEnd = controller.tick(start, 10);
    expect(controller.render('old', 'new', atEnd)).toBe('new');
  });
});

describe('dissolveTransition builder', () => {
  it('creates a controller that animates dissolve frames', () => {
    const controller = dissolveTransition({ duration: 10 });
    const started = controller.start(0);
    const mid = controller.tick(started, 5);

    const rendered = controller.render('AAAA', 'BBBB', mid);
    // At 50%, some chars should have flipped
    expect(rendered).toContain('\x1b[38;2;');
  });

  it('returns old content at start and new content at end', () => {
    const controller = dissolveTransition({ duration: 10 });
    const start = controller.start(0);
    const atZero = controller.tick(start, 0);
    expect(controller.render('old', 'new', atZero)).toBe('old');

    const atEnd = controller.tick(start, 10);
    expect(controller.render('old', 'new', atEnd)).toBe('new');
  });
});

describe('zoomTransition builder', () => {
  it('creates a controller that animates zoom frames', () => {
    const controller = zoomTransition({ duration: 10 });
    const started = controller.start(0);
    const mid = controller.tick(started, 5);

    const rendered = controller.render('old text', 'new text', mid);
    expect(rendered).toContain('\x1b[38;2;');
  });

  it('returns old content at start and new content at end', () => {
    const controller = zoomTransition({ duration: 10 });
    const start = controller.start(0);
    const atZero = controller.tick(start, 0);
    expect(controller.render('old', 'new', atZero)).toBe('old');

    const atEnd = controller.tick(start, 10);
    expect(controller.render('old', 'new', atEnd)).toBe('new');
  });
});

describe('createTransition with new types', () => {
  it('supports morph type', () => {
    const controller = createTransition({ type: 'morph', duration: 10 });
    const state = controller.tick(controller.start(0), 5);
    const rendered = controller.render('old', 'new', state);
    expect(typeof rendered).toBe('string');
  });

  it('supports blur type', () => {
    const controller = createTransition({ type: 'blur', duration: 10 });
    const state = controller.tick(controller.start(0), 5);
    const rendered = controller.render('old', 'new', state);
    expect(typeof rendered).toBe('string');
  });

  it('supports dissolve type', () => {
    const controller = createTransition({ type: 'dissolve', duration: 10 });
    const state = controller.tick(controller.start(0), 5);
    const rendered = controller.render('old', 'new', state);
    expect(typeof rendered).toBe('string');
  });

  it('supports zoom type', () => {
    const controller = createTransition({ type: 'zoom', duration: 10 });
    const state = controller.tick(controller.start(0), 5);
    const rendered = controller.render('old', 'new', state);
    expect(typeof rendered).toBe('string');
  });

  it('applies easing functions to all new types', () => {
    const types = ['morph', 'blur', 'dissolve', 'zoom'] as const;
    for (const type of types) {
      const controller = createTransition({
        type,
        duration: 10,
        easing: (t) => t * t, // ease-in quadratic
      });
      const state = controller.tick(controller.start(0), 5);
      // At raw progress 0.5, eased progress should be 0.25
      expectState(state, 0.25, false);
    }
  });
});

describe('easing in transition builders', () => {
  it('morphTransition accepts easing', () => {
    const controller = morphTransition({
      duration: 10,
      easing: (_t) => 1, // always complete
    });
    const state = controller.tick(controller.start(0), 1);
    expectState(state, 1, true);
    expect(controller.render('old', 'new', state)).toBe('new');
  });

  it('blurTransition accepts easing', () => {
    const controller = blurTransition({
      duration: 10,
      easing: (t) => t * t,
    });
    const state = controller.tick(controller.start(0), 5);
    expectState(state, 0.25, false);
  });

  it('dissolveTransition accepts easing', () => {
    const controller = dissolveTransition({
      duration: 10,
      easing: (t) => t * t,
    });
    const state = controller.tick(controller.start(0), 5);
    expectState(state, 0.25, false);
  });

  it('zoomTransition accepts easing', () => {
    const controller = zoomTransition({
      duration: 10,
      easing: (t) => t * t,
    });
    const state = controller.tick(controller.start(0), 5);
    expectState(state, 0.25, false);
  });
});
