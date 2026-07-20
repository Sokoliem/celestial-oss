// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { event } from '../../elements.js';
import { measure } from '../../vdom.js';

// ─── event() ───────────────────────────────────────────────────────────────

describe('event() builder', () => {
  it('should create an EventNode with the given id, child, and handlers', () => {
    const child = { kind: 'text' as const, content: 'Click' };
    const handlers = { onClick: 'clicked' };
    const node = event('btn-1', child, handlers);

    expect(node.kind).toBe('event');
    expect(node.id).toBe('btn-1');
    expect(node.child).toBe(child);
    expect(node.handlers).toBe(handlers);
  });

  it('should create a measurable node', () => {
    const node = event('btn', { kind: 'text', content: 'hello' }, { onClick: 'click' });
    const size = measure(node);
    expect(size).toEqual({ width: 5, height: 1 });
  });

  it('should work with empty handlers', () => {
    const node = event('passive', { kind: 'text', content: 'test' }, {});
    expect(node.handlers).toEqual({});
  });

  it('should work with all handler types', () => {
    const handlers = {
      onClickCapture: 'click-capture',
      onClick: 'click',
      onRightClickCapture: 'right-capture',
      onRightClick: 'right',
      onMouseEnter: 'enter',
      onMouseLeave: 'leave',
      onMouseDownCapture: 'down-capture',
      onMouseDown: 'down',
      onMouseUpCapture: 'up-capture',
      onMouseUp: 'up',
      onMouseMoveCapture: 'move-capture',
      onMouseMove: 'move',
      onScrollCapture: 'scroll-capture',
      onScroll: 'scroll',
    };
    const node = event('full', { kind: 'text', content: 'x' }, handlers);
    expect(node.handlers).toBe(handlers);
  });
});
