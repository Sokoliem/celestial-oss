import { describe, expect, it } from 'vitest';
import { indeterminateProgress, progressBar, spinner } from '../progress.js';

describe('progressBar', () => {
  it('renders filled and empty segments', () => {
    const vnode = progressBar({ value: 0.5, width: 10 });
    expect(vnode.kind).toBe('text');
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('█████');
      expect(vnode.content).toContain('░░░░░');
    }
  });

  it('at 0% shows all empty', () => {
    const vnode = progressBar({ value: 0, width: 10 });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('░░░░░░░░░░');
      expect(vnode.content).toContain('0%');
    }
  });

  it('at 100% shows all filled', () => {
    const vnode = progressBar({ value: 1, width: 10 });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('██████████');
      expect(vnode.content).toContain('100%');
    }
  });

  it('shows percentage', () => {
    const vnode = progressBar({ value: 0.75, width: 20 });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('75%');
    }
  });

  it('clamps value below 0', () => {
    const vnode = progressBar({ value: -0.5, width: 10 });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('0%');
    }
  });

  it('clamps value above 1', () => {
    const vnode = progressBar({ value: 1.5, width: 10 });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('100%');
    }
  });

  it('uses custom fill and empty characters', () => {
    const vnode = progressBar({ value: 0.5, width: 4, filled: '#', empty: '-' });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('##');
      expect(vnode.content).toContain('--');
    }
  });

  // ── label ─────────────────────────────────────────────────────────────

  it('renders label when provided', () => {
    const vnode = progressBar({ value: 0.5, width: 10, label: 'Loading' });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('Loading');
    }
  });

  it('renders without label by default', () => {
    const vnode = progressBar({ value: 0.5, width: 10 });
    if (vnode.kind === 'text') {
      expect(vnode.content.startsWith('[')).toBe(true);
    }
  });

  // ── showPercentage ────────────────────────────────────────────────────

  it('hides percentage when showPercentage is false', () => {
    const vnode = progressBar({ value: 0.5, width: 10, showPercentage: false });
    if (vnode.kind === 'text') {
      expect(vnode.content).not.toContain('%');
    }
  });

  it('shows percentage by default', () => {
    const vnode = progressBar({ value: 0.5, width: 10 });
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('50%');
    }
  });
});

describe('spinner', () => {
  it('init starts at frame 0', () => {
    const component = spinner({});
    const [model] = component.init();
    expect(model.frame).toBe(0);
  });

  it('update cycles through frames', () => {
    const component = spinner({});
    const [model] = component.init();
    const [updated] = component.update({ type: 'tick' }, model);
    expect(updated.frame).toBe(1);
  });

  it('update wraps around at end of frames', () => {
    const component = spinner({ style: 'line' }); // line has 4 frames
    const model = { frame: 3 };
    const [updated] = component.update({ type: 'tick' }, model);
    expect(updated.frame).toBe(0);
  });

  it('view renders current frame character for dots', () => {
    const component = spinner({ style: 'dots' });
    const model = { frame: 0 };
    const vnode = component.view(model);
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('⠋');
    }
  });

  it('view renders current frame character for line', () => {
    const component = spinner({ style: 'line' });
    const model = { frame: 1 };
    const vnode = component.view(model);
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('/');
    }
  });

  it('view renders current frame character for arc', () => {
    const component = spinner({ style: 'arc' });
    const model = { frame: 0 };
    const vnode = component.view(model);
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('◜');
    }
  });

  it('view renders current frame character for bounce', () => {
    const component = spinner({ style: 'bounce' });
    const model = { frame: 2 };
    const vnode = component.view(model);
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('⠄');
    }
  });

  it('dots style has 10 frames', () => {
    const component = spinner({ style: 'dots' });
    let model = { frame: 0 };
    for (let i = 0; i < 9; i++) {
      [model] = component.update({ type: 'tick' }, model);
    }
    expect(model.frame).toBe(9);
    [model] = component.update({ type: 'tick' }, model);
    expect(model.frame).toBe(0);
  });
});

describe('indeterminateProgress', () => {
  it('init starts at position 0', () => {
    const comp = indeterminateProgress({});
    const [model] = comp.init();
    expect(model.position).toBe(0);
  });

  it('tick advances position', () => {
    const comp = indeterminateProgress({});
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'tick' }, model);
    expect(updated.position).toBe(1);
  });

  it('position wraps at 2x width', () => {
    const comp = indeterminateProgress({ width: 10 });
    const model = { position: 19 };
    const [updated] = comp.update({ type: 'tick' }, model);
    expect(updated.position).toBe(0);
  });

  it('view renders a text node with brackets', () => {
    const comp = indeterminateProgress({ width: 10 });
    const model = { position: 0 };
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('text');
    if (vnode.kind === 'text') {
      expect(vnode.content.startsWith('[')).toBe(true);
      expect(vnode.content.endsWith(']')).toBe(true);
    }
  });

  it('view renders block at correct position', () => {
    const comp = indeterminateProgress({ width: 10 });
    const model = { position: 3 };
    const vnode = comp.view(model);
    if (vnode.kind === 'text') {
      expect(vnode.content).toContain('█');
      // Total content between brackets should be width
      const inner = vnode.content.slice(1, -1);
      expect(inner.length).toBe(10);
    }
  });

  it('subscriptions return a timer', () => {
    const comp = indeterminateProgress({});
    const sub = comp.subscriptions!({ position: 0 });
    expect(sub._kind.kind).toBe('timer');
  });
});
