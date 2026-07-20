import { describe, expect, it } from 'vitest';
import { resolveMouseHandler } from '../mouse.js';

const ev = (mods: Partial<{ shift: boolean; ctrl: boolean; alt: boolean }> = {}) => ({
  shift: !!mods.shift,
  ctrl: !!mods.ctrl,
  alt: !!mods.alt,
});

describe('resolveMouseHandler', () => {
  it('returns undefined for missing handler', () => {
    expect(resolveMouseHandler(undefined, ev())).toBeUndefined();
  });

  it('treats a string handler as modifier-agnostic', () => {
    expect(resolveMouseHandler('select', ev())).toBe('select');
    expect(resolveMouseHandler('select', ev({ shift: true, ctrl: true }))).toBe('select');
  });

  it('routes to the most specific modifier variant', () => {
    const handler = {
      default: 'select',
      shift: 'range',
      ctrl: 'toggle',
      alt: 'secondary',
      shiftCtrl: 'add-range',
      shiftAlt: 'remove-range',
      ctrlAlt: 'dup',
      shiftCtrlAlt: 'omni',
    };
    expect(resolveMouseHandler(handler, ev())).toBe('select');
    expect(resolveMouseHandler(handler, ev({ shift: true }))).toBe('range');
    expect(resolveMouseHandler(handler, ev({ ctrl: true }))).toBe('toggle');
    expect(resolveMouseHandler(handler, ev({ alt: true }))).toBe('secondary');
    expect(resolveMouseHandler(handler, ev({ shift: true, ctrl: true }))).toBe('add-range');
    expect(resolveMouseHandler(handler, ev({ shift: true, alt: true }))).toBe('remove-range');
    expect(resolveMouseHandler(handler, ev({ ctrl: true, alt: true }))).toBe('dup');
    expect(resolveMouseHandler(handler, ev({ shift: true, ctrl: true, alt: true }))).toBe('omni');
  });

  it('falls back to default when a more specific variant is unset', () => {
    const handler = { default: 'select', shift: 'range' };
    expect(resolveMouseHandler(handler, ev({ ctrl: true }))).toBe('select');
    expect(resolveMouseHandler(handler, ev({ alt: true }))).toBe('select');
    expect(resolveMouseHandler(handler, ev({ shift: true, ctrl: true }))).toBe('range');
  });

  it('returns undefined when no variant and no default match', () => {
    const handler = { shift: 'range' };
    expect(resolveMouseHandler(handler, ev())).toBeUndefined();
    expect(resolveMouseHandler(handler, ev({ ctrl: true }))).toBeUndefined();
    expect(resolveMouseHandler(handler, ev({ shift: true }))).toBe('range');
  });
});
