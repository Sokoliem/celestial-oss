import { describe, expect, it } from 'vitest';
import { aiAdmonitionTheme } from '../ai-admonition.js';
import { renderMarkdown } from '../renderer.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('aiAdmonitionTheme', () => {
  it('returns theme overrides for ai-thinking', () => {
    const override = aiAdmonitionTheme('ai-thinking');
    expect(override.admonitionTitle).toBeDefined();
    expect(override.admonitionBorder).toBeDefined();
    const title = override.admonitionTitle!('ai-thinking', 'Reasoning');
    const plain = stripAnsi(title);
    expect(plain).toContain('◈');
    expect(plain).toContain('Reasoning');
  });

  it('returns theme overrides for tool-call', () => {
    const override = aiAdmonitionTheme('tool-call');
    const title = override.admonitionTitle!('tool-call', 'Invoke');
    const plain = stripAnsi(title);
    expect(plain).toContain('⚙');
    expect(plain).toContain('Invoke');
  });

  it('returns theme overrides for citation', () => {
    const override = aiAdmonitionTheme('citation');
    const title = override.admonitionTitle!('citation', 'Source');
    const plain = stripAnsi(title);
    expect(plain).toContain('◆');
    expect(plain).toContain('Source');
  });

  it('merges custom overrides when provided', () => {
    const custom = aiAdmonitionTheme('ai-thinking', {
      admonitionTitle: (_k, _t) => 'CUSTOM',
    });
    const title = custom.admonitionTitle!('ai-thinking', 'Reasoning');
    expect(title).toBe('CUSTOM');
  });
});

describe('AI admonition rendering', () => {
  it('renders ai-thinking admonition with default theme', () => {
    const out = renderMarkdown('> [!ai-thinking]\n> reasoning step');
    const plain = stripAnsi(out);
    expect(plain).toContain('Ai-thinking');
    expect(plain).toContain('reasoning step');
  });
});
