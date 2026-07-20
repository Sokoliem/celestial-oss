import { describe, expect, it } from 'vitest';
import { createTransition, fadeTransition, slide, slideTransition, type TransitionState, wipeTransition } from '../index.js';

function expectState(state: TransitionState, progress: number, complete: boolean): void {
  expect(state.progress).toBeCloseTo(progress, 5);
  expect(state.complete).toBe(complete);
}

describe('transition builders', () => {
  it('slideTransition creates a controller that animates and renders slide frames', () => {
    const controller = slideTransition({ direction: 'left', duration: 10 });

    const started = controller.start(100);
    expect(started.startTime).toBe(100);
    expectState(started, 0, false);

    const mid = controller.tick(started, 105);
    expectState(mid, 0.5, false);

    const rendered = controller.render('OLD', 'NEW', mid);
    expect(typeof rendered).toBe('string');
    expect(rendered).not.toBe('NEW');
  });

  it('fadeTransition completes and renders the new content at progress 1', () => {
    const controller = fadeTransition({ duration: 8 });
    const started = controller.start(10);
    const done = controller.tick(started, 18);

    expectState(done, 1, true);
    expect(controller.render('old', 'new', done)).toBe('new');
  });

  it('wipeTransition supports directional rendering', () => {
    const controller = wipeTransition({ direction: 'down', duration: 6 });
    const state = controller.tick(controller.start(0), 3);
    const rendered = controller.render('old\nold', 'new\nnew', state);

    expect(typeof rendered).toBe('string');
    expect(rendered).not.toBe('new\nnew');
  });

  it('createTransition derives slide direction from opposing enter and exit configs', () => {
    const controller = createTransition({
      enter: { type: 'slide', direction: 'right', duration: 12 },
      exit: { type: 'slide', direction: 'left', duration: 12 },
    });

    const state = controller.tick(controller.start(5), 11);
    expectState(state, 0.5, false);
    expect(controller.render('ABCD', 'WXYZ', state)).toBe(slide('ABCD', 'WXYZ', 0.5, 'left'));
  });

  it('createTransition supports easing functions', () => {
    const controller = createTransition({
      type: 'wipe',
      direction: 'left',
      duration: 10,
      easing: () => 1,
    });

    const state = controller.tick(controller.start(0), 1);
    expectState(state, 1, true);
    expect(controller.render('old', 'new', state)).toBe('new');
  });
});
