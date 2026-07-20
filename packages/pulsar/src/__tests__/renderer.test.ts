import { describe, expect, it } from 'vitest';
import { injectAnsiCodes, renderMarkdown } from '../renderer.js';

/** Strip ANSI codes for content assertions */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Check if string contains ANSI codes */
function hasAnsi(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1b\[[0-9;]*m/.test(str);
}

describe('renderMarkdown', () => {
  it('should render headings with ANSI styling', () => {
    const result = renderMarkdown('# Hello World');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('Hello World');
  });

  it('should render h2 differently from h1', () => {
    const h1 = renderMarkdown('# Title');
    const h2 = renderMarkdown('## Subtitle');
    // Both should have ANSI codes but they should differ
    expect(hasAnsi(h1)).toBe(true);
    expect(hasAnsi(h2)).toBe(true);
    expect(h1).not.toBe(h2);
  });

  it('should render bold inline content with ANSI codes', () => {
    const result = renderMarkdown('This is **bold** text');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('bold');
  });

  it('should render italic inline content with ANSI codes', () => {
    const result = renderMarkdown('This is *italic* text');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('italic');
  });

  it('should render code blocks with highlighting', () => {
    const result = renderMarkdown('```typescript\nconst x = 1;\n```');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('const');
    expect(stripAnsi(result)).toContain('x');
  });

  it('should render blockquotes with prefix', () => {
    const result = renderMarkdown('> Some quote');
    expect(stripAnsi(result)).toContain('│');
    expect(stripAnsi(result)).toContain('Some quote');
  });

  it('should render unordered lists with bullets', () => {
    const result = renderMarkdown('- first\n- second');
    const plain = stripAnsi(result);
    expect(plain).toContain('first');
    expect(plain).toContain('second');
  });

  it('should render ordered lists with numbers', () => {
    const result = renderMarkdown('1. first\n2. second');
    const plain = stripAnsi(result);
    expect(plain).toContain('1.');
    expect(plain).toContain('first');
    expect(plain).toContain('2.');
    expect(plain).toContain('second');
  });

  it('should render horizontal rules', () => {
    const result = renderMarkdown('---');
    const plain = stripAnsi(result);
    expect(plain).toContain('─');
  });

  it('should render tables with borders', () => {
    const input = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
    const result = renderMarkdown(input);
    const plain = stripAnsi(result);
    expect(plain).toContain('Name');
    expect(plain).toContain('Age');
    expect(plain).toContain('Alice');
    expect(plain).toContain('30');
  });

  it('should render a pipe-prefixed non-table line as paragraph text', () => {
    const result = renderMarkdown('| literal pipe text');
    expect(stripAnsi(result)).toContain('| literal pipe text');
  });

  it('should render links with URL display', () => {
    const result = renderMarkdown('[example](https://example.com)');
    const plain = stripAnsi(result);
    expect(plain).toContain('example');
    expect(plain).toContain('https://example.com');
  });

  it('should respect width option for wrapping', () => {
    const longText = 'This is a very long paragraph that should be wrapped when the width is set to a small value for proper terminal display.';
    const result = renderMarkdown(longText, { width: 40 });
    const lines = result.split('\n');
    // With wrapping, we should have multiple lines
    expect(lines.length).toBeGreaterThan(1);
  });

  it('should not wrap short text', () => {
    const result = renderMarkdown('Short text.', { width: 80 });
    const lines = result.split('\n');
    expect(lines).toHaveLength(1);
  });

  it('should render a full markdown document without errors', () => {
    const doc = [
      '# Document Title',
      '',
      'A paragraph of text with **bold** and *italic*.',
      '',
      '## Section',
      '',
      '- item one',
      '- item two',
      '',
      '> A blockquote',
      '',
      '```javascript',
      'const x = 42;',
      '```',
      '',
      '---',
      '',
      '| Col1 | Col2 |',
      '| --- | --- |',
      '| a | b |',
    ].join('\n');

    const result = renderMarkdown(doc);
    expect(result).toBeTruthy();
    expect(hasAnsi(result)).toBe(true);
    const plain = stripAnsi(result);
    expect(plain).toContain('Document Title');
    expect(plain).toContain('bold');
    expect(plain).toContain('italic');
    expect(plain).toContain('item one');
    expect(plain).toContain('A blockquote');
  });

  it('should handle empty input', () => {
    const result = renderMarkdown('');
    expect(result).toBe('');
  });
});

// ── ANSI-Preserving Word Wrap ───────────────────────────────────────────

describe('injectAnsiCodes', () => {
  it('should return plain text unchanged when spans are empty', () => {
    const result = injectAnsiCodes('hello', []);
    expect(result).toBe('hello');
  });

  it('should inject a single code at position 0', () => {
    const result = injectAnsiCodes('hello', [{ index: 0, code: '\x1b[1m' }]);
    expect(result).toBe('\x1b[1mhello');
  });

  it('should inject a code at the end of the string', () => {
    const result = injectAnsiCodes('hi', [{ index: 2, code: '\x1b[0m' }]);
    expect(result).toBe('hi\x1b[0m');
  });

  it('should inject multiple codes at different positions', () => {
    const result = injectAnsiCodes('hello', [
      { index: 0, code: '\x1b[1m' },
      { index: 5, code: '\x1b[0m' },
    ]);
    expect(result).toBe('\x1b[1mhello\x1b[0m');
  });

  it('should inject multiple codes at the same position', () => {
    const result = injectAnsiCodes('hi', [
      { index: 0, code: '\x1b[1m' },
      { index: 0, code: '\x1b[31m' },
    ]);
    expect(result).toBe('\x1b[1m\x1b[31mhi');
  });
});

describe('ANSI-preserving word wrap', () => {
  it('should wrap a long paragraph with ANSI-styled text at the given width', () => {
    const longText = 'This is a **very long** paragraph that contains styled text and should be wrapped when rendered at a narrow width for terminal display.';
    const result = renderMarkdown(longText, { width: 40 });
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    // Every wrapped line should fit within 40 chars of visible content
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(40);
    }
  });

  it('should preserve ANSI codes across line breaks for styled text that wraps', () => {
    // Bold text spanning across a wrap boundary
    const text = 'Start **this bold text is intentionally made very long so that it will definitely wrap across multiple lines when narrow width** end';
    const result = renderMarkdown(text, { width: 30 });
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    // Each line that contains wrapped bold content should have ANSI codes
    for (const line of lines) {
      if (stripAnsi(line).trim().length > 0) {
        expect(hasAnsi(line)).toBe(true);
      }
    }
  });
});

