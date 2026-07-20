import type { SemanticTheme } from '@celestial/corona';
import { color } from '@celestial/corona';
import { measureTextWidth } from '@celestial/rosetta';
import { describe, expect, it } from 'vitest';
import { markdownGlyph } from '../markdown-glyphs.js';
import { createMarkdownTheme, createTheme, defaultTheme, fromSemanticTheme, lightTheme } from '../theme.js';

/** Check if string contains ANSI codes */
function hasAnsi(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1b\[[0-9;]*m/.test(str);
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('defaultTheme', () => {
  it('should return a complete theme object', () => {
    const theme = defaultTheme();
    expect(typeof theme.heading1).toBe('function');
    expect(typeof theme.heading2).toBe('function');
    expect(typeof theme.heading3).toBe('function');
    expect(typeof theme.heading4).toBe('function');
    expect(typeof theme.heading5).toBe('function');
    expect(typeof theme.heading6).toBe('function');
    expect(typeof theme.bold).toBe('function');
    expect(typeof theme.italic).toBe('function');
    expect(typeof theme.code).toBe('function');
    expect(typeof theme.codeBlock).toBe('function');
    expect(typeof theme.link).toBe('function');
    expect(typeof theme.blockquote).toBe('function');
    expect(typeof theme.listBullet).toBe('string');
    expect(typeof theme.listNumber).toBe('function');
    expect(typeof theme.hr).toBe('function');
    expect(typeof theme.strikethrough).toBe('function');
    expect(typeof theme.tableHeader).toBe('function');
    expect(typeof theme.tableCell).toBe('function');
    expect(typeof theme.tableBorder).toBe('string');
  });

  it('should produce ANSI-styled output for headings', () => {
    const theme = defaultTheme();
    expect(hasAnsi(theme.heading1('test'))).toBe(true);
    expect(hasAnsi(theme.heading2('test'))).toBe(true);
    expect(hasAnsi(theme.heading3('test'))).toBe(true);
  });

  it('should produce ANSI-styled output for inline styles', () => {
    const theme = defaultTheme();
    expect(hasAnsi(theme.bold('test'))).toBe(true);
    expect(hasAnsi(theme.italic('test'))).toBe(true);
    expect(hasAnsi(theme.code('test'))).toBe(true);
    expect(hasAnsi(theme.strikethrough('test'))).toBe(true);
  });

  it('should produce hr of correct width', () => {
    const theme = defaultTheme();
    // eslint-disable-next-line no-control-regex
    const plain = theme.hr(40).replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toBe('─'.repeat(40));
  });

  it('should produce styled blockquote with bar prefix', () => {
    const theme = defaultTheme();
    const result = theme.blockquote('hello');
    // eslint-disable-next-line no-control-regex
    const plain = result.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('│');
    expect(plain).toContain('hello');
  });

  it('linkText styles just the text with no URL suffix', () => {
    const theme = defaultTheme();
    expect(theme.linkText).toBeDefined();
    const styled = theme.linkText!('docs');
    expect(hasAnsi(styled)).toBe(true);
    expect(stripAnsi(styled)).toBe('docs');
  });
});

describe('createTheme', () => {
  it('should merge overrides with default theme', () => {
    const customBold = (text: string) => `[BOLD:${text}]`;
    const theme = createTheme({ bold: customBold });
    expect(theme.bold('hello')).toBe('[BOLD:hello]');
  });

  it('should preserve default values for non-overridden keys', () => {
    const customBold = (text: string) => `[BOLD:${text}]`;
    const theme = createTheme({ bold: customBold });
    // heading1 should still be from default theme (ANSI styled)
    expect(hasAnsi(theme.heading1('test'))).toBe(true);
  });

  it('should return a complete theme object even with partial overrides', () => {
    const theme = createTheme({ listBullet: '-' });
    expect(theme.listBullet).toBe('-');
    expect(typeof theme.heading1).toBe('function');
    expect(typeof theme.bold).toBe('function');
    expect(typeof theme.hr).toBe('function');
  });
});

// ── New Default Theme Properties ────────────────────────────────────────

describe('defaultTheme - extended properties', () => {
  it('taskChecked should be a string containing [x] with ANSI', () => {
    const theme = defaultTheme();
    expect(typeof theme.taskChecked).toBe('string');
    expect(hasAnsi(theme.taskChecked)).toBe(true);
    expect(stripAnsi(theme.taskChecked)).toContain('[x]');
  });

  it('taskUnchecked should be a string containing [ ] with ANSI', () => {
    const theme = defaultTheme();
    expect(typeof theme.taskUnchecked).toBe('string');
    expect(hasAnsi(theme.taskUnchecked)).toBe(true);
    expect(stripAnsi(theme.taskUnchecked)).toContain('[ ]');
  });

  it('admonitionTitle should return styled text for each kind', () => {
    const theme = defaultTheme();
    const kinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;

    for (const kind of kinds) {
      const result = theme.admonitionTitle(kind, 'Test Title');
      expect(hasAnsi(result)).toBe(true);
      expect(stripAnsi(result)).toContain('Test Title');
    }
  });

  it('admonitionBorder should return styled border character for each kind', () => {
    const theme = defaultTheme();
    const kinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;

    for (const kind of kinds) {
      const result = theme.admonitionBorder(kind);
      expect(hasAnsi(result)).toBe(true);
      expect(stripAnsi(result)).toContain('▌');
    }
  });

  it('footnoteRef should return styled [label]', () => {
    const theme = defaultTheme();
    const result = theme.footnoteRef('1');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('[1]');
  });

  it('footnoteDef should return styled [label]:', () => {
    const theme = defaultTheme();
    const result = theme.footnoteDef('1');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('[1]:');
  });

  it('imagePlaceholder should return styled placeholder with alt and url', () => {
    const theme = defaultTheme();
    const result = theme.imagePlaceholder('A cat', 'https://example.com/cat.png');
    expect(hasAnsi(result)).toBe(true);
    const plain = stripAnsi(result);
    expect(plain).toContain('A cat');
    expect(plain).toContain('https://example.com/cat.png');
  });

  it('emoji should return the unicode character', () => {
    const theme = defaultTheme();
    const result = theme.emoji('smile', '😀');
    expect(result).toContain('😀');
  });

  it('codeBlockFrame should wrap content with borders', () => {
    const theme = defaultTheme();
    const result = theme.codeBlockFrame('console.log("hi")', 'javascript');
    const plain = stripAnsi(result);
    expect(plain).toContain('┌');
    expect(plain).toContain('└');
    expect(plain).toContain('javascript');
    expect(result).toContain('console.log("hi")');
  });

  it('codeBlockFrame should work without a language', () => {
    const theme = defaultTheme();
    const result = theme.codeBlockFrame('hello', '');
    const plain = stripAnsi(result);
    expect(plain).toContain('┌');
    expect(plain).toContain('└');
    expect(result).toContain('hello');
  });

  it('codeBlockFrame defaults to an exact width of 80 cells', () => {
    const theme = defaultTheme();
    const result = theme.codeBlockFrame('code', '', undefined);
    const plain = stripAnsi(result);
    const topLine = plain.split('\n')[0]!;
    expect(topLine).toBe('┌' + '─'.repeat(79));
    expect(measureTextWidth(topLine)).toBe(80);
  });

  it('codeBlockFrame respects explicit width', () => {
    const theme = defaultTheme();
    const result = theme.codeBlockFrame('code', '', 120);
    const plain = stripAnsi(result);
    const topLine = plain.split('\n')[0]!;
    expect(topLine).toBe('┌' + '─'.repeat(119));
    expect(measureTextWidth(topLine)).toBe(120);
  });

  it('codeBlockFrame respects small width', () => {
    const theme = defaultTheme();
    const result = theme.codeBlockFrame('code', '', 40);
    const plain = stripAnsi(result);
    const topLine = plain.split('\n')[0]!;
    expect(topLine).toBe('┌' + '─'.repeat(39));
    expect(measureTextWidth(topLine)).toBe(40);
  });

  it('bounds invalid public width inputs', () => {
    const theme = defaultTheme();
    expect(stripAnsi(theme.hr(Number.NaN))).toBe('');
    expect(stripAnsi(theme.hr(-10))).toBe('');
    const frame = stripAnsi(theme.codeBlockFrame('code', '', Number.POSITIVE_INFINITY));
    expect(measureTextWidth(frame.split('\n')[0]!)).toBe(80);
  });
});

describe('markdown glyph tokens', () => {
  it('provide ASCII and Unicode fallbacks for semantic marks', () => {
    expect(markdownGlyph('active-rail', 1)).toBe('|');
    expect(markdownGlyph('active-rail', 2)).toBe('▎');
    expect(markdownGlyph('image', 1)).toBe('[img]');
  });
});

// ── lightTheme ──────────────────────────────────────────────────────────

describe('lightTheme', () => {
  it('should return a complete MarkdownTheme with all properties', () => {
    const theme = lightTheme();
    expect(typeof theme.heading1).toBe('function');
    expect(typeof theme.heading2).toBe('function');
    expect(typeof theme.heading3).toBe('function');
    expect(typeof theme.heading4).toBe('function');
    expect(typeof theme.heading5).toBe('function');
    expect(typeof theme.heading6).toBe('function');
    expect(typeof theme.bold).toBe('function');
    expect(typeof theme.italic).toBe('function');
    expect(typeof theme.code).toBe('function');
    expect(typeof theme.codeBlock).toBe('function');
    expect(typeof theme.link).toBe('function');
    expect(typeof theme.blockquote).toBe('function');
    expect(typeof theme.listBullet).toBe('string');
    expect(typeof theme.listNumber).toBe('function');
    expect(typeof theme.hr).toBe('function');
    expect(typeof theme.strikethrough).toBe('function');
    expect(typeof theme.tableHeader).toBe('function');
    expect(typeof theme.tableCell).toBe('function');
    expect(typeof theme.tableBorder).toBe('string');
    expect(typeof theme.taskChecked).toBe('string');
    expect(typeof theme.taskUnchecked).toBe('string');
    expect(typeof theme.admonitionTitle).toBe('function');
    expect(typeof theme.admonitionBorder).toBe('function');
    expect(typeof theme.footnoteRef).toBe('function');
    expect(typeof theme.footnoteDef).toBe('function');
    expect(typeof theme.imagePlaceholder).toBe('function');
    expect(typeof theme.emoji).toBe('function');
    expect(typeof theme.codeBlockFrame).toBe('function');
  });

  it('should produce ANSI-styled output for headings', () => {
    const theme = lightTheme();
    expect(hasAnsi(theme.heading1('test'))).toBe(true);
    expect(hasAnsi(theme.heading2('test'))).toBe(true);
    expect(hasAnsi(theme.heading3('test'))).toBe(true);
  });

  it('should have different heading styles than defaultTheme', () => {
    const dark = defaultTheme();
    const light = lightTheme();
    // The raw ANSI escape sequences should differ because lightTheme uses hex colors
    expect(light.heading1('test')).not.toBe(dark.heading1('test'));
    expect(light.heading2('test')).not.toBe(dark.heading2('test'));
    expect(light.heading3('test')).not.toBe(dark.heading3('test'));
  });
});

// ── createMarkdownTheme ─────────────────────────────────────────────────

describe('createMarkdownTheme', () => {
  it('should return a complete theme with empty color map', () => {
    const theme = createMarkdownTheme({});
    expect(typeof theme.heading1).toBe('function');
    expect(typeof theme.heading2).toBe('function');
    expect(typeof theme.bold).toBe('function');
    expect(typeof theme.italic).toBe('function');
    expect(typeof theme.code).toBe('function');
    expect(typeof theme.link).toBe('function');
    expect(typeof theme.blockquote).toBe('function');
    expect(typeof theme.listBullet).toBe('string');
    expect(typeof theme.hr).toBe('function');
    expect(typeof theme.admonitionTitle).toBe('function');
    expect(typeof theme.codeBlockFrame).toBe('function');
  });

  it('heading color should produce ANSI output', () => {
    const theme = createMarkdownTheme({ heading: '#FF0000' });
    expect(hasAnsi(theme.heading1('test'))).toBe(true);
    expect(hasAnsi(theme.heading2('test'))).toBe(true);
    expect(hasAnsi(theme.heading3('test'))).toBe(true);
    expect(hasAnsi(theme.heading4('test'))).toBe(true);
    expect(hasAnsi(theme.heading5('test'))).toBe(true);
    expect(hasAnsi(theme.heading6('test'))).toBe(true);
  });

  it('bold color should produce ANSI output', () => {
    const theme = createMarkdownTheme({ bold: '#00FF00' });
    expect(hasAnsi(theme.bold('test'))).toBe(true);
    expect(stripAnsi(theme.bold('test'))).toBe('test');
  });

  it('code color should produce ANSI output', () => {
    const theme = createMarkdownTheme({ code: '#0000FF' });
    expect(hasAnsi(theme.code('test'))).toBe(true);
    expect(stripAnsi(theme.code('test'))).toBe('test');
  });

  it('link color should produce ANSI output containing text and URL', () => {
    const theme = createMarkdownTheme({ link: '#FF00FF' });
    const result = theme.link('click here', 'https://example.com');
    expect(hasAnsi(result)).toBe(true);
    const plain = stripAnsi(result);
    expect(plain).toContain('click here');
    expect(plain).toContain('https://example.com');
  });

  it('link color also installs a matching linkText that omits the URL', () => {
    const theme = createMarkdownTheme({ link: '#FF00FF' });
    expect(theme.linkText).toBeDefined();
    const styled = theme.linkText!('click here');
    expect(hasAnsi(styled)).toBe(true);
    expect(stripAnsi(styled)).toBe('click here');
  });

  it('quote color should produce styled output with │', () => {
    const theme = createMarkdownTheme({ quote: '#FFFF00' });
    const result = theme.blockquote('quoted text');
    expect(hasAnsi(result)).toBe(true);
    const plain = stripAnsi(result);
    expect(plain).toContain('│');
    expect(plain).toContain('quoted text');
  });

  it('list color should produce a bullet containing •', () => {
    const theme = createMarkdownTheme({ list: '#00FFFF' });
    expect(typeof theme.listBullet).toBe('string');
    expect(hasAnsi(theme.listBullet)).toBe(true);
    expect(stripAnsi(theme.listBullet)).toContain('•');
  });

  it('should accept multiple colors at once', () => {
    const theme = createMarkdownTheme({
      heading: '#FF0000',
      bold: '#00FF00',
      code: '#0000FF',
      link: '#FF00FF',
      quote: '#FFFF00',
      list: '#00FFFF',
    });
    expect(hasAnsi(theme.heading1('h'))).toBe(true);
    expect(hasAnsi(theme.bold('b'))).toBe(true);
    expect(hasAnsi(theme.code('c'))).toBe(true);
    expect(hasAnsi(theme.link('t', 'u'))).toBe(true);
    expect(hasAnsi(theme.blockquote('q'))).toBe(true);
    expect(hasAnsi(theme.listBullet)).toBe(true);
  });
});

// ── fromSemanticTheme ───────────────────────────────────────────────────

describe('fromSemanticTheme', () => {
  const mockSemanticTheme = {
    colors: {
      text: color.white,
      textSoft: color.gray,
      muted: color.gray,
      bg: color.black,
      surface: color.black,
      surfaceAlt: color.black,
      surfaceRaised: color.black,
      backdrop: color.black,
      inverse: color.white,
      border: color.gray,
      borderHover: color.gray,
      borderActive: color.white,
      divider: color.gray,
      tones: {
        neutral: color.gray,
        accent: color.cyan,
        info: color.blue,
        success: color.green,
        warning: color.yellow,
        danger: color.red,
      },
    },
    spacing: { xs: 1, sm: 2, md: 4, lg: 8, xl: 16 },
    glyphs: {
      divider: '─',
      bullet: '●',
      keycapLeft: '‹',
      keycapRight: '›',
      tagPrefix: '#',
      selected: '●',
      unselected: '○',
      menuArrow: '▸',
      checked: '✓',
      unchecked: '○',
      radioOn: '●',
      radioOff: '○',
      pipe: '│',
      ellipsis: '…',
      pointer: '▸',
      doubleArrowH: '⇔',
      doubleArrowV: '⇕',
      cornerTL: '╭',
      cornerTR: '╮',
      cornerBL: '╰',
      cornerBR: '╯',
    },
  } as unknown as SemanticTheme;

  it('should return a complete MarkdownTheme', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    expect(typeof theme.heading1).toBe('function');
    expect(typeof theme.heading2).toBe('function');
    expect(typeof theme.heading3).toBe('function');
    expect(typeof theme.heading4).toBe('function');
    expect(typeof theme.heading5).toBe('function');
    expect(typeof theme.heading6).toBe('function');
    expect(typeof theme.bold).toBe('function');
    expect(typeof theme.italic).toBe('function');
    expect(typeof theme.code).toBe('function');
    expect(typeof theme.codeBlock).toBe('function');
    expect(typeof theme.link).toBe('function');
    expect(typeof theme.blockquote).toBe('function');
    expect(typeof theme.listBullet).toBe('string');
    expect(typeof theme.listNumber).toBe('function');
    expect(typeof theme.hr).toBe('function');
    expect(typeof theme.strikethrough).toBe('function');
    expect(typeof theme.tableHeader).toBe('function');
    expect(typeof theme.tableCell).toBe('function');
    expect(typeof theme.tableBorder).toBe('string');
    expect(typeof theme.taskChecked).toBe('string');
    expect(typeof theme.taskUnchecked).toBe('string');
    expect(typeof theme.admonitionTitle).toBe('function');
    expect(typeof theme.admonitionBorder).toBe('function');
    expect(typeof theme.footnoteRef).toBe('function');
    expect(typeof theme.footnoteDef).toBe('function');
    expect(typeof theme.imagePlaceholder).toBe('function');
    expect(typeof theme.emoji).toBe('function');
    expect(typeof theme.codeBlockFrame).toBe('function');
  });

  it('should use semantic colors for headings (produces ANSI output)', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    expect(hasAnsi(theme.heading1('test'))).toBe(true);
    expect(hasAnsi(theme.heading2('test'))).toBe(true);
    expect(hasAnsi(theme.heading3('test'))).toBe(true);
  });

  it('should use glyphs for bullets (listBullet contains ●)', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    expect(stripAnsi(theme.listBullet)).toContain('●');
  });

  it('should use glyphs for table border (tableBorder contains │)', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    expect(stripAnsi(theme.tableBorder)).toContain('│');
  });

  it('should use glyphs for taskChecked (contains ✓)', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    expect(stripAnsi(theme.taskChecked)).toContain('✓');
  });

  it('should use glyphs for taskUnchecked (contains ○)', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    expect(stripAnsi(theme.taskUnchecked)).toContain('○');
  });

  it('should use the pipe glyph in blockquote', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    const result = theme.blockquote('hello');
    const plain = stripAnsi(result);
    expect(plain).toContain('│');
    expect(plain).toContain('hello');
  });

  it('admonitionTitle and admonitionBorder should produce styled output', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    const kinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;

    for (const kind of kinds) {
      const title = theme.admonitionTitle(kind, 'Alert');
      expect(hasAnsi(title)).toBe(true);
      expect(stripAnsi(title)).toContain('Alert');

      const border = theme.admonitionBorder(kind);
      expect(hasAnsi(border)).toBe(true);
      expect(stripAnsi(border)).toContain('▌');
    }
  });

  it('emoji function should return unicode directly', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    const result = theme.emoji('fire', '🔥');
    expect(result).toBe('🔥');
  });

  it('codeBlockFrame defaults to an exact width of 80 cells', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    const result = theme.codeBlockFrame('code', '', undefined);
    const plain = stripAnsi(result);
    const topLine = plain.split('\n')[0]!;
    expect(topLine).toBe('┌' + '─'.repeat(79));
    expect(measureTextWidth(topLine)).toBe(80);
  });

  it('codeBlockFrame respects explicit width', () => {
    const theme = fromSemanticTheme(mockSemanticTheme);
    const result = theme.codeBlockFrame('code', '', 100);
    const plain = stripAnsi(result);
    const topLine = plain.split('\n')[0]!;
    expect(topLine).toBe('┌' + '─'.repeat(99));
    expect(measureTextWidth(topLine)).toBe(100);
  });
});
