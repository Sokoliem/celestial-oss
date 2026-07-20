import { text } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { hovercard } from '../hovercard.js';

describe('hovercard', () => {
  it('initializes to idle', () => {
    const desc = hovercard({ id: 'h1', trigger: text('t'), content: text('c') });
    const [model] = desc.init();
    expect(model.state).toBe('idle');
  });

  it('transitions idle → pending-show on hover-enter', () => {
    const desc = hovercard({ id: 'h2', trigger: text('t'), content: text('c') });
    const [model] = desc.update({ type: 'hover-enter' }, { state: 'idle' });
    expect(model.state).toBe('pending-show');
  });

  it('transitions pending-show → open after show-tick', () => {
    const desc = hovercard({ id: 'h3', trigger: text('t'), content: text('c') });
    const [model] = desc.update({ type: 'show-tick' }, { state: 'pending-show' });
    expect(model.state).toBe('open');
  });

  it('show-tick is no-op when not pending-show', () => {
    const desc = hovercard({ id: 'h4', trigger: text('t'), content: text('c') });
    const [model] = desc.update({ type: 'show-tick' }, { state: 'idle' });
    expect(model.state).toBe('idle');
  });

  it('transitions open → pending-hide on hover-leave', () => {
    const desc = hovercard({ id: 'h5', trigger: text('t'), content: text('c') });
    const [model] = desc.update({ type: 'hover-leave' }, { state: 'open' });
    expect(model.state).toBe('pending-hide');
  });

  it('dismiss collapses to idle from any state', () => {
    const desc = hovercard({ id: 'h6', trigger: text('t'), content: text('c') });
    expect(desc.update({ type: 'dismiss' }, { state: 'open' })[0].state).toBe('idle');
    expect(desc.update({ type: 'dismiss' }, { state: 'pending-hide' })[0].state).toBe('idle');
    expect(desc.update({ type: 'dismiss' }, { state: 'pending-show' })[0].state).toBe('idle');
  });

  it('panic dismisses when open', () => {
    const desc = hovercard({ id: 'h7', trigger: text('t'), content: text('c') });
    const [model] = desc.update({ type: 'panic' }, { state: 'open' });
    expect(model.state).toBe('idle');
  });

  it('panic is a no-op when idle', () => {
    const desc = hovercard({ id: 'h8', trigger: text('t'), content: text('c') });
    const [model] = desc.update({ type: 'panic' }, { state: 'idle' });
    expect(model.state).toBe('idle');
  });

  it('view renders trigger only when not open', () => {
    const desc = hovercard({ id: 'h9', trigger: text('TRIGGER'), content: text('CARD') });
    const node = desc.view({ state: 'idle' });
    expect(node).toBeDefined();
  });

  it('wires hover intent through an element-scoped mouse subscription', () => {
    const desc = hovercard({ id: 'pointer', trigger: text('t'), content: text('c') });
    const node = desc.view({ state: 'idle' });
    expect(JSON.stringify(node)).toContain('onMouseEnter');
    expect(desc.subscriptions!({ state: 'idle' })._kind.kind).toBe('elementMouse');
  });

  it('renders a visible close control and wraps narrow content', () => {
    const desc = hovercard({ id: 'narrow', trigger: text('t'), content: text('a-very-long-content-tail'), width: 40 });
    const [resized] = desc.update({ type: 'resize', cols: 14 }, { state: 'open' });
    const serialized = JSON.stringify(desc.view(resized));
    expect(serialized).toContain('[x] close');
    expect(serialized).toContain('"wrap":true');
    expect(serialized).toContain('"width":12');
  });
});
