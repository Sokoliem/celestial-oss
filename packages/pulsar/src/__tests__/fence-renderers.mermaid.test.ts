/**
 * Mermaid fence renderer tests (A2)
 */

import { describe, expect, it } from 'vitest';
import { mermaidFenceRenderer } from '../fence-renderers/mermaid.js';
import { defaultTheme } from '../theme.js';

function ctx(overrides?: Partial<Parameters<typeof mermaidFenceRenderer>[1]>) {
  return {
    theme: defaultTheme(),
    options: {},
    width: 80,
    indent: 0,
    ...overrides,
  };
}

describe('mermaidFenceRenderer', () => {
  it('returns null when diagrams option is undefined', () => {
    const out = mermaidFenceRenderer({ type: 'code-block', language: 'mermaid', content: 'graph LR; A-->B' }, ctx());
    expect(out).toBeNull();
  });

  it('returns null when diagrams.mermaid is false', () => {
    const out = mermaidFenceRenderer(
      { type: 'code-block', language: 'mermaid', content: 'graph LR; A-->B' },
      ctx({ options: { diagrams: { mermaid: false } } }),
    );
    expect(out).toBeNull();
  });

  it('returns null when canvas/stellar peers are absent (fallback to text)', () => {
    const out = mermaidFenceRenderer({ type: 'code-block', language: 'mermaid', content: 'graph LR; A-->B' }, ctx({ options: { diagrams: true } }));
    expect(out).toBeNull();
  });
});
