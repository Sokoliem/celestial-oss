import type { ElementMouseEvent, Sub, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { autocomplete } from '../autocomplete.js';
import { combobox } from '../combobox.js';
import { commandPalette } from '../command-palette.js';
import { multiSelect } from '../multi-select.js';
import { optionListView } from '../option-list-view.js';
import { select } from '../select.js';
import { wheelDirection } from '../internal.js';

function walk(node: VNode, visit: (node: VNode) => string | undefined): string | undefined {
  const found = visit(node);
  if (found) return found;
  if (node.kind === 'event') return walk(node.child, visit);
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const nested = walk(child, visit);
      if (nested) return nested;
    }
  }
  return undefined;
}

function scrollTarget(node: VNode): { elementId: string; handlerTag: string } {
  let elementId = '';
  const handlerTag = walk(node, (candidate) => {
    if (candidate.kind !== 'event' || typeof candidate.handlers.onScroll !== 'string') return undefined;
    elementId = candidate.id;
    return candidate.handlers.onScroll;
  });
  if (!handlerTag) throw new Error('expected a wheel-enabled event region');
  return { elementId, handlerTag };
}

function elementMouseMapper<M>(subscription: Sub<M>): (event: ElementMouseEvent) => M {
  if (subscription._kind.kind === 'elementMouse') return subscription._kind.toMsg;
  if (subscription._kind.kind === 'batch') {
    for (const child of subscription._kind.subs) {
      try {
        return elementMouseMapper(child);
      } catch {
        // Continue until the element-scoped pointer subscription is found.
      }
    }
  }
  throw new Error('expected elementMouse subscription');
}

function wheelEvent(target: { elementId: string; handlerTag: string }, deltaY: -1 | 0 | 1): ElementMouseEvent {
  return {
    ...target,
    phase: 'target',
    targetId: target.elementId,
    currentTargetId: target.elementId,
    path: [target.elementId],
    type: deltaY < 0 ? 'scroll-up' : deltaY > 0 ? 'scroll-down' : 'move',
    deltaY,
    x: 0,
    y: 0,
    button: 'none',
    ctrl: false,
    alt: false,
    shift: false,
    stopPropagation: () => undefined,
    isPropagationStopped: () => false,
  };
}

describe('windowed list wheel parity', () => {
  it('normalizes wheel input without turning move events into downward navigation', () => {
    expect(wheelDirection(-1)).toBe(-1);
    expect(wheelDirection(0)).toBe(0);
    expect(wheelDirection(1)).toBe(1);
    expect(wheelDirection(Number.NaN)).toBe(0);
  });

  it.each([
    {
      name: 'select',
      descriptor: select({
        display: 'listbox',
        focused: true,
        maxVisibleOptions: 2,
        options: ['one', 'two', 'three'].map((label) => ({ label, value: label })),
      }),
      open: (model: any) => model,
      up: 'up',
      down: 'down',
    },
    {
      name: 'autocomplete',
      descriptor: autocomplete({ source: () => ['one', 'two', 'three'], maxSuggestions: 2 }),
      open: (model: any) => ({ ...model, focused: true, open: true, suggestions: ['one', 'two', 'three'] }),
      up: 'up',
      down: 'down',
    },
    {
      name: 'combobox',
      descriptor: combobox({ options: ['one', 'two', 'three'].map((label) => ({ label, value: label })), maxVisibleOptions: 2 }),
      open: (model: any) => ({ ...model, focused: true, open: true }),
      up: 'up',
      down: 'down',
    },
    {
      name: 'multi-select',
      descriptor: multiSelect({ options: ['one', 'two', 'three'].map((label) => ({ label, value: label })), maxVisibleOptions: 2 }),
      open: (model: any) => ({ ...model, focused: true, open: true }),
      up: 'up',
      down: 'down',
    },
    {
      name: 'option list',
      descriptor: optionListView({
        items: ['one', 'two', 'three'].map((label) => ({ id: label, label, value: label })),
        maxVisible: 2,
      }),
      open: (model: any) => model,
      up: 'opt-arrow',
      down: 'opt-arrow',
    },
    {
      name: 'command palette',
      descriptor: commandPalette({
        commands: ['one', 'two', 'three'].map((label) => ({ id: label, label, msg: label })),
        maxVisible: 2,
      }),
      open: (model: any, descriptor: any) => descriptor.update({ type: 'cp-open' }, model)[0],
      up: 'cp-up',
      down: 'cp-down',
    },
  ])('$name maps wheel direction through its existing navigation model', ({ descriptor, open, up, down }) => {
    const model = open(descriptor.init()[0], descriptor);
    const target = scrollTarget(descriptor.view(model));
    const toMsg = elementMouseMapper(descriptor.subscriptions!(model) as Sub<unknown>);
    expect((toMsg(wheelEvent(target, -1)) as { type: string }).type).toBe(up);
    expect((toMsg(wheelEvent(target, 1)) as { type: string }).type).toBe(down);
    expect((toMsg(wheelEvent(target, 0)) as { type: string }).type).toMatch(/noop/);
  });
});
