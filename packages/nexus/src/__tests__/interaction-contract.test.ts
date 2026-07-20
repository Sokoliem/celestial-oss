import { describe, expect, it, vi } from 'vitest';
import { createDragState, dragUpdate } from '../drag.js';
import { parseMouseEvent } from '../mouse.js';

describe('nexus interaction contract', () => {
  it('normalizes SGR mouse input to zero-based cells and preserves modifiers', () => {
    expect(parseMouseEvent('\x1b[<28;3;3M')).toEqual({
      type: 'press',
      button: 0,
      x: 2,
      y: 2,
      ctrl: true,
      alt: true,
      shift: true,
      encoding: 'sgr',
    });
  });

  it('keeps drag state causal from start through accepted drop', () => {
    const started = dragUpdate(
      {
        type: 'drag-start',
        sourceId: 'item-1',
        data: 'payload',
        x: 10,
        y: 20,
      },
      createDragState<string>(),
      [],
    );
    const hovered = dragUpdate({ type: 'drag-over', targetId: 'drop-zone' }, started, [{ id: 'drop-zone', canDrop: () => true }]);
    const dropped = dragUpdate({ type: 'drop', targetId: 'drop-zone' }, hovered, [{ id: 'drop-zone', canDrop: () => true }]);

    expect(hovered).toMatchObject({ phase: 'dragging', hoveredTargetId: 'drop-zone' });
    expect(dropped).toEqual({
      phase: 'dropped',
      sourceId: 'item-1',
      targetId: 'drop-zone',
      data: 'payload',
    });
  });

  it('only falls back to plain text hyperlinks when the caller opts in', async () => {
    const originalEnv = { ...process.env };
    delete process.env['NO_COLOR'];
    delete process.env['TERM_PROGRAM'];
    delete process.env['VTE_VERSION'];
    delete process.env['COLORTERM'];
    process.env['TERM'] = 'dumb';

    vi.resetModules();

    const [{ hyperlink: freshHyperlink }, { _resetCache }] = await Promise.all([import('../hyperlink.js'), import('../detection.js')]);
    _resetCache();

    expect(freshHyperlink('Docs', 'https://example.com', { fallback: true })).toBe('Docs (https://example.com)');
    expect(freshHyperlink('Docs', 'https://example.com')).toBe('\x1b]8;;https://example.com\x07Docs\x1b]8;;\x07');

    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
    _resetCache();
  });
});
