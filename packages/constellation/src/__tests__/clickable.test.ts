import { getVNodeMeta } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { button } from '../clickable.js';

describe('button', () => {
  it('returns one complete event-driven control', () => {
    const node = button({
      id: 'save',
      label: 'Save',
      onClick: 'save:click',
      onMouseEnter: 'save:hover',
      onMouseLeave: 'save:leave',
    });

    expect(node.kind).toBe('event');
    if (node.kind !== 'event') return;
    expect(node.handlers).toMatchObject({
      onClick: 'save:click',
      onMouseEnter: 'save:hover',
      onMouseLeave: 'save:leave',
    });
    expect(JSON.stringify(node.child)).toContain('[Save]');
    expect(getVNodeMeta(node)?.a11y).toMatchObject({
      role: 'button',
      label: 'Save',
    });
  });

  it('carries scroll affordance without a second wrapper', () => {
    const node = button({
      id: 'next',
      label: 'Next',
      onClick: 'next:click',
      onScroll: 'next:scroll',
    });
    expect(node.kind).toBe('event');
    if (node.kind === 'event') {
      expect(node.handlers.onScroll).toBe('next:scroll');
      expect(node.metadata?.affordances).toContain('scroll');
    }
  });

  it('renders disabled controls without active event handlers', () => {
    const node = button({
      id: 'delete',
      label: 'Delete',
      onClick: 'delete:click',
      disabled: true,
      tone: 'danger',
    });
    expect(node.kind).toBe('text');
    expect(getVNodeMeta(node)?.a11y).toMatchObject({
      role: 'button',
      label: 'Delete',
      disabled: true,
    });
  });

  it('marks selected controls for assistive output', () => {
    const node = button({
      id: 'approve',
      label: 'Approve',
      onClick: 'approve:click',
      selected: true,
    });
    expect(getVNodeMeta(node)?.a11y).toMatchObject({
      role: 'button',
      selected: true,
    });
    expect(getVNodeMeta(node)?.states).toContain('selected');
  });

  it.each(['filled', 'outline', 'ghost'] as const)(
    'supports the %s visual family',
    (buttonVariant) => {
      const node = button({
        id: buttonVariant,
        label: 'Action',
        onClick: `${buttonVariant}:click`,
        buttonVariant,
        hovered: true,
      });
      expect(node.kind).toBe('event');
      expect(JSON.stringify(node)).toContain('Action');
    },
  );
});
