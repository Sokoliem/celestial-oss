import { describe, expect, it } from 'vitest';
import { type BreakpointName, type BreakpointThresholds, breakpointPlugin, createBreakpointContext } from '../breakpoint.js';
import { text } from '../elements.js';
import { effect } from '../signals.js';
import { Cmd, Sub } from '../types.js';

// ─── createBreakpointContext ─────────────────────────────────────────────────

describe('createBreakpointContext', () => {
  it('creates context with default thresholds', () => {
    const ctx = createBreakpointContext();
    expect(ctx).toBeDefined();
    expect(typeof ctx.current).toBe('function');
    expect(typeof ctx.size).toBe('function');
    expect(typeof ctx.isAtLeast).toBe('function');
    expect(typeof ctx.update).toBe('function');
  });

  it('creates context with custom thresholds', () => {
    const custom: BreakpointThresholds = { sm: 30, md: 60, lg: 100, xl: 140 };
    const ctx = createBreakpointContext(custom);

    // At 50 cols, custom thresholds put us at sm (30-59)
    ctx.update(50, 24);
    expect(ctx.current()).toBe('sm');
  });

  it('defaults to 80x24 dimensions and md breakpoint', () => {
    const ctx = createBreakpointContext();
    // Default initial size is 80x24
    expect(ctx.size()).toEqual({ cols: 80, rows: 24 });
    // 80 cols with default thresholds (sm=40, md=80, lg=120, xl=160) -> md
    expect(ctx.current()).toBe('md');
  });
});

// ─── current() ───────────────────────────────────────────────────────────────

describe('context.current()', () => {
  it('returns xs for columns 0-39', () => {
    const ctx = createBreakpointContext();
    ctx.update(0, 24);
    expect(ctx.current()).toBe('xs');

    ctx.update(20, 24);
    expect(ctx.current()).toBe('xs');

    ctx.update(39, 24);
    expect(ctx.current()).toBe('xs');
  });

  it('returns sm for columns 40-79', () => {
    const ctx = createBreakpointContext();
    ctx.update(40, 24);
    expect(ctx.current()).toBe('sm');

    ctx.update(60, 24);
    expect(ctx.current()).toBe('sm');

    ctx.update(79, 24);
    expect(ctx.current()).toBe('sm');
  });

  it('returns md for columns 80-119', () => {
    const ctx = createBreakpointContext();
    ctx.update(80, 24);
    expect(ctx.current()).toBe('md');

    ctx.update(100, 24);
    expect(ctx.current()).toBe('md');

    ctx.update(119, 24);
    expect(ctx.current()).toBe('md');
  });

  it('returns lg for columns 120-159', () => {
    const ctx = createBreakpointContext();
    ctx.update(120, 24);
    expect(ctx.current()).toBe('lg');

    ctx.update(140, 24);
    expect(ctx.current()).toBe('lg');

    ctx.update(159, 24);
    expect(ctx.current()).toBe('lg');
  });

  it('returns xl for columns 160+', () => {
    const ctx = createBreakpointContext();
    ctx.update(160, 24);
    expect(ctx.current()).toBe('xl');

    ctx.update(200, 24);
    expect(ctx.current()).toBe('xl');

    ctx.update(500, 24);
    expect(ctx.current()).toBe('xl');
  });
});

// ─── size() ──────────────────────────────────────────────────────────────────

describe('context.size()', () => {
  it('returns current dimensions after update', () => {
    const ctx = createBreakpointContext();
    ctx.update(120, 40);
    expect(ctx.size()).toEqual({ cols: 120, rows: 40 });
  });

  it('returns updated dimensions after multiple updates', () => {
    const ctx = createBreakpointContext();
    ctx.update(80, 24);
    expect(ctx.size()).toEqual({ cols: 80, rows: 24 });

    ctx.update(200, 50);
    expect(ctx.size()).toEqual({ cols: 200, rows: 50 });
  });
});

// ─── update() reactivity ────────────────────────────────────────────────────

describe('context.update() reactivity', () => {
  it('triggers reactive effects when breakpoint changes', () => {
    const ctx = createBreakpointContext();
    const history: BreakpointName[] = [];

    const dispose = effect(() => {
      history.push(ctx.current());
    });

    // Initial: md (80 cols default)
    expect(history).toEqual(['md']);

    ctx.update(30, 24); // -> xs
    expect(history).toEqual(['md', 'xs']);

    ctx.update(60, 24); // -> sm
    expect(history).toEqual(['md', 'xs', 'sm']);

    dispose();
  });

  it('does not trigger effect when breakpoint stays the same', () => {
    const ctx = createBreakpointContext();
    const history: BreakpointName[] = [];

    const dispose = effect(() => {
      history.push(ctx.current());
    });

    // Initial: md (80 cols)
    expect(history).toEqual(['md']);

    // Still md (90 cols, same breakpoint)
    ctx.update(90, 24);
    expect(history).toEqual(['md']);

    // Still md (100 cols, same breakpoint)
    ctx.update(100, 24);
    expect(history).toEqual(['md']);

    dispose();
  });

  it('triggers size effect when dimensions change', () => {
    const ctx = createBreakpointContext();
    const sizes: Array<{ cols: number; rows: number }> = [];

    const dispose = effect(() => {
      sizes.push(ctx.size());
    });

    expect(sizes).toEqual([{ cols: 80, rows: 24 }]);

    ctx.update(120, 40);
    expect(sizes).toEqual([
      { cols: 80, rows: 24 },
      { cols: 120, rows: 40 },
    ]);

    dispose();
  });
});

// ─── isAtLeast() ─────────────────────────────────────────────────────────────

