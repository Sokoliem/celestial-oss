import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectCapabilities,
  detectColorLevel,
  detectDarkBackground,
  detectReducedMotion,
  getPreferredImageProtocol,
  resolveSurfaceCapabilities,
  shouldAnimate,
} from './index.js';

describe('atlas capability detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('honors NO_COLOR over richer terminal defaults', () => {
    expect(detectColorLevel({ NO_COLOR: '1', TERM_PROGRAM: 'WezTerm' })).toBe('none');
  });

  it('lets FORCE_COLOR override inherited NO_COLOR', () => {
    expect(detectColorLevel({ NO_COLOR: '1', FORCE_COLOR: '3' })).toBe('truecolor');
  });

  it('detects Windows Terminal hyperlink and focus support', () => {
    const caps = detectCapabilities({ env: { WT_SESSION: '1' } });

    expect(caps.terminalName).toBe('windows-terminal');
    expect(caps.hyperlinks).toBe(true);
    expect(caps.focusEvents).toBe(true);
  });

  it('detects Prism fallback chain from the canonical snapshot', () => {
    const caps = detectCapabilities({ env: { TERM_PROGRAM: 'foot' } });

    expect(caps.sixelGraphics).toBe(true);
    expect(getPreferredImageProtocol(caps)).toBe('sixel');
  });

  it('detects dark background from COLORFGBG', () => {
    expect(detectDarkBackground({ COLORFGBG: '15;0' })).toBe(true);
    expect(detectDarkBackground({ COLORFGBG: '0;15' })).toBe(false);
  });

  it('detects reduced motion from env flags', () => {
    expect(detectReducedMotion({ REDUCE_MOTION: 'true' })).toBe(true);
    expect(detectReducedMotion({ NO_MOTION: '0' })).toBe(false);
  });

  it('falls back to an empty env when process is unavailable', () => {
    vi.stubGlobal('process', undefined);

    expect(detectColorLevel()).toBe('none');
    expect(detectDarkBackground()).toBe(true);
    expect(detectReducedMotion()).toBe(false);
    expect(detectCapabilities()).toMatchObject({
      terminalName: 'unknown',
      colorLevel: 'none',
      surface: 'terminal',
    });
  });

  it('applies portal surface overrides without inventing runtime input support', () => {
    const caps = resolveSurfaceCapabilities(detectCapabilities({ env: { TERM_PROGRAM: 'WezTerm' } }), 'portal');

    expect(caps.hyperlinks).toBe(true);
    expect(caps.mouseTracking).toBe(false);
    expect(caps.kittyGraphics).toBe(false);
    expect(caps.colorLevel).toBe('truecolor');
  });

  it('disables animation when reduced motion is requested', () => {
    expect(shouldAnimate(detectCapabilities({ env: { REDUCE_MOTION: '1' } }))).toBe(false);
  });
});
