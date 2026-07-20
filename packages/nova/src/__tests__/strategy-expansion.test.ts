import { beforeEach, describe, expect, it } from 'vitest';
import {
  createGestureTransition,
  createSharedElementTransition,
  createSpringTransition,
  createTransition,
  flip,
  flipTransition,
  resetTransitionState,
  ripple,
  rippleTransition,
  transition,
  transitionEffect,
  typewriterReveal,
  typewriterTransition,
} from '../index.js';

describe('new Nova strategies', () => {
  beforeEach(() => {
    resetTransitionState();
  });

  describe('pure strategies', () => {
    it('ripple returns old content at 0 and new content at 1', () => {
      expect(ripple('old', 'new', 0)).toBe('old');
      expect(ripple('old', 'new', 1)).toBe('new');
    });

    it('ripple origin changes the rendered frame', () => {
      const fromCorner = ripple('AAAA\nAAAA', 'BBBB\nBBBB', 0.35, 0, 0);
      const fromCenter = ripple('AAAA\nAAAA', 'BBBB\nBBBB', 0.35, 0.5, 0.5);
      expect(fromCorner).not.toBe(fromCenter);
    });

    it('flip renders a visible edge at the midpoint for both axes', () => {
      expect(flip('ABCD', 'WXYZ', 0.5)).toContain('│');
      expect(flip('ABCD\nEFGH', 'WXYZ\nIJKL', 0.5, 'vertical')).toContain('─');
    });

    it('typewriter reveals new content with a cursor before completion', () => {
      const frame = typewriterReveal('OLD', 'NEW', 0.5, '|');
      expect(frame).toContain('|');
      expect(frame).not.toBe('OLD');
      expect(frame).not.toBe('NEW');
    });
  });

  describe('builder surface', () => {
    it('exports new builder helpers', () => {
      expect(typeof rippleTransition).toBe('function');
      expect(typeof flipTransition).toBe('function');
      expect(typeof typewriterTransition).toBe('function');
    });

    it('createTransition supports ripple and its origin option', () => {
      const corner = createTransition({
        type: 'ripple',
        duration: 10,
        rippleOrigin: { x: 0, y: 0 },
      });
      const center = createTransition({
        type: 'ripple',
        duration: 10,
        rippleOrigin: { x: 0.5, y: 0.5 },
      });

      const cornerFrame = corner.render('AAAA\nAAAA', 'BBBB\nBBBB', corner.tick(corner.start(0), 5));
      const centerFrame = center.render('AAAA\nAAAA', 'BBBB\nBBBB', center.tick(center.start(0), 5));
      expect(cornerFrame).not.toBe(centerFrame);
    });

    it('flipTransition passes flipAxis through to the strategy', () => {
      const horizontal = flipTransition({ duration: 10, flipAxis: 'horizontal' });
      const vertical = flipTransition({ duration: 10, flipAxis: 'vertical' });

      const horizontalFrame = horizontal.render('ABCD\nEFGH', 'WXYZ\nIJKL', horizontal.tick(horizontal.start(0), 5));
      const verticalFrame = vertical.render('ABCD\nEFGH', 'WXYZ\nIJKL', vertical.tick(vertical.start(0), 5));
      expect(horizontalFrame).toContain('│');
      expect(verticalFrame).toContain('─');
    });

    it('typewriterTransition passes a custom cursor through to the strategy', () => {
      const controller = typewriterTransition({ duration: 10, typewriterCursor: '|' });
      const frame = controller.render('OLD', 'NEW', controller.tick(controller.start(0), 5));
      expect(frame).toContain('|');
    });
  });

  describe('stateful and controller APIs', () => {
    it('transition() supports ripple and forwards rippleOrigin', () => {
      transition('AAAA\nAAAA', { key: 'a', id: 'ripple-a', type: 'ripple', tick: 0, duration: 10 });
      transition('BBBB\nBBBB', { key: 'b', id: 'ripple-a', type: 'ripple', tick: 1, duration: 10, rippleOrigin: { x: 0, y: 0 } });
      const corner = transition('BBBB\nBBBB', { key: 'b', id: 'ripple-a', type: 'ripple', tick: 5, duration: 10, rippleOrigin: { x: 0, y: 0 } });

      transition('AAAA\nAAAA', { key: 'a', id: 'ripple-b', type: 'ripple', tick: 0, duration: 10 });
      transition('BBBB\nBBBB', { key: 'b', id: 'ripple-b', type: 'ripple', tick: 1, duration: 10, rippleOrigin: { x: 0.5, y: 0.5 } });
      const center = transition('BBBB\nBBBB', { key: 'b', id: 'ripple-b', type: 'ripple', tick: 5, duration: 10, rippleOrigin: { x: 0.5, y: 0.5 } });

      expect(corner).not.toBe(center);
    });

    it('transitionEffect supports flip and typewriter options', () => {
      const flipEffect = transitionEffect('flip', { duration: 10, flipAxis: 'vertical' });
      flipEffect.tick(0);
      flipEffect.tick(5);
      expect(flipEffect.apply('ABCD\nEFGH', 'WXYZ\nIJKL')).toContain('─');

      const typewriterEffect = transitionEffect('typewriter', { duration: 10, typewriterCursor: '|' });
      typewriterEffect.tick(0);
      typewriterEffect.tick(5);
      expect(typewriterEffect.apply('OLD', 'NEW')).toContain('|');
    });

    it('createSpringTransition supports typewriter cursor forwarding', () => {
      const controller = createSpringTransition({
        strategy: 'typewriter',
        typewriterCursor: '|',
        spring: { stiffness: 400, damping: 25 },
      });

      controller.start(0);
      controller.tick(32);
      expect(controller.render('OLD', 'NEW')).toContain('|');
    });

    it('createGestureTransition supports flip axis forwarding', () => {
      const controller = createGestureTransition({
        strategy: 'flip',
        flipAxis: 'vertical',
      });

      controller.dragStart();
      controller.drag(1, 2);
      expect(controller.render('ABCD\nEFGH', 'WXYZ\nIJKL')).toContain('─');
    });

    it('createSharedElementTransition supports ripple origin forwarding', () => {
      const corner = createSharedElementTransition({
        strategy: 'ripple',
        rippleOrigin: { x: 0, y: 0 },
        duration: 10,
      });
      const center = createSharedElementTransition({
        strategy: 'ripple',
        rippleOrigin: { x: 0.5, y: 0.5 },
        duration: 10,
      });

      const cornerState = corner.tick(corner.begin(corner.init(), 0), 5);
      const centerState = center.tick(center.begin(center.init(), 0), 5);

      expect(corner.renderBackground(cornerState, 'AAAA\nAAAA', 'BBBB\nBBBB')).not.toBe(center.renderBackground(centerState, 'AAAA\nAAAA', 'BBBB\nBBBB'));
    });
  });
});
