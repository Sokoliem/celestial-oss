import { describe, expect, it, vi } from 'vitest';
import { classifyPriority, createScheduler } from '../scheduler.js';

describe('Scheduler', () => {
  describe('shouldYield()', () => {
    it('should return false before deadline', () => {
      const scheduler = createScheduler({ frameDeadlineMs: 100 });
      scheduler.resetDeadline();
      expect(scheduler.shouldYield()).toBe(false);
    });

    it('should return true after deadline', async () => {
      const scheduler = createScheduler({ frameDeadlineMs: 1 });
      scheduler.resetDeadline();
      // Busy-wait past the deadline
      const start = performance.now();
      while (performance.now() - start < 5) {
        // spin
      }
      expect(scheduler.shouldYield()).toBe(true);
    });
  });

  describe('scheduleWork()', () => {
    it('should execute scheduled work', async () => {
      const scheduler = createScheduler();
      const fn = vi.fn();
      scheduler.scheduleWork('normal', fn);
      await vi.waitFor(() => {
        expect(fn).toHaveBeenCalledOnce();
      });
    });

    it('should execute higher priority work first', async () => {
      const scheduler = createScheduler();
      const order: string[] = [];
      scheduler.scheduleWork('background', () => order.push('bg'));
      scheduler.scheduleWork('user-blocking', () => order.push('ub'));
      scheduler.scheduleWork('normal', () => order.push('normal'));
      await vi.waitFor(() => {
        expect(order.length).toBe(3);
      });
      expect(order).toEqual(['ub', 'normal', 'bg']);
    });
  });

  describe('generation / interrupt', () => {
    it('should start at generation 0', () => {
      const scheduler = createScheduler();
      expect(scheduler.generation).toBe(0);
    });

    it('should increment generation on interrupt', () => {
      const scheduler = createScheduler();
      scheduler.interrupt();
      expect(scheduler.generation).toBe(1);
      scheduler.interrupt();
      expect(scheduler.generation).toBe(2);
    });
  });

  describe('cancelAll()', () => {
    it('should cancel pending work', async () => {
      const scheduler = createScheduler();
      const fn = vi.fn();
      scheduler.scheduleWork('normal', fn);
      scheduler.cancelAll();
      await new Promise((r) => setTimeout(r, 20));
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('resetDeadline()', () => {
    it('should reset the time slice', () => {
      const scheduler = createScheduler({ frameDeadlineMs: 1000 });
      scheduler.resetDeadline();
      expect(scheduler.shouldYield()).toBe(false);
    });
  });
});

describe('classifyPriority()', () => {
  it('classifies user input as user-blocking', () => {
    expect(classifyPriority('key')).toBe('user-blocking');
    expect(classifyPriority('mouse')).toBe('user-blocking');
    expect(classifyPriority('focus')).toBe('user-blocking');
    expect(classifyPriority('paste')).toBe('user-blocking');
    expect(classifyPriority('resize')).toBe('user-blocking');
  });

  it('classifies timers as normal', () => {
    expect(classifyPriority('timer')).toBe('normal');
    expect(classifyPriority('animationFrame')).toBe('normal');
  });

  it('classifies async sources as background', () => {
    expect(classifyPriority('agent')).toBe('background');
    expect(classifyPriority('fetch')).toBe('background');
    expect(classifyPriority('stream')).toBe('background');
  });
});
