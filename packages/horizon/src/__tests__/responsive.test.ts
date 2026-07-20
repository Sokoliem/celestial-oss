import { afterEach, describe, expect, it } from 'vitest';
import { getCurrentBreakpoint, isBreakpoint, isBreakpointOrAbove, isBreakpointOrBelow, responsiveLayout, responsiveValue } from '../responsive.js';

function setTerminal(cols: number, rows: number): void {
  Object.defineProperty(process.stdout, 'columns', { value: cols, configurable: true });
  Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true });
}

describe('horizon responsive', () => {
  afterEach(() => {
    setTerminal(80, 24);
  });

  it('uses canonical breakpoint names', () => {
    setTerminal(20, 24);
    expect(getCurrentBreakpoint()).toBe('xs');

    setTerminal(80, 24);
    expect(getCurrentBreakpoint()).toBe('md');
  });

  it('accepts legacy aliases for breakpoint checks', () => {
    setTerminal(80, 24);
    expect(isBreakpoint('standard')).toBe(true);
    expect(isBreakpointOrAbove('narrow')).toBe(true);
    expect(isBreakpointOrBelow('wide')).toBe(true);
  });

  it('resolves responsive values across canonical and legacy keys', () => {
    setTerminal(80, 24);
    expect(responsiveValue({ compact: 'compact', md: 'medium' }, 'fallback')).toBe('medium');
  });

  it('resolves layout fallbacks with canonical names', () => {
    setTerminal(150, 24);
    const md = { kind: 'text', content: 'md' } as const;
    const lg = { kind: 'text', content: 'lg' } as const;
    expect(responsiveLayout({ md, lg, fallback: md })).toBe(lg);
  });
});
