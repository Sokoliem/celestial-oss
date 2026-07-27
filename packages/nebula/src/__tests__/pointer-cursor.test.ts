import { describe, expect, it, vi } from 'vitest';
import type { RuntimeContext } from '../app/runtime-context.js';
import { installPointerCursor } from '../app/pointer-cursor.js';
import {
  encodePointerCursor,
  isPointerCursor,
  normalizePointerCursor,
  POINTER_CURSORS,
  supportsPointerCursorOsc22,
} from '../pointer-cursor.js';

function pointerContext(overrides: Partial<RuntimeContext<unknown, unknown>> = {}): RuntimeContext<unknown, unknown> {
  return {
    options: { pointerCursor: { osc22: true } },
    terminal: { write: vi.fn() },
    terminalSessionActive: true,
    currentHitRegions: [],
    pointerCursor: 'default',
    capturedPointerCursor: null,
    notifyRenderError: vi.fn(),
    ...overrides,
  } as unknown as RuntimeContext<unknown, unknown>;
}

const mouse = (type: 'press' | 'release' | 'move', x: number, y: number) => ({
  type,
  button: type === 'move' ? 'none' as const : 0 as const,
  x,
  y,
  ctrl: false,
  alt: false,
  shift: false,
});

describe('pointer cursor protocol', () => {
  it('validates the complete finite cursor vocabulary and rejects forged values', () => {
    expect(POINTER_CURSORS).toHaveLength(30);
    expect(POINTER_CURSORS.every(isPointerCursor)).toBe(true);
    expect(isPointerCursor('resize')).toBe(false);
    expect(normalizePointerCursor('resize')).toBe('default');
  });

  it('encodes safe OSC 22 updates and releases the override for default', () => {
    expect(encodePointerCursor('ew-resize')).toBe('\x1b]22;ew-resize\x1b\\');
    expect(encodePointerCursor('default')).toBe('\x1b]22;\x1b\\');
    expect(encodePointerCursor('pointer\x1b]0;pwned' as never)).toBe('\x1b]22;\x1b\\');
  });

  it('auto-detects Kitty conservatively', () => {
    expect(supportsPointerCursorOsc22({ KITTY_WINDOW_ID: '1' })).toBe(true);
    expect(supportsPointerCursorOsc22({ TERM_PROGRAM: 'kitty' })).toBe(true);
    expect(supportsPointerCursorOsc22({ TERM: 'xterm-256color' })).toBe(false);
  });

  it('selects the topmost cursor and captures resize shape through release outside', () => {
    const onChange = vi.fn();
    const write = vi.fn();
    const ctx = pointerContext({
      options: { pointerCursor: { osc22: true, onChange } },
      terminal: { write } as unknown as RuntimeContext<unknown, unknown>['terminal'],
      currentHitRegions: [
        {
          id: 'base',
          handlers: {},
          rect: { x: 0, y: 0, width: 5, height: 5 },
          zIndex: 0,
          isHover: false,
          eventPath: ['base'],
          metadata: { cursor: 'pointer' },
        },
        {
          id: 'resize',
          handlers: {},
          rect: { x: 1, y: 1, width: 2, height: 2 },
          zIndex: 1,
          isHover: false,
          eventPath: ['resize'],
          metadata: { cursor: 'ew-resize', affordances: ['resize'] },
        },
      ],
    });
    installPointerCursor(ctx);

    ctx.updatePointerCursor(mouse('move', 1, 1));
    ctx.updatePointerCursor(mouse('press', 1, 1));
    ctx.updatePointerCursor(mouse('move', 20, 20));
    ctx.updatePointerCursor(mouse('release', 20, 20));

    expect(onChange.mock.calls.map(([cursor]) => cursor)).toEqual(['ew-resize', 'default']);
    expect(write.mock.calls.map(([sequence]) => sequence)).toEqual([
      encodePointerCursor('ew-resize'),
      encodePointerCursor('default'),
    ]);
    expect(ctx.capturedPointerCursor).toBeNull();
  });

  it('deduplicates updates and isolates callback failures through the render diagnostic seam', () => {
    const error = new Error('host callback failed');
    const ctx = pointerContext({
      options: { pointerCursor: { osc22: false, onChange: () => { throw error; } } },
      currentHitRegions: [{
        id: 'text',
        handlers: {},
        rect: { x: 0, y: 0, width: 2, height: 1 },
        zIndex: 0,
        isHover: false,
        eventPath: ['text'],
        metadata: { cursor: 'text' },
      }],
    });
    installPointerCursor(ctx);

    ctx.updatePointerCursor(mouse('move', 0, 0));
    ctx.updatePointerCursor(mouse('move', 1, 0));

    expect(ctx.notifyRenderError).toHaveBeenCalledTimes(1);
    expect(ctx.notifyRenderError).toHaveBeenCalledWith(error);
  });
});