// ── Admonition Rendering ────────────────────────────────────────────────

describe('admonition rendering', () => {
  it('should render a NOTE admonition with border character', () => {
    const md = '> [!NOTE]\n> Some content';
    const result = renderMarkdown(md);
    const plain = stripAnsi(result);
    expect(plain).toContain('▌');
    expect(plain).toContain('Some content');
  });

  it('should include the appropriate icon in the admonition title', () => {
    const md = '> [!NOTE]\n> Content here';
    const result = renderMarkdown(md);
    const plain = stripAnsi(result);
    expect(plain).toContain('ℹ');
  });

  it('should render all 5 admonition kinds correctly', () => {
    const kinds: Array<{ kind: string; icon: string }> = [
      { kind: 'NOTE', icon: 'ℹ' },
      { kind: 'TIP', icon: '💡' },
      { kind: 'IMPORTANT', icon: '❗' },
      { kind: 'WARNING', icon: '⚠' },
      { kind: 'CAUTION', icon: '🔥' },
    ];

    for (const { kind, icon } of kinds) {
      const md = `> [!${kind}]\n> Some ${kind.toLowerCase()} content`;
      const result = renderMarkdown(md);
      const plain = stripAnsi(result);
      expect(plain).toContain('▌');
      expect(plain).toContain(icon);
      expect(plain).toContain(`Some ${kind.toLowerCase()} content`);
    }
  });
});

// ── Task List Rendering ─────────────────────────────────────────────────

