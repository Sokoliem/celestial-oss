import { describe, expect, it } from 'vitest';
import type { ElementMouseEvent } from '../types.js';
import { Sub, subKind } from '../types.js';

describe('ElementMouseEvent type', () => {
  it('should have all required fields', () => {
    const event: ElementMouseEvent = {
      handlerTag: 'click-handler',
      elementId: 'btn-1',
      phase: 'target',
      targetId: 'btn-1',
      currentTargetId: 'btn-1',
      path: ['root', 'btn-1'],
      type: 'press',
      deltaY: 0,
      x: 5,
      y: 3,
      localX: 2,
      localY: 1,
      currentTargetRect: { x: 3, y: 2, width: 8, height: 2 },
      button: 0,
      ctrl: false,
      alt: false,
      shift: false,
      stopPropagation: () => undefined,
      isPropagationStopped: () => false,
    };
    expect(event.handlerTag).toBe('click-handler');
    expect(event.elementId).toBe('btn-1');
    expect(event.phase).toBe('target');
    expect(event.targetId).toBe('btn-1');
    expect(event.currentTargetId).toBe('btn-1');
    expect(event.path).toEqual(['root', 'btn-1']);
    expect(event.type).toBe('press');
    expect(event.deltaY).toBe(0);
    expect(event.x).toBe(5);
    expect(event.y).toBe(3);
    expect(event.localX).toBe(2);
    expect(event.localY).toBe(1);
    expect(event.currentTargetRect).toEqual({ x: 3, y: 2, width: 8, height: 2 });
    expect(event.button).toBe(0);
    expect(event.ctrl).toBe(false);
    expect(event.alt).toBe(false);
    expect(event.shift).toBe(false);
    expect(event.isPropagationStopped()).toBe(false);
  });

  it('should accept all button types', () => {
    const buttons: ElementMouseEvent['button'][] = [0, 1, 2, 'none'];
    for (const button of buttons) {
      const event: ElementMouseEvent = {
        handlerTag: 'test',
        elementId: 'el',
        phase: 'target',
        targetId: 'el',
        currentTargetId: 'el',
        path: ['el'],
        x: 0,
        y: 0,
        button,
        ctrl: false,
        alt: false,
        shift: false,
        stopPropagation: () => undefined,
        isPropagationStopped: () => false,
      };
      expect(event.button).toBe(button);
    }
  });

  it('should accept modifier keys', () => {
    const event: ElementMouseEvent = {
      handlerTag: 'test',
      elementId: 'el',
      phase: 'bubble',
      targetId: 'child',
      currentTargetId: 'el',
      path: ['root', 'child'],
      x: 0,
      y: 0,
      button: 0,
      ctrl: true,
      alt: true,
      shift: true,
      stopPropagation: () => undefined,
      isPropagationStopped: () => false,
    };
    expect(event.ctrl).toBe(true);
    expect(event.alt).toBe(true);
    expect(event.shift).toBe(true);
  });

  it('can expose directional scroll metadata', () => {
    const event: ElementMouseEvent = {
      handlerTag: 'scroll-handler',
      elementId: 'list',
      phase: 'target',
      targetId: 'list',
      currentTargetId: 'list',
      path: ['list'],
      type: 'scroll-down',
      deltaY: 1,
      x: 0,
      y: 0,
      button: 'none',
      ctrl: false,
      alt: false,
      shift: false,
      stopPropagation: () => undefined,
      isPropagationStopped: () => false,
    };

    expect(event.type).toBe('scroll-down');
    expect(event.deltaY).toBe(1);
  });

  it('keeps elementId aligned with currentTargetId', () => {
    const event: ElementMouseEvent = {
      handlerTag: 'test',
      elementId: 'parent',
      phase: 'bubble',
      targetId: 'child',
      currentTargetId: 'parent',
      path: ['parent', 'child'],
      x: 0,
      y: 0,
      button: 0,
      ctrl: false,
      alt: false,
      shift: false,
      stopPropagation: () => undefined,
      isPropagationStopped: () => false,
    };

    expect(event.elementId).toBe(event.currentTargetId);
  });

  it('should expose stopPropagation state', () => {
    let stopped = false;
    const event: ElementMouseEvent = {
      handlerTag: 'test',
      elementId: 'parent',
      phase: 'capture',
      targetId: 'child',
      currentTargetId: 'parent',
      path: ['parent', 'child'],
      x: 0,
      y: 0,
      button: 0,
      ctrl: false,
      alt: false,
      shift: false,
      stopPropagation: () => {
        stopped = true;
      },
      isPropagationStopped: () => stopped,
    };

    expect(event.isPropagationStopped()).toBe(false);
    event.stopPropagation();
    expect(event.isPropagationStopped()).toBe(true);
  });
});

describe('Sub.elementMouse', () => {
  it('should create an elementMouse subscription', () => {
    type Msg = { type: 'element-event'; event: ElementMouseEvent };
    const sub = Sub.elementMouse<Msg>((e) => ({ type: 'element-event', event: e }));

    expect(sub._tag).toBe('sub');
    const kind = subKind(sub);
    expect(kind.kind).toBe('elementMouse');
  });

  it('should carry the toMsg function', () => {
    type Msg = string;
    const toMsg = (e: ElementMouseEvent) => `clicked:${e.elementId}`;
    const sub = Sub.elementMouse<Msg>(toMsg);

    const kind = subKind(sub);
    expect(kind.kind).toBe('elementMouse');
    if (kind.kind === 'elementMouse') {
      const result = kind.toMsg({
        handlerTag: 'click',
        elementId: 'btn',
        phase: 'target',
        targetId: 'btn',
        currentTargetId: 'btn',
        path: ['btn'],
        x: 0,
        y: 0,
        button: 0,
        ctrl: false,
        alt: false,
        shift: false,
        stopPropagation: () => undefined,
        isPropagationStopped: () => false,
      });
      expect(result).toBe('clicked:btn');
    }
  });

  it('should be batchable with other subscriptions', () => {
    type Msg = { type: string };
    const elSub = Sub.elementMouse<Msg>(() => ({ type: 'el' }));
    const keySub = Sub.key<Msg>('q', { type: 'quit' });
    const batched = Sub.batch(elSub, keySub);

    const kind = subKind(batched);
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.subs).toHaveLength(2);
    }
  });
});