describe('context.isAtLeast()', () => {
  it('returns a signal that tracks whether current bp >= given bp', () => {
    const ctx = createBreakpointContext();
    ctx.update(80, 24); // md

    expect(ctx.isAtLeast('xs')()).toBe(true);
    expect(ctx.isAtLeast('sm')()).toBe(true);
    expect(ctx.isAtLeast('md')()).toBe(true);
    expect(ctx.isAtLeast('lg')()).toBe(false);
    expect(ctx.isAtLeast('xl')()).toBe(false);
  });

  it('updates reactively when breakpoint changes', () => {
    const ctx = createBreakpointContext();
    ctx.update(80, 24); // md

    const isLg = ctx.isAtLeast('lg');
    expect(isLg()).toBe(false);

    ctx.update(130, 24); // lg
    expect(isLg()).toBe(true);

    ctx.update(50, 24); // sm
    expect(isLg()).toBe(false);
  });

  it('returns true for xs at any width', () => {
    const ctx = createBreakpointContext();
    ctx.update(0, 24);
    expect(ctx.isAtLeast('xs')()).toBe(true);
  });

  it('tracks correctly via effects', () => {
    const ctx = createBreakpointContext();
    const results: boolean[] = [];

    const isMd = ctx.isAtLeast('md');
    const dispose = effect(() => {
      results.push(isMd());
    });

    // Initial: md (80 cols) -> true
    expect(results).toEqual([true]);

    ctx.update(30, 24); // xs -> false
    expect(results).toEqual([true, false]);

    ctx.update(100, 24); // md -> true
    expect(results).toEqual([true, false, true]);

    dispose();
  });
});

// ─── Threshold boundaries ────────────────────────────────────────────────────

describe('threshold boundaries (default)', () => {
  it('xs: 0-39 (below sm threshold)', () => {
    const ctx = createBreakpointContext();
    ctx.update(39, 24);
    expect(ctx.current()).toBe('xs');
    ctx.update(40, 24);
    expect(ctx.current()).toBe('sm');
  });

  it('sm: 40-79 (at sm threshold, below md)', () => {
    const ctx = createBreakpointContext();
    ctx.update(40, 24);
    expect(ctx.current()).toBe('sm');
    ctx.update(79, 24);
    expect(ctx.current()).toBe('sm');
    ctx.update(80, 24);
    expect(ctx.current()).toBe('md');
  });

  it('md: 80-119 (at md threshold, below lg)', () => {
    const ctx = createBreakpointContext();
    ctx.update(80, 24);
    expect(ctx.current()).toBe('md');
    ctx.update(119, 24);
    expect(ctx.current()).toBe('md');
    ctx.update(120, 24);
    expect(ctx.current()).toBe('lg');
  });

  it('lg: 120-159 (at lg threshold, below xl)', () => {
    const ctx = createBreakpointContext();
    ctx.update(120, 24);
    expect(ctx.current()).toBe('lg');
    ctx.update(159, 24);
    expect(ctx.current()).toBe('lg');
    ctx.update(160, 24);
    expect(ctx.current()).toBe('xl');
  });

  it('xl: 160+ (at xl threshold and above)', () => {
    const ctx = createBreakpointContext();
    ctx.update(160, 24);
    expect(ctx.current()).toBe('xl');
    ctx.update(1000, 24);
    expect(ctx.current()).toBe('xl');
  });
});

// ─── Custom thresholds ──────────────────────────────────────────────────────

describe('custom thresholds', () => {
  it('uses custom threshold values correctly', () => {
    const ctx = createBreakpointContext({ sm: 20, md: 50, lg: 80, xl: 120 });

    ctx.update(10, 24);
    expect(ctx.current()).toBe('xs');

    ctx.update(20, 24);
    expect(ctx.current()).toBe('sm');

    ctx.update(50, 24);
    expect(ctx.current()).toBe('md');

    ctx.update(80, 24);
    expect(ctx.current()).toBe('lg');

    ctx.update(120, 24);
    expect(ctx.current()).toBe('xl');
  });
});

// ─── breakpointPlugin ────────────────────────────────────────────────────────

describe('breakpointPlugin', () => {
  it('creates a valid Plugin with name and context property', () => {
    const plugin = breakpointPlugin();
    expect(plugin.name).toBe('breakpoint');
    expect(plugin.context).toBeDefined();
    expect(typeof plugin.context.current).toBe('function');
    expect(typeof plugin.context.size).toBe('function');
    expect(typeof plugin.context.update).toBe('function');
    expect(typeof plugin.context.isAtLeast).toBe('function');
  });

  it('accepts custom thresholds', () => {
    const plugin = breakpointPlugin({ sm: 30, md: 60, lg: 100, xl: 140 });
    plugin.context.update(50, 24);
    expect(plugin.context.current()).toBe('sm');
  });

  it('has a wrap function that injects resize subscription', () => {
    const plugin = breakpointPlugin();
    expect(typeof plugin.wrap).toBe('function');
  });

  it('wraps subscriptions to include resize handling', () => {
    const plugin = breakpointPlugin();

    const config = {
      init: () => [{ count: 0 }, Cmd.none()] as [{ count: number }, ReturnType<typeof Cmd.none>],
      update: (_msg: unknown, model: { count: number }) => [model, Cmd.none()] as [{ count: number }, ReturnType<typeof Cmd.none>],
      view: (model: { count: number }) => text(`${model.count}`),
      subscriptions: () => Sub.none(),
    };

    const wrapped = plugin.wrap!(config as any);

    // The wrapped config should still work
    expect(wrapped.init).toBeDefined();
    expect(wrapped.update).toBeDefined();
    expect(wrapped.view).toBeDefined();
    expect(wrapped.subscriptions).toBeDefined();
  });
});