describe('task list rendering', () => {
  it('should render a checked task with [x] marker', () => {
    const result = renderMarkdown('- [x] Done task');
    const plain = stripAnsi(result);
    expect(plain).toContain('[x]');
    expect(plain).toContain('Done task');
  });

  it('should render an unchecked task with [ ] marker', () => {
    const result = renderMarkdown('- [ ] Pending task');
    const plain = stripAnsi(result);
    expect(plain).toContain('[ ]');
    expect(plain).toContain('Pending task');
  });

  it('should render mixed regular and task items correctly', () => {
    const md = '- Regular item\n- [x] Checked item\n- [ ] Unchecked item';
    const result = renderMarkdown(md);
    const plain = stripAnsi(result);
    expect(plain).toContain('Regular item');
    expect(plain).toContain('[x]');
    expect(plain).toContain('Checked item');
    expect(plain).toContain('[ ]');
    expect(plain).toContain('Unchecked item');
  });
});

// ── Footnote Rendering ──────────────────────────────────────────────────

describe('footnote rendering', () => {
  it('should render a footnote definition with styled label', () => {
    const result = renderMarkdown('[^1]: Some definition');
    expect(hasAnsi(result)).toBe(true);
    const plain = stripAnsi(result);
    expect(plain).toContain('[1]:');
    expect(plain).toContain('Some definition');
  });

  it('should render a footnote reference in paragraph text', () => {
    const result = renderMarkdown('See this note[^1] for details.');
    expect(hasAnsi(result)).toBe(true);
    const plain = stripAnsi(result);
    expect(plain).toContain('[1]');
    expect(plain).toContain('See this note');
  });
});

// ── Image Placeholder Rendering ─────────────────────────────────────────

describe('image placeholder rendering', () => {
  it('should render an image with placeholder text including alt and url', () => {
    const result = renderMarkdown('![My Image](https://example.com/img.png)');
    const plain = stripAnsi(result);
    expect(plain).toContain('My Image');
    expect(plain).toContain('https://example.com/img.png');
  });
});

// ── Emoji Rendering ─────────────────────────────────────────────────────

describe('emoji rendering', () => {
  it('should render :rocket: as the rocket emoji', () => {
    const result = renderMarkdown('Launch :rocket: now');
    const plain = stripAnsi(result);
    expect(plain).toContain('🚀');
  });
});

// ── Nested List Rendering ───────────────────────────────────────────────

describe('nested list rendering', () => {
  it('should render nested list items with increased indentation', () => {
    const md = '- Parent\n  - Child';
    const result = renderMarkdown(md);
    const plain = stripAnsi(result);
    const lines = plain.split('\n');
    // Find the lines containing Parent and Child
    const parentLine = lines.find((l) => l.includes('Parent'));
    const childLine = lines.find((l) => l.includes('Child'));
    expect(parentLine).toBeDefined();
    expect(childLine).toBeDefined();
    // Child should have more leading whitespace than parent
    const parentIndent = parentLine!.match(/^(\s*)/)![1]!.length;
    const childIndent = childLine!.match(/^(\s*)/)![1]!.length;
    expect(childIndent).toBeGreaterThan(parentIndent);
  });
});

// ── Hard Line Breaks ────────────────────────────────────────────────────

describe('hard line breaks', () => {
  it('renders two-trailing-spaces as a real line break', () => {
    const result = renderMarkdown('line one  \nline two', { width: 80 });
    const plain = stripAnsi(result);
    const lines = plain.split('\n');
    expect(lines[0]).toBe('line one');
    expect(lines[1]).toBe('line two');
  });

  it('collapses bare \\n line wraps to a single space', () => {
    const result = renderMarkdown('line one\nline two', { width: 80 });
    const plain = stripAnsi(result);
    expect(plain).toBe('line one line two');
  });
});

// ── Code Block Frame ────────────────────────────────────────────────────

describe('code block frame', () => {
  it('should render a code block with language label and frame borders', () => {
    const result = renderMarkdown('```typescript\nconst x = 1;\n```');
    const plain = stripAnsi(result);
    expect(plain).toContain('typescript');
    expect(plain).toContain('┌');
    expect(plain).toContain('└');
    expect(plain).toContain('const');
  });
});
