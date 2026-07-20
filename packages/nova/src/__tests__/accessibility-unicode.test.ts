import { describe, expect, it } from 'vitest';
import { createTransition } from '../builders.js';
import { parseStyledChars } from '../fade.js';
import { slide } from '../strategies/slide.js';
import { resetTransitionState, transition } from '../transition.js';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('Unicode-safe transitions', () => {
  const family = '👨‍👩‍👧‍👦';

  it('parses styled content by grapheme cluster', () => {
    const parsed = parseStyledChars(`A${family}e\u0301`);
    expect(parsed.map((entry) => entry.char)).toEqual(['A', family, 'e\u0301']);
  });

  it('never slices a surrogate pair or ZWJ family during a slide', () => {
    const frame = stripAnsi(slide(`${family} old`, `${family} new`, 0.5, 'left'));
    expect(hasUnpairedSurrogate(frame)).toBe(false);
    for (const token of frame.match(/\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*/gu) ?? []) {
      expect(token).toBe(family);
    }
  });
});

describe('reduced-motion transitions', () => {
  it('completes builder transitions immediately', () => {
    const controller = createTransition({ type: 'slide', duration: 100, reduceMotion: true });
    const state = controller.start(0);
    expect(state).toMatchObject({ progress: 1, complete: true });
    expect(controller.render('old', 'new', state)).toBe('new');
  });

  it('skips stateful transition frames', () => {
    resetTransitionState();
    expect(transition('old', { id: 'panel', key: 1, tick: 0, reduceMotion: true })).toBe('old');
    expect(transition('new', { id: 'panel', key: 2, tick: 1, reduceMotion: true })).toBe('new');
  });
});
