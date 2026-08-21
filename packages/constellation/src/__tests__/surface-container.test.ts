import { cmdKind, collectFocusNodes, focus, subKind, text } from '@celestial/core/nebula';
import { renderToLines } from '@celestial/test';
import { describe, expect, it, vi } from 'vitest';
import { surfaceContainer } from '../surface-container.js';

describe('surfaceContainer', () => {
  it('renders header chrome, a clickable close affordance, and complete wrapped content', () => {
    const component = surfaceContainer({
      id: 'details',
      header: { title: 'Release details', meta: 'preview' },
      content: text('The final character remains visible after the surface narrows.', undefined, { wrap: true }),
      width: 24,
    });
    const [model] = component.init();
    const node = component.view(model);
    const rendered = renderToLines(node, { width: 24, height: 20 }).join('\n');

    expect(rendered).toContain('Release');
    expect(rendered).toContain('preview');
    expect(rendered).toContain('narrows.');
    expect(collectFocusNodes(node).some((entry) => entry.id.endsWith('-close'))).toBe(true);
  });

  it('routes the visible close action and restores the previous focus group', () => {
    const onClose = vi.fn();
    const component = surfaceContainer({ id: 'closable', content: focus('field', text('Field')), onClose });
    const [model] = component.init();
    const kind = subKind(component.subscriptions!(model));
    expect(kind.kind).toBe('batch');
    if (kind.kind !== 'batch') return;
    const mouse = kind.subs.map(subKind).find((entry) => entry.kind === 'elementMouse');
    expect(mouse?.kind).toBe('elementMouse');
    if (mouse?.kind !== 'elementMouse') return;
    const view = component.view(model);
    const closeEvent = findCloseEvent(view);
    expect(closeEvent).toBeDefined();
    const closeTag = closeEvent!.handlers.onClick;
    expect(typeof closeTag).toBe('string');
    const message = mouse.toMsg({
      elementId: closeEvent!.id,
      handlerTag: closeTag as string,
      phase: 'target',
      targetId: closeEvent!.id,
      currentTargetId: closeEvent!.id,
      path: [closeEvent!.id],
      type: 'press',
      button: 0,
      x: 0,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
      stopPropagation() {},
      isPropagationStopped: () => false,
    });
    const [closed, command] = component.update(message, model);

    expect(closed.open).toBe(false);
    expect(onClose).toHaveBeenCalledWith('close-button');
    expect(cmdKind(command).kind).toBe('popFocusGroup');
  });

  it('rejects surface configurations without both required dismissal paths', () => {
    expect(() => surfaceContainer({ id: 'no-close', content: text('Body'), closable: false })).toThrow(/visible close/i);
    expect(() => surfaceContainer({ id: 'no-escape', content: text('Body'), escapable: false })).toThrow(/Escape/i);
  });

  it('normalizes invalid widths instead of forwarding non-finite geometry', () => {
    const component = surfaceContainer({ id: 'geometry', content: text('Body'), width: Number.POSITIVE_INFINITY });
    const [model] = component.init();
    const node = component.view(model);
    expect(node.kind).toBe('box');
    if (node.kind === 'box') expect(node.width).toBe(1);
  });
});

function findCloseEvent(node: import('@celestial/core/nebula').VNode): import('@celestial/core/nebula').EventNode | undefined {
  const onClick = node.kind === 'event' ? node.handlers.onClick : undefined;
  if (node.kind === 'event' && typeof onClick === 'string' && onClick.endsWith(':close-button')) return node;
  if (node.kind === 'row' || node.kind === 'column' || node.kind === 'box' || node.kind === 'tabGroup') {
    for (const child of node.children) {
      const found = findCloseEvent(child);
      if (found) return found;
    }
  }
  if (
    node.kind === 'focus' ||
    node.kind === 'scroll' ||
    node.kind === 'event' ||
    node.kind === 'hover' ||
    node.kind === 'overlay' ||
    node.kind === 'flex' ||
    node.kind === 'portal'
  ) {
    return findCloseEvent(node.child);
  }
  return undefined;
}
