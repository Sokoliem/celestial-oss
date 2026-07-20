import { createBreakpointContext, type VNode } from '@celestial/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import {
  breakpoint,
  getBreakpointContext,
  getBreakpointDefinition,
  getBreakpointOrder,
  getCanonicalBreakpointMap,
  isCanonicalBreakpointName,
  normalizeResponsiveBreakpointName,
  resolveBreakpointName,
  resolveConditional,
  resolveWhen,
  responsive,
  setBreakpointContext,
  setTerminalSize,
  traceResponsive,
  when,
} from '../index.js';

describe('responsive', () => {
  afterEach(() => {
    setBreakpointContext(null);
    setTerminalSize(null);
  });

  describe('when()', () => {
    it('builds breakpoint conditions', () => {
      const cond = when({ min: 100 });
      expect(cond._tag).toBe('when');
      expect(cond.min).toBe(100);
    });

    it('builds conditional values', () => {
      const cond = when({ min: 100 }, 'row', 'column');
      expect(cond._tag).toBe('when-conditional');
      expect(cond.ifTrue).toBe('row');
      expect(cond.ifFalse).toBe('column');
    });
  });

  describe('resolveWhen()', () => {
    it('resolves simple ranges', () => {
      setTerminalSize({ cols: 120, rows: 24 });
      expect(resolveWhen(when({ min: 100 }))).toBe(true);
      expect(resolveWhen(when({ max: 60 }))).toBe(false);
    });

    it('resolves predicate conditions', () => {
      setTerminalSize({ cols: 120, rows: 24 });
      expect(resolveWhen(when((width) => width >= 100))).toBe(true);
      expect(resolveWhen(when((width) => width < 80))).toBe(false);
    });

    it('prefers the active breakpoint context over terminal overrides', () => {
      const ctx = createBreakpointContext();
      ctx.update(140, 50);
      setTerminalSize({ cols: 20, rows: 24 });
      setBreakpointContext(ctx);

      expect(getBreakpointContext()).toBe(ctx);
      expect(resolveWhen(when({ min: 120 }))).toBe(true);
      expect(resolveWhen(when((width) => width >= 120))).toBe(true);

      setBreakpointContext(null);
      expect(resolveWhen(when({ min: 120 }))).toBe(false);
    });
  });

  describe('resolveConditional()', () => {
    it('returns ifTrue or ifFalse based on current width', () => {
      const cond = when({ min: 100 }, 'row', 'column');
      setTerminalSize({ cols: 120, rows: 24 });
      expect(resolveConditional(cond)).toBe('row');
      setTerminalSize({ cols: 50, rows: 24 });
      expect(resolveConditional(cond)).toBe('column');
    });
  });

  describe('breakpoint registry', () => {
    it('exposes canonical breakpoint ranges', () => {
      expect(breakpoint.xs).toEqual({ max: 39 });
      expect(breakpoint.sm).toEqual({ min: 40, max: 79 });
      expect(breakpoint.md).toEqual({ min: 80, max: 119 });
      expect(breakpoint.lg).toEqual({ min: 120, max: 159 });
      expect(breakpoint.xl).toEqual({ min: 160 });
    });

    it('keeps legacy aliases mapped to canonical ranges', () => {
      expect(breakpoint.compact).toEqual(breakpoint.xs);
      expect(breakpoint.narrow).toEqual(breakpoint.sm);
      expect(breakpoint.standard).toEqual(breakpoint.md);
      expect(breakpoint.wide).toEqual(breakpoint.lg);
    });
  });

  describe('breakpoint utilities', () => {
    it('resolves canonical definitions and names', () => {
      expect(getBreakpointDefinition('compact')).toEqual({ max: 39 });
      expect(getCanonicalBreakpointMap()).toEqual({
        xs: { max: 39 },
        sm: { min: 40, max: 79 },
        md: { min: 80, max: 119 },
        lg: { min: 120, max: 159 },
        xl: { min: 160 },
      });
      expect(getBreakpointOrder()).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
      expect(isCanonicalBreakpointName('md')).toBe(true);
      expect(isCanonicalBreakpointName('wide')).toBe(false);
      expect(resolveBreakpointName(39)).toBe('xs');
      expect(resolveBreakpointName(80)).toBe('md');
      expect(resolveBreakpointName(160)).toBe('xl');
    });
  });

  describe('normalizeResponsiveBreakpointName()', () => {
    it('normalizes legacy names to canonical names', () => {
      expect(normalizeResponsiveBreakpointName('compact')).toBe('xs');
      expect(normalizeResponsiveBreakpointName('narrow')).toBe('sm');
      expect(normalizeResponsiveBreakpointName('standard')).toBe('md');
      expect(normalizeResponsiveBreakpointName('wide')).toBe('lg');
      expect(normalizeResponsiveBreakpointName('xl')).toBe('xl');
    });
  });

  describe('responsive()', () => {
    it('selects the matching canonical breakpoint layout', () => {
      setTerminalSize({ cols: 80, rows: 24 });
      const xsLayout: VNode = { kind: 'text', content: 'xs' };
      const mdLayout: VNode = { kind: 'text', content: 'md' };
      const result = responsive({ xs: xsLayout, md: mdLayout });
      expect(result.kind).toBe('component');
      expect(result.render()).toBe(mdLayout);
    });

    it('accepts legacy breakpoint keys as aliases', () => {
      setTerminalSize({ cols: 80, rows: 24 });
      const compactLayout: VNode = { kind: 'text', content: 'compact' };
      const standardLayout: VNode = { kind: 'text', content: 'standard' };
      const result = responsive({ compact: compactLayout, standard: standardLayout });
      expect(result.render()).toBe(standardLayout);
    });

    it('falls back to the last entry when nothing matches', () => {
      setTerminalSize({ cols: 80, rows: 24 });
      const xsLayout: VNode = { kind: 'text', content: 'xs' };
      const xlLayout: VNode = { kind: 'text', content: 'xl' };
      const result = responsive({ xs: xsLayout, xl: xlLayout });
      expect(result.render()).toBe(xlLayout);
    });

    it('prefers the more specific matching breakpoint', () => {
      breakpoint.any = { min: 1 };
      setTerminalSize({ cols: 80, rows: 24 });

      const mdLayout: VNode = { kind: 'text', content: 'md' };
      const anyLayout: VNode = { kind: 'text', content: 'any' };

      expect(responsive({ any: anyLayout, md: mdLayout }).render()).toBe(mdLayout);
      expect(responsive({ md: mdLayout, any: anyLayout }).render()).toBe(mdLayout);

      delete breakpoint.any;
    });

    it('re-evaluates on each render call', () => {
      const xsLayout: VNode = { kind: 'text', content: 'xs' };
      const lgLayout: VNode = { kind: 'text', content: 'lg' };
      const result = responsive({ xs: xsLayout, lg: lgLayout });

      setTerminalSize({ cols: 30, rows: 24 });
      expect(result.render()).toBe(xsLayout);

      setTerminalSize({ cols: 150, rows: 24 });
      expect(result.render()).toBe(lgLayout);
    });

    it('uses breakpoint context when present', () => {
      const ctx = createBreakpointContext();
      ctx.update(150, 40);
      setTerminalSize({ cols: 30, rows: 24 });
      setBreakpointContext(ctx);

      const xsLayout: VNode = { kind: 'text', content: 'xs' };
      const lgLayout: VNode = { kind: 'text', content: 'lg' };
      const result = responsive({ xs: xsLayout, lg: lgLayout });

      expect(result.render()).toBe(lgLayout);
    });
  });

  describe('traceResponsive()', () => {
    it('reports canonical breakpoint metadata', () => {
      const compactLayout: VNode = { kind: 'text', content: 'compact' };
      const standardLayout: VNode = { kind: 'text', content: 'standard' };
      const trace = traceResponsive({ cols: 80, rows: 24 }, { xs: compactLayout, md: standardLayout });
      expect(trace.canonicalBreakpoint).toBe('md');
      expect(trace.matchedBreakpoint).toBe('md');
      expect(trace.selected).toBe(standardLayout);
    });
  });
});
