import { type AppConfig, Cmd, Sub, text } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { assertFinalFramesMatchAcrossMotionModes, renderInBothMotionModes } from '../motion-modes.js';

interface Model {
  reduceMotion: boolean;
  ticks: number;
}

type Msg = { type: 'tick' };

function makeApp(reduceMotion: boolean, finalLabel: string): AppConfig<Model, Msg> {
  return {
    init: () => [{ reduceMotion, ticks: 0 }, Cmd.none()],
    update: (_msg, model) => [{ ...model, ticks: model.ticks + 1 }, Cmd.none()],
    view: (model) => text(model.reduceMotion ? finalLabel : `motion-on:${model.ticks}`),
    subscriptions: () => Sub.batch(Sub.key('up', { type: 'tick' } as Msg)),
  };
}

describe('renderInBothMotionModes', () => {
  it('builds two test apps with distinct reduceMotion flags', () => {
    const runner = renderInBothMotionModes((reduceMotion) => makeApp(reduceMotion, 'settled'));
    try {
      expect(runner.motionOn.model.reduceMotion).toBe(false);
      expect(runner.motionOff.model.reduceMotion).toBe(true);
    } finally {
      runner.stop();
    }
  });

  it('renders the reduceMotion-aware view for each app', () => {
    const runner = renderInBothMotionModes((reduceMotion) => makeApp(reduceMotion, 'settled'));
    try {
      expect(runner.motionOn.lastFrame()).toContain('motion-on:0');
      expect(runner.motionOff.lastFrame()).toContain('settled');
    } finally {
      runner.stop();
    }
  });

  it('stop() is idempotent', () => {
    const runner = renderInBothMotionModes((reduceMotion) => makeApp(reduceMotion, 'settled'));
    runner.stop();
    expect(() => runner.stop()).not.toThrow();
  });

  it('test apps remain independently driveable', () => {
    const runner = renderInBothMotionModes((reduceMotion) => makeApp(reduceMotion, 'settled'));
    try {
      runner.motionOn.dispatch({ type: 'tick' });
      runner.motionOn.dispatch({ type: 'tick' });
      runner.motionOff.dispatch({ type: 'tick' });

      expect(runner.motionOn.model.ticks).toBe(2);
      expect(runner.motionOff.model.ticks).toBe(1);
    } finally {
      runner.stop();
    }
  });
});

describe('assertFinalFramesMatchAcrossMotionModes', () => {
  it('passes when motion-on settles to the same content as motion-off', async () => {
    // Both modes render the same final content — motion-on already settles
    // at 'motion-on:0' which differs from 'settled', so we make them match.
    await expect(
      assertFinalFramesMatchAcrossMotionModes((reduceMotion) => ({
        init: () => [{ reduceMotion, ticks: 0 }, Cmd.none()],
        update: (_msg, model) => [model, Cmd.none()],
        view: () => text('always-the-same'),
        subscriptions: () => Sub.none(),
      })),
    ).resolves.toBeUndefined();
  });

  it('throws when motion-on and motion-off render different final content', async () => {
    await expect(assertFinalFramesMatchAcrossMotionModes((reduceMotion) => makeApp(reduceMotion, 'settled'))).rejects.toThrow(/final frames differ/);
  });
});
