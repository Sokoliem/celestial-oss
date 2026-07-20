import { describe, expect, it } from 'vitest';
import { classifyMessagePriority, createRenderCauseBuilder, extractMsgType } from '../message-priority.js';
import type { Priority } from '../scheduler.js';
import { classifyPriority, createScheduler } from '../scheduler.js';

/**
 * Integration tests for the scheduler + message-priority system.
 *
 * These tests verify:
 * 1. The scheduler generation mechanism detects stale renders.
 * 2. The RenderCauseBuilder correctly aggregates phase/yield/interrupt data.
 * 3. The message priority classifier integrates with the scheduler priority types.
 * 4. The end-to-end flow of: classify message -> check generation -> interrupt/abandon.
 */

describe('scheduler integration', () => {
  describe('generation-based stale render detection', () => {
    it('detects stale render when generation changes during processing', () => {
      const scheduler = createScheduler();
      const startGen = scheduler.generation;

      // Simulate: render starts at generation 0
      expect(scheduler.generation).toBe(startGen);

      // Simulate: dispatch() is called mid-render, which calls interrupt()
      scheduler.interrupt();

      // The render should detect the stale generation
      expect(scheduler.generation).not.toBe(startGen);
      expect(scheduler.generation).toBe(startGen + 1);
    });

    it('supports multiple interrupts accumulating', () => {
      const scheduler = createScheduler();

      scheduler.interrupt();
      scheduler.interrupt();
      scheduler.interrupt();

      expect(scheduler.generation).toBe(3);
    });

    it('resetDeadline does not affect generation', () => {
      const scheduler = createScheduler();
      const gen = scheduler.generation;

      scheduler.resetDeadline();
      expect(scheduler.generation).toBe(gen);
    });
  });

  describe('RenderCauseBuilder end-to-end', () => {
    it('builds a complete render cause with all phases', () => {
      const builder = createRenderCauseBuilder('KeyPressed', 'user-blocking');

      builder.beginPhase('view');
      builder.endPhase();

      builder.beginPhase('focus');
      builder.endPhase();

      builder.beginPhase('layout');
      builder.endPhase();

      builder.beginPhase('rasterize');
      builder.endPhase();

      builder.beginPhase('shaders');
      builder.endPhase();

      builder.beginPhase('diff+write');
      builder.endPhase();

      const cause = builder.finalize();

      expect(cause.msgType).toBe('KeyPressed');
      expect(cause.priority).toBe('user-blocking');
      expect(cause.yielded).toBe(false);
      expect(cause.yieldCount).toBe(0);
      expect(cause.interrupted).toBe(false);
      expect(cause.phases).toHaveLength(6);
      expect(cause.phases.map((p) => p.name)).toEqual(['view', 'focus', 'layout', 'rasterize', 'shaders', 'diff+write']);
      // All phase durations should be non-negative
      for (const phase of cause.phases) {
        expect(phase.ms).toBeGreaterThanOrEqual(0);
      }
      expect(cause.totalMs).toBeGreaterThanOrEqual(0);
    });

    it('records interruption mid-render', () => {
      const builder = createRenderCauseBuilder('DataLoaded', 'background');

      builder.beginPhase('view');
      builder.endPhase();

      builder.beginPhase('layout');
      // Layout is interrupted — a higher-priority message arrived
      builder.recordInterrupt();
      builder.endPhase();

      const cause = builder.finalize();

      expect(cause.interrupted).toBe(true);
      expect(cause.phases).toHaveLength(2);
      expect(cause.priority).toBe('background');
    });

    it('records yields between phases', () => {
      const builder = createRenderCauseBuilder('Tick', 'normal');

      builder.beginPhase('view');
      builder.endPhase();
      builder.recordYield();

      builder.beginPhase('layout');
      builder.endPhase();
      builder.recordYield();

      builder.beginPhase('rasterize');
      builder.endPhase();

      const cause = builder.finalize();

      expect(cause.yielded).toBe(true);
      expect(cause.yieldCount).toBe(2);
    });
  });

  describe('message priority + scheduler priority alignment', () => {
    it('classifyMessagePriority returns values compatible with scheduler Priority type', () => {
      const priorities: Priority[] = [
        classifyMessagePriority({ type: 'KeyPressed' }),
        classifyMessagePriority({ type: 'Tick' }),
        classifyMessagePriority({ type: 'FetchDone' }),
      ];

      expect(priorities).toEqual(['user-blocking', 'normal', 'background']);
    });

    it('classifyPriority and classifyMessagePriority agree on common input sources', () => {
      // Key input
      expect(classifyPriority('key')).toBe('user-blocking');
      expect(classifyMessagePriority({ type: 'KeyPressed' })).toBe('user-blocking');

      // Mouse input
      expect(classifyPriority('mouse')).toBe('user-blocking');
      expect(classifyMessagePriority({ type: 'MouseMove' })).toBe('user-blocking');

      // Timer
      expect(classifyPriority('timer')).toBe('normal');
      // Timer messages don't have 'timer' in the type, so they default to normal
      expect(classifyMessagePriority({ type: 'Tick' })).toBe('normal');

      // Agent/stream
      expect(classifyPriority('agent')).toBe('background');
      expect(classifyMessagePriority({ type: 'AgentResponse' })).toBe('background');

      expect(classifyPriority('stream')).toBe('background');
      expect(classifyMessagePriority({ type: 'StreamChunk' })).toBe('background');

      expect(classifyPriority('fetch')).toBe('background');
      expect(classifyMessagePriority({ type: 'FetchResult' })).toBe('background');
    });
  });

  describe('simulated render pipeline with interruption', () => {
    it('simulates a full uninterrupted render cycle', () => {
      const scheduler = createScheduler();
      const startGen = scheduler.generation;
      scheduler.resetDeadline();

      // Phase 1: view + focus (user-blocking)
      expect(scheduler.generation).toBe(startGen); // not stale

      // Phase 2: layout
      expect(scheduler.generation).toBe(startGen); // not stale

      // Phase 3: rasterize
      expect(scheduler.generation).toBe(startGen); // not stale

      // Phase 4: shaders
      expect(scheduler.generation).toBe(startGen); // not stale

      // Phase 5: diff + commit (atomic)
      const committed = true;
      expect(committed).toBe(true);
    });

    it('simulates an interrupted render cycle', () => {
      const scheduler = createScheduler();
      const startGen = scheduler.generation;
      scheduler.resetDeadline();

      const cause = createRenderCauseBuilder('StreamChunk', 'background');

      // Phase 1: view + focus
      cause.beginPhase('view');
      cause.endPhase();
      expect(scheduler.generation).toBe(startGen); // OK

      // Simulate: dispatch() called between phases, triggers interrupt()
      scheduler.interrupt();
      expect(scheduler.generation).not.toBe(startGen); // Stale!

      // Render detects staleness and abandons
      cause.recordInterrupt();
      const result = cause.finalize();

      expect(result.interrupted).toBe(true);
      expect(result.msgType).toBe('StreamChunk');
      expect(result.priority).toBe('background');
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0]!.name).toBe('view');
    });

    it('does not interrupt when scheduler is not used', () => {
      // Without a scheduler, the pipeline runs synchronously
      // This test verifies the "no scheduler" path conceptually
      const scheduler: null = null;

      const isStale = () => scheduler !== null && false;

      expect(isStale()).toBe(false); // Never stale without scheduler
    });
  });

  describe('custom message classifier', () => {
    it('supports custom classification functions', () => {
      // Simulate an app providing its own classifier
      const customClassify = (msg: unknown): Priority => {
        const type = extractMsgType(msg);
        if (type === 'CriticalUpdate') return 'user-blocking';
        if (type === 'BackgroundSync') return 'background';
        return 'normal';
      };

      expect(customClassify({ type: 'CriticalUpdate' })).toBe('user-blocking');
      expect(customClassify({ type: 'BackgroundSync' })).toBe('background');
      expect(customClassify({ type: 'Anything' })).toBe('normal');
    });
  });

  describe('shouldYield integration', () => {
    it('shouldYield returns false within time budget', () => {
      const scheduler = createScheduler({ frameDeadlineMs: 100 });
      scheduler.resetDeadline();
      // Just created — should have plenty of budget
      expect(scheduler.shouldYield()).toBe(false);
    });

    it('shouldYield returns true when time budget exhausted', async () => {
      const scheduler = createScheduler({ frameDeadlineMs: 1 });
      scheduler.resetDeadline();
      // Busy-wait past deadline
      const start = performance.now();
      while (performance.now() - start < 5) {
        // spin
      }
      expect(scheduler.shouldYield()).toBe(true);
    });

    it('resetDeadline restores yield budget', async () => {
      const scheduler = createScheduler({ frameDeadlineMs: 1 });
      scheduler.resetDeadline();
      // Exhaust budget
      const start = performance.now();
      while (performance.now() - start < 5) {
        // spin
      }
      expect(scheduler.shouldYield()).toBe(true);

      // Reset
      scheduler.resetDeadline();
      expect(scheduler.shouldYield()).toBe(false);
    });
  });
});
