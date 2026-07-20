import { text } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { button, clickable, createClickContext } from '../clickable.js';

// ---------------------------------------------------------------------------
// createClickContext
// ---------------------------------------------------------------------------

describe('createClickContext', () => {
  it('creates context with empty hitMap', () => {
    const ctx = createClickContext<string>();
    expect(ctx.hitMap).toBeDefined();
    expect(ctx.hitMap.getAll()).toEqual([]);
  });

  it('register adds region and handleClick returns onClick for matching coords', () => {
    const ctx = createClickContext<string>();
    ctx.register({ x: 0, y: 0, width: 10, height: 3, onClick: 'clicked' });
    expect(ctx.handleClick(5, 1)).toBe('clicked');
  });

  it('handleClick returns null for coords outside all regions', () => {
    const ctx = createClickContext<string>();
    ctx.register({ x: 0, y: 0, width: 10, height: 3, onClick: 'clicked' });
    expect(ctx.handleClick(15, 5)).toBeNull();
  });

  it('clear removes all regions', () => {
    const ctx = createClickContext<string>();
    ctx.register({ x: 0, y: 0, width: 10, height: 3, onClick: 'clicked' });
    ctx.clear();
    expect(ctx.hitMap.getAll()).toEqual([]);
    expect(ctx.handleClick(5, 1)).toBeNull();
  });

  it('multiple regions: last registered wins on overlap', () => {
    const ctx = createClickContext<string>();
    ctx.register({ x: 0, y: 0, width: 10, height: 10, onClick: 'first' });
    ctx.register({ x: 0, y: 0, width: 10, height: 10, onClick: 'second' });
    expect(ctx.handleClick(5, 5)).toBe('second');
  });

  it('handleHover returns hover messages for matching coords', () => {
    const ctx = createClickContext<string>();
    ctx.register({
      x: 0,
      y: 0,
      width: 10,
      height: 3,
      onClick: 'clicked',
      onHover: { enter: 'enter-msg', exit: 'exit-msg' },
    });
    const hover = ctx.handleHover(5, 1);
    expect(hover).toEqual({ enter: 'enter-msg', exit: 'exit-msg' });
  });

  it('handleHover returns null for coords outside regions', () => {
    const ctx = createClickContext<string>();
    ctx.register({
      x: 0,
      y: 0,
      width: 5,
      height: 2,
      onClick: 'clicked',
      onHover: { enter: 'enter-msg' },
    });
    expect(ctx.handleHover(20, 20)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clickable
// ---------------------------------------------------------------------------

describe('clickable', () => {
  it('registers region and returns the VNode unchanged', () => {
    const ctx = createClickContext<string>();
    const node = text('hello');
    const result = clickable(node, { x: 0, y: 0, width: 5, height: 1 }, 'click-msg', ctx);
    expect(result).toBe(node);
    expect(ctx.hitMap.getAll()).toHaveLength(1);
    expect(ctx.handleClick(2, 0)).toBe('click-msg');
  });
});

// ---------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------

describe('button', () => {
  it('view() returns a VNode with the label', () => {
    const btn = button({ label: 'OK', onClick: 'ok', x: 0, y: 0 });
    const node = btn.view();
    expect(node.kind).toBe('text');
    if (node.kind === 'text') {
      expect(node.content).toContain('OK');
    }
  });

  it('region has correct dimensions (width = label.length + 4, height = 1)', () => {
    const btn = button({ label: 'Save', onClick: 'save', x: 5, y: 3 });
    expect(btn.region.width).toBe('Save'.length + 4);
    expect(btn.region.height).toBe(1);
    expect(btn.region.x).toBe(5);
    expect(btn.region.y).toBe(3);
    expect(btn.region.onClick).toBe('save');
  });

  it('region carries explicit hover messages for Elm-style pointer state', () => {
    const btn = button({
      label: 'Save',
      onClick: 'save',
      onHover: { enter: 'save-hover', exit: 'save-leave' },
      x: 5,
      y: 3,
    });
    expect(btn.region.onHover).toEqual({ enter: 'save-hover', exit: 'save-leave' });
  });

  it('variant "primary" still produces valid view', () => {
    const btn = button({ label: 'Submit', onClick: 'submit', x: 0, y: 0, variant: 'primary' });
    const node = btn.view();
    expect(node.kind).toBe('text');
    if (node.kind === 'text') {
      expect(node.content).toContain('Submit');
    }
  });

  it('variant "danger" still produces valid view', () => {
    const btn = button({ label: 'Delete', onClick: 'delete', x: 0, y: 0, variant: 'danger' });
    const node = btn.view();
    expect(node.kind).toBe('text');
    if (node.kind === 'text') {
      expect(node.content).toContain('Delete');
    }
  });
});
