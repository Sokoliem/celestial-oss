import { describe, expect, it } from 'vitest';
import { getEmoji, parseInline, parseMarkdown, registerEmoji } from '../parser.js';
import { assignHeadingAnchors, inlineToPlainText } from '../parser/anchors.js';
import type { InlineToken, Token } from '../types.js';

describe('parseMarkdown', () => {
  it('normalizes CRLF and lone carriage-return line endings', () => {
    const crlf = parseMarkdown('# Windows heading\r\n\r\nWrapped\r\nparagraph\r\n');
    const carriageReturn = parseMarkdown('# Legacy heading\r\rBody\r');

    expect(crlf.map((token) => token.type)).toEqual(['heading', 'paragraph']);
    expect(carriageReturn.map((token) => token.type)).toEqual(['heading', 'paragraph']);
  });

  it('should parse h1 heading', () => {
    const tokens = parseMarkdown('# Hello');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe('heading');
    const heading = tokens[0] as Extract<Token, { type: 'heading' }>;
    expect(heading.level).toBe(1);
    expect(heading.content).toHaveLength(1);
    expect((heading.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('Hello');
  });

  it('should parse h2 through h6 headings', () => {
    for (let level = 2; level <= 6; level++) {
      const prefix = '#'.repeat(level);
      const tokens = parseMarkdown(`${prefix} Heading ${level}`);
      expect(tokens).toHaveLength(1);
      const heading = tokens[0] as Extract<Token, { type: 'heading' }>;
      expect(heading.type).toBe('heading');
      expect(heading.level).toBe(level);
    }
  });

  it('should parse bold inline text', () => {
    const tokens = parseMarkdown('**bold text**');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content).toHaveLength(1);
    expect(para.content[0]!.type).toBe('bold');
  });

  it('should parse italic inline text', () => {
    const tokens = parseMarkdown('*italic text*');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content).toHaveLength(1);
    expect(para.content[0]!.type).toBe('italic');
  });

  it('should parse inline code', () => {
    const tokens = parseMarkdown('`code`');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content).toHaveLength(1);
    expect(para.content[0]!.type).toBe('code');
    expect((para.content[0] as Extract<InlineToken, { type: 'code' }>).content).toBe('code');
  });

  it('should parse links', () => {
    const tokens = parseMarkdown('[click here](https://example.com)');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content).toHaveLength(1);
    const link = para.content[0] as Extract<InlineToken, { type: 'link' }>;
    expect(link.type).toBe('link');
    expect(link.text).toBe('click here');
    expect(link.url).toBe('https://example.com');
  });

  it('should parse strikethrough', () => {
    const tokens = parseMarkdown('~~deleted~~');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content).toHaveLength(1);
    expect(para.content[0]!.type).toBe('strikethrough');
  });

  it('should parse code blocks with language', () => {
    const input = '```typescript\nconst x = 1;\n```';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const block = tokens[0] as Extract<Token, { type: 'code-block' }>;
    expect(block.type).toBe('code-block');
    expect(block.language).toBe('typescript');
    expect(block.content).toBe('const x = 1;');
  });

  it('should parse code blocks without language', () => {
    const input = '```\nhello\n```';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const block = tokens[0] as Extract<Token, { type: 'code-block' }>;
    expect(block.language).toBe('');
    expect(block.content).toBe('hello');
  });

  it('should parse blockquotes', () => {
    const input = '> quoted text';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const quote = tokens[0] as Extract<Token, { type: 'blockquote' }>;
    expect(quote.type).toBe('blockquote');
    expect(quote.content).toHaveLength(1);
    expect(quote.content[0]!.type).toBe('paragraph');
  });

  it('should parse unordered lists', () => {
    const input = '- item one\n- item two\n- item three';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
  });

  it('should parse ordered lists', () => {
    const input = '1. first\n2. second\n3. third';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(3);
  });

  it('should parse horizontal rules', () => {
    const cases = ['---', '***', '___', '----', '****'];
    for (const hr of cases) {
      const tokens = parseMarkdown(hr);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.type).toBe('hr');
    }
  });

  it('should parse tables', () => {
    const input = '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const table = tokens[0] as Extract<Token, { type: 'table' }>;
    expect(table.type).toBe('table');
    expect(table.headers).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
  });

  it('should fall back to paragraph text for a single pipe-prefixed line', () => {
    const tokens = parseMarkdown('| literal pipe text');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.type).toBe('paragraph');
    expect(para.content).toHaveLength(1);
    expect((para.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('| literal pipe text');
  });

  it('should handle empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   ')).toEqual([]);
    expect(parseMarkdown('\n\n')).toEqual([]);
  });

  it('should handle mixed content', () => {
    const input = '# Title\n\nSome text here.\n\n- item 1\n- item 2';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(3);
    expect(tokens[0]!.type).toBe('heading');
    expect(tokens[1]!.type).toBe('paragraph');
    expect(tokens[2]!.type).toBe('list');
  });

  it('should handle nested inline: bold inside italic context', () => {
    const tokens = parseMarkdown('**bold with *italic* inside**');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content).toHaveLength(1);
    const bold = para.content[0] as Extract<InlineToken, { type: 'bold' }>;
    expect(bold.type).toBe('bold');
    // The bold content should have nested inline tokens
    expect(bold.content.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse unordered list with * bullet', () => {
    const input = '* alpha\n* beta';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
  });

  it('should parse bold with underscore syntax', () => {
    const tokens = parseMarkdown('__bold__');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content[0]!.type).toBe('bold');
  });
});
// ── Nested Lists ────────────────────────────────────────────────────────

describe('nested lists', () => {
  it('should parse a simple unordered list with 2-level nesting', () => {
    const input = '- parent\n  - child';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(1);

    const parentItem = list.items[0]!;
    expect((parentItem.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('parent');
    expect(parentItem.children).toBeDefined();
    expect(parentItem.children).toHaveLength(1);

    const childList = parentItem.children![0] as Extract<Token, { type: 'list' }>;
    expect(childList.type).toBe('list');
    expect(childList.ordered).toBe(false);
    expect(childList.items).toHaveLength(1);
    expect((childList.items[0]!.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('child');
  });

  it('should parse an ordered list with a nested unordered sub-list', () => {
    const input = '1. first\n  - nested bullet\n2. second';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(2);

    const firstItem = list.items[0]!;
    expect(firstItem.children).toBeDefined();
    expect(firstItem.children).toHaveLength(1);

    const nestedList = firstItem.children![0] as Extract<Token, { type: 'list' }>;
    expect(nestedList.type).toBe('list');
    expect(nestedList.ordered).toBe(false);
    expect(nestedList.items).toHaveLength(1);
    expect((nestedList.items[0]!.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('nested bullet');

    // Second top-level item has no children
    expect(list.items[1]!.children).toBeUndefined();
  });

  it('should parse 3 levels of nesting', () => {
    const input = '- parent\n  - child\n    - grandchild';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.items).toHaveLength(1);

    // Level 1 → parent
    const parentItem = list.items[0]!;
    expect(parentItem.children).toBeDefined();
    const childList = parentItem.children![0] as Extract<Token, { type: 'list' }>;

    // Level 2 → child
    expect(childList.items).toHaveLength(1);
    const childItem = childList.items[0]!;
    expect((childItem.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('child');
    expect(childItem.children).toBeDefined();

    // Level 3 → grandchild
    const grandchildList = childItem.children![0] as Extract<Token, { type: 'list' }>;
    expect(grandchildList.type).toBe('list');
    expect(grandchildList.items).toHaveLength(1);
    expect((grandchildList.items[0]!.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('grandchild');
  });

  it('should have parsed Token arrays in item.children', () => {
    const input = '- parent\n  - child one\n  - child two';
    const tokens = parseMarkdown(input);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    const parentItem = list.items[0]!;

    expect(Array.isArray(parentItem.children)).toBe(true);
    const childList = parentItem.children![0] as Extract<Token, { type: 'list' }>;
    expect(childList.type).toBe('list');
    expect(childList.items).toHaveLength(2);

    // Each child item has inline content
    for (const child of childList.items) {
      expect(child.content.length).toBeGreaterThanOrEqual(1);
      expect(child.content[0]!.type).toBe('text');
    }
  });
});

// ── GFM Task Lists ─────────────────────────────────────────────────────

describe('GFM task lists', () => {
  it('should parse an unchecked task item', () => {
    const input = '- [ ] unchecked item';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.items).toHaveLength(1);

    const item = list.items[0]!;
    expect(item.checked).toBe(false);
    expect((item.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('unchecked item');
  });

  it('should parse a checked task item with lowercase x', () => {
    const input = '- [x] checked item';
    const tokens = parseMarkdown(input);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    const item = list.items[0]!;
    expect(item.checked).toBe(true);
    expect((item.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('checked item');
  });

  it('should parse a checked task item with uppercase X', () => {
    const input = '- [X] done';
    const tokens = parseMarkdown(input);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    const item = list.items[0]!;
    expect(item.checked).toBe(true);
  });

  it('should handle a mixed list with regular and task items', () => {
    const input = '- regular item\n- [ ] todo\n- [x] done\n- another regular';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'list' }>;
    expect(list.items).toHaveLength(4);

    expect(list.items[0]!.checked).toBeUndefined();
    expect(list.items[1]!.checked).toBe(false);
    expect(list.items[2]!.checked).toBe(true);
    expect(list.items[3]!.checked).toBeUndefined();
  });
});

// ── Admonitions ─────────────────────────────────────────────────────────

describe('admonitions', () => {
  it('should parse > [!NOTE] as an admonition with kind "note"', () => {
    const input = '> [!NOTE]\n> This is a note.';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.type).toBe('admonition');
    expect(adm.kind).toBe('note');
  });

  it('should parse > [!TIP] as an admonition with kind "tip"', () => {
    const input = '> [!TIP]\n> Helpful tip.';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.type).toBe('admonition');
    expect(adm.kind).toBe('tip');
  });

  it('should parse > [!IMPORTANT] as an admonition with kind "important"', () => {
    const input = '> [!IMPORTANT]\n> Critical info.';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.type).toBe('admonition');
    expect(adm.kind).toBe('important');
  });

  it('should parse > [!WARNING] as an admonition with kind "warning"', () => {
    const input = '> [!WARNING]\n> Be careful.';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.type).toBe('admonition');
    expect(adm.kind).toBe('warning');
  });

  it('should parse > [!CAUTION] as an admonition with kind "caution"', () => {
    const input = '> [!CAUTION]\n> Danger zone.';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.type).toBe('admonition');
    expect(adm.kind).toBe('caution');
  });

  it('should use capitalized kind as default title when no custom title', () => {
    const input = '> [!NOTE]\n> Body text.';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.title).toBe('Note');
  });

  it('should use a custom title when provided', () => {
    const input = '> [!NOTE] My Custom Title\n> Body text.';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(adm.title).toBe('My Custom Title');
  });

  it('should recursively parse admonition content into Token[]', () => {
    const input = '> [!TIP]\n> **bold** content here';
    const tokens = parseMarkdown(input);
    const adm = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(Array.isArray(adm.content)).toBe(true);
    expect(adm.content.length).toBeGreaterThanOrEqual(1);
    // The body should be parsed as a paragraph with inline bold
    const para = adm.content[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.type).toBe('paragraph');
    expect(para.content.some((t) => t.type === 'bold')).toBe(true);
  });

  it('should still parse regular blockquotes that are not admonitions', () => {
    const input = '> Just a regular quote.';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe('blockquote');
  });
});

// ── Footnote Definitions ────────────────────────────────────────────────

describe('footnote definitions', () => {
  it('should parse a simple footnote definition', () => {
    const input = '[^1]: This is the footnote content.';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const fn = tokens[0] as Extract<Token, { type: 'footnote-def' }>;
    expect(fn.type).toBe('footnote-def');
    expect(fn.label).toBe('1');
    expect(Array.isArray(fn.content)).toBe(true);
    expect(fn.content).toHaveLength(1);
    const para = fn.content[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.type).toBe('paragraph');
    expect((para.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('This is the footnote content.');
  });

  it('should parse a footnote with multi-line continuation', () => {
    const input = '[^long]: First line.\n  Second line continued.\n  Third line continued.';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const fn = tokens[0] as Extract<Token, { type: 'footnote-def' }>;
    expect(fn.type).toBe('footnote-def');
    expect(fn.label).toBe('long');
    // The content is parsed from all continuation lines joined
    expect(fn.content.length).toBeGreaterThanOrEqual(1);
  });

  it('should have correct label and Token[] content', () => {
    const input = '[^myref]: Reference **with bold**.';
    const tokens = parseMarkdown(input);
    const fn = tokens[0] as Extract<Token, { type: 'footnote-def' }>;
    expect(fn.label).toBe('myref');
    const para = fn.content[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.type).toBe('paragraph');
    expect(para.content.some((t) => t.type === 'bold')).toBe(true);
  });
});

// ── Block-Level Images ──────────────────────────────────────────────────

describe('block-level images', () => {
  it('should parse an image without title', () => {
    const input = '![alt text](https://example.com/img.png)';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const img = tokens[0] as Extract<Token, { type: 'image' }>;
    expect(img.type).toBe('image');
    expect(img.alt).toBe('alt text');
    expect(img.url).toBe('https://example.com/img.png');
    expect(img.title).toBeUndefined();
  });

  it('should parse an image with title', () => {
    const input = '![photo](https://example.com/photo.jpg "My Photo")';
    const tokens = parseMarkdown(input);
    expect(tokens).toHaveLength(1);
    const img = tokens[0] as Extract<Token, { type: 'image' }>;
    expect(img.type).toBe('image');
    expect(img.alt).toBe('photo');
    expect(img.url).toBe('https://example.com/photo.jpg');
    expect(img.title).toBe('My Photo');
  });
});

// ── Emoji Shortcodes (inline) ───────────────────────────────────────────

describe('emoji shortcodes (parseInline)', () => {
  it('should convert a known emoji shortcode to unicode', () => {
    const tokens = parseInline(':rocket:');
    expect(tokens).toHaveLength(1);
    const emoji = tokens[0] as Extract<InlineToken, { type: 'emoji' }>;
    expect(emoji.type).toBe('emoji');
    expect(emoji.name).toBe('rocket');
    expect(emoji.unicode).toBe('🚀');
  });

  it('should fall through to text for an unknown emoji', () => {
    const tokens = parseInline(':unknown_emoji:');
    // Should NOT produce an emoji token
    const emojiTokens = tokens.filter((t) => t.type === 'emoji');
    expect(emojiTokens).toHaveLength(0);
    // Should produce text that contains the original shortcode text
    const textContent = tokens
      .filter((t): t is Extract<InlineToken, { type: 'text' }> => t.type === 'text')
      .map((t) => t.content)
      .join('');
    expect(textContent).toContain(':unknown_emoji:');
  });

  it('should handle multiple emojis in a line', () => {
    const tokens = parseInline(':fire: and :star:');
    const emojiTokens = tokens.filter((t): t is Extract<InlineToken, { type: 'emoji' }> => t.type === 'emoji');
    expect(emojiTokens).toHaveLength(2);
    expect(emojiTokens[0]!.name).toBe('fire');
    expect(emojiTokens[0]!.unicode).toBe('🔥');
    expect(emojiTokens[1]!.name).toBe('star');
    expect(emojiTokens[1]!.unicode).toBe('⭐');
  });

  it('does not fragment `_snake_case_var_` into multiple italic spans', () => {
    const tokens = parseInline('_snake_case_var_ tail');
    const italics = tokens.filter((t) => t.type === 'italic');
    // CommonMark: the whole `_..._` span is one italic, or we fall back to
    // literal text — but never the old "italic(snake) + case + italic(var)"
    // triple.
    expect(italics.length).toBeLessThanOrEqual(1);
  });

  it('keeps `foo_bar_baz` as literal text (no italic inside a word)', () => {
    const tokens = parseInline('foo_bar_baz');
    expect(tokens.some((t) => t.type === 'italic')).toBe(false);
    const joined = tokens.map((t) => (t.type === 'text' ? t.content : '')).join('');
    expect(joined).toBe('foo_bar_baz');
  });

  it('still italicizes a bare `_word_` at a word boundary', () => {
    const tokens = parseInline('plain _word_ end');
    const italics = tokens.filter((t): t is Extract<InlineToken, { type: 'italic' }> => t.type === 'italic');
    expect(italics).toHaveLength(1);
    expect((italics[0]!.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('word');
  });

  it('still italicizes a bare `*word*` independent of the underscore rule', () => {
    const tokens = parseInline('plain *word* end');
    const italics = tokens.filter((t): t is Extract<InlineToken, { type: 'italic' }> => t.type === 'italic');
    expect(italics).toHaveLength(1);
    expect((italics[0]!.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('word');
  });

  it('parses a GFM table written without leading/trailing pipes', () => {
    const tokens = parseMarkdown('Name | Age\n- | -\nAlice | 30\nBob | 25\n');
    expect(tokens).toHaveLength(1);
    const table = tokens[0] as Extract<Token, { type: 'table' }>;
    expect(table.type).toBe('table');
    expect(table.headers).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
  });

  it('still parses traditional pipe-delimited tables unchanged', () => {
    const tokens = parseMarkdown('| Name | Age |\n| --- | --- |\n| Alice | 30 |');
    expect(tokens).toHaveLength(1);
    const table = tokens[0] as Extract<Token, { type: 'table' }>;
    expect(table.type).toBe('table');
    expect(table.headers).toHaveLength(2);
    expect(table.rows).toHaveLength(1);
  });

  it('resolves a full reference link [text][ref]', () => {
    const tokens = parseMarkdown('See [docs][ex] for details.\n\n[ex]: https://example.com\n');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    const link = para.content.find((t) => t.type === 'link') as Extract<InlineToken, { type: 'link' }> | undefined;
    expect(link).toBeDefined();
    expect(link!.text).toBe('docs');
    expect(link!.url).toBe('https://example.com');
  });

  it('resolves a collapsed reference link [text][]', () => {
    const tokens = parseMarkdown('See [ex][] for details.\n\n[ex]: https://example.com\n');
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    const link = para.content.find((t) => t.type === 'link') as Extract<InlineToken, { type: 'link' }> | undefined;
    expect(link?.url).toBe('https://example.com');
  });

  it('resolves a shortcut reference link [ref]', () => {
    const tokens = parseMarkdown('See [ex] for details.\n\n[ex]: https://example.com\n');
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    const link = para.content.find((t) => t.type === 'link') as Extract<InlineToken, { type: 'link' }> | undefined;
    expect(link?.url).toBe('https://example.com');
  });

  it('reference-link labels are case-insensitive', () => {
    const tokens = parseMarkdown('See [Docs][EX].\n\n[ex]: https://example.com\n');
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    const link = para.content.find((t) => t.type === 'link') as Extract<InlineToken, { type: 'link' }> | undefined;
    expect(link?.url).toBe('https://example.com');
  });

  it('unknown reference labels fall through to text (no crash)', () => {
    const tokens = parseMarkdown('See [missing] in a sentence.\n\n[other]: https://example.com\n');
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content.some((t) => t.type === 'link')).toBe(false);
    const joined = para.content.map((t) => (t.type === 'text' ? t.content : '')).join('');
    expect(joined).toContain('missing');
  });

  it('ignores ref-style definition syntax inside fenced code blocks', () => {
    const tokens = parseMarkdown('```\n[ex]: https://example.com\n```\n\nSee [ex].\n');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.type).toBe('code-block');
    // The [ex]: definition was inside the fence so it must NOT become a ref,
    // which means [ex] stays literal text.
    const para = tokens[1] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content.some((t) => t.type === 'link')).toBe(false);
  });

  it('does not mistake a footnote-def [^1]: for a ref-def', () => {
    const tokens = parseMarkdown('See [^1].\n\n[^1]: a note\n');
    expect(tokens.find((t) => t.type === 'footnote-def')).toBeDefined();
  });

  it('parses setext H1 (=== underline) as a level-1 heading', () => {
    const tokens = parseMarkdown('Title\n===\n');
    expect(tokens).toHaveLength(1);
    const heading = tokens[0] as Extract<Token, { type: 'heading' }>;
    expect(heading.type).toBe('heading');
    expect(heading.level).toBe(1);
    expect((heading.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('Title');
  });

  it('parses setext H2 (--- underline) as a level-2 heading, not paragraph + hr', () => {
    const tokens = parseMarkdown('Subtitle\n---\n');
    expect(tokens).toHaveLength(1);
    const heading = tokens[0] as Extract<Token, { type: 'heading' }>;
    expect(heading.type).toBe('heading');
    expect(heading.level).toBe(2);
    expect((heading.content[0] as Extract<InlineToken, { type: 'text' }>).content).toBe('Subtitle');
  });

  it('keeps --- as an HR when there is no content line above it', () => {
    const tokens = parseMarkdown('\n---\n');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe('hr');
  });

  it('does not treat `- item\\n---` as a setext heading', () => {
    const tokens = parseMarkdown('- item\n---\n');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.type).toBe('list');
    expect(tokens[1]!.type).toBe('hr');
  });

  it('emits a hard-break token for a line ending with two spaces', () => {
    const tokens = parseMarkdown('line one  \nline two');
    expect(tokens).toHaveLength(1);
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.type).toBe('paragraph');
    const hardBreaks = para.content.filter((t) => t.type === 'hard-break');
    expect(hardBreaks).toHaveLength(1);
    const textContent = para.content
      .filter((t): t is Extract<InlineToken, { type: 'text' }> => t.type === 'text')
      .map((t) => t.content)
      .join('|');
    expect(textContent).toContain('line one');
    expect(textContent).toContain('line two');
  });

  it('collapses non-hard-break line wraps to a single space', () => {
    const tokens = parseMarkdown('line one\nline two');
    const para = tokens[0] as Extract<Token, { type: 'paragraph' }>;
    expect(para.content.some((t) => t.type === 'hard-break')).toBe(false);
    const joined = para.content.map((t) => (t.type === 'text' ? t.content : '')).join('');
    expect(joined).toBe('line one line two');
  });

  it('exposes registerEmoji to add custom shortcodes', () => {
    expect(getEmoji('celestial')).toBeUndefined();
    registerEmoji('celestial', '🌌');
    try {
      expect(getEmoji('celestial')).toBe('🌌');
      const tokens = parseInline(':celestial:');
      expect(tokens).toHaveLength(1);
      const emoji = tokens[0] as Extract<InlineToken, { type: 'emoji' }>;
      expect(emoji.type).toBe('emoji');
      expect(emoji.unicode).toBe('🌌');
    } finally {
      // Replace with empty string would still match the shortcode regex; instead
      // overwrite back to the original undefined state by deleting via re-register
      // with the previous mapping. We cannot delete from the registry without an
      // explicit API, so reuse the well-known glyph (no leak across tests).
      registerEmoji('celestial', '🌌');
    }
  });

  it('validates custom emoji names and neutralizes control characters', () => {
    expect(() => registerEmoji('__proto__!', 'x')).toThrow(/shortcode names/);
    registerEmoji('safe_control', '\x1b[31m');
    expect(getEmoji('safe_control')).toBe('�[31m');
  });
});

// ── Footnote References (inline) ────────────────────────────────────────

describe('footnote references (parseInline)', () => {
  it('should parse [^1] as a footnote reference', () => {
    const tokens = parseInline('[^1]');
    expect(tokens).toHaveLength(1);
    const ref = tokens[0] as Extract<InlineToken, { type: 'footnote-ref' }>;
    expect(ref.type).toBe('footnote-ref');
    expect(ref.label).toBe('1');
  });

  it('should parse [^myref] as a footnote reference', () => {
    const tokens = parseInline('[^myref]');
    expect(tokens).toHaveLength(1);
    const ref = tokens[0] as Extract<InlineToken, { type: 'footnote-ref' }>;
    expect(ref.type).toBe('footnote-ref');
    expect(ref.label).toBe('myref');
  });

  it('should parse footnote references inline with text', () => {
    const tokens = parseInline('See this[^note] for details.');
    const refs = tokens.filter((t): t is Extract<InlineToken, { type: 'footnote-ref' }> => t.type === 'footnote-ref');
    expect(refs).toHaveLength(1);
    expect(refs[0]!.label).toBe('note');
  });
});

// ── Inline Images ───────────────────────────────────────────────────────

describe('inline images (parseInline)', () => {
  it('should produce an image-inline token', () => {
    const tokens = parseInline('![alt text](https://example.com/img.png)');
    const imageTokens = tokens.filter((t): t is Extract<InlineToken, { type: 'image-inline' }> => t.type === 'image-inline');
    expect(imageTokens.length).toBe(1);
    expect(imageTokens[0]).toMatchObject({
      type: 'image-inline',
      alt: 'alt text',
      url: 'https://example.com/img.png',
    });
  });

  it('should use "image" as default alt when alt is empty', () => {
    const tokens = parseInline('![](https://example.com/img.png)');
    const imageTokens = tokens.filter((t): t is Extract<InlineToken, { type: 'image-inline' }> => t.type === 'image-inline');
    expect(imageTokens.length).toBe(1);
    expect(imageTokens[0]).toMatchObject({
      type: 'image-inline',
      alt: 'image',
      url: 'https://example.com/img.png',
    });
  });
});

// ── Mark / Sup / Sub / Math ────────────────────────────────────────────

describe('mark, sup, sub, math (parseInline / parseMarkdown)', () => {
  it('should parse ==highlight== as a mark token', () => {
    const tokens = parseInline('this is ==important== text');
    const mark = tokens.find((t): t is Extract<InlineToken, { type: 'mark' }> => t.type === 'mark');
    expect(mark).toBeDefined();
    const inner = mark!.content[0] as Extract<InlineToken, { type: 'text' }>;
    expect(inner.content).toBe('important');
  });

  it('should parse <sup> and <sub> HTML tags as inline tokens', () => {
    const sup = parseInline('E = mc<sup>2</sup>');
    const supToken = sup.find((t) => t.type === 'sup');
    expect(supToken).toBeDefined();
    const sub = parseInline('H<sub>2</sub>O');
    const subToken = sub.find((t) => t.type === 'sub');
    expect(subToken).toBeDefined();
  });

  it('should parse inline math $...$ but skip currency-style $5', () => {
    const tokens = parseInline('inline $E=mc^2$ math');
    const math = tokens.find((t): t is Extract<InlineToken, { type: 'math-inline' }> => t.type === 'math-inline');
    expect(math).toBeDefined();
    expect(math!.content).toBe('E=mc^2');
    const noMatch = parseInline('she paid $5 for it');
    expect(noMatch.find((t) => t.type === 'math-inline')).toBeUndefined();
  });

  it('should parse block math $$...$$ as a math-block token', () => {
    const tokens = parseMarkdown(['$$', '\\sum_{n=1}^{\\infty} \\frac{1}{n^2}', '$$'].join('\n'));
    expect(tokens).toHaveLength(1);
    const math = tokens[0] as Extract<Token, { type: 'math-block' }>;
    expect(math.type).toBe('math-block');
    expect(math.content).toContain('\\sum');
  });

  it('should parse inline-on-one-line block math $$...$$', () => {
    const tokens = parseMarkdown('$$ x = 1 $$');
    expect(tokens).toHaveLength(1);
    const math = tokens[0] as Extract<Token, { type: 'math-block' }>;
    expect(math.type).toBe('math-block');
    expect(math.content).toBe('x = 1');
  });

  it('should strip <span> / <div> wrappers and keep inner content', () => {
    const tokens = parseInline('Some <span style="color: red;">red</span> text');
    const flat = tokens.map((t) => (t.type === 'text' ? (t as Extract<InlineToken, { type: 'text' }>).content : '')).join('');
    expect(flat).toContain('red');
    expect(flat).not.toContain('style');
    expect(flat).not.toContain('color: red');
  });

  it('should parse auto-links <https://example.com>', () => {
    const tokens = parseInline('See <https://example.com> for more.');
    const link = tokens.find((t): t is Extract<InlineToken, { type: 'link' }> => t.type === 'link');
    expect(link).toBeDefined();
    expect(link!.url).toBe('https://example.com');
    expect(link!.text).toBe('https://example.com');
  });

  it('should parse triple ***bold-italic*** as bold containing italic', () => {
    const tokens = parseInline('***both***');
    expect(tokens).toHaveLength(1);
    const bold = tokens[0] as Extract<InlineToken, { type: 'bold' }>;
    expect(bold.type).toBe('bold');
    expect(bold.content[0]!.type).toBe('italic');
  });
});

// ── Definition Lists ───────────────────────────────────────────────────

describe('definition lists (parseMarkdown)', () => {
  it('should parse a definition list with one term + multiple definitions', () => {
    const tokens = parseMarkdown(['Term A', ': First definition', ': Second definition'].join('\n'));
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'definition-list' }>;
    expect(list.type).toBe('definition-list');
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.descriptions).toHaveLength(2);
  });

  it('should parse a definition list with multiple terms', () => {
    const tokens = parseMarkdown(['Apple', ': A red fruit', '', 'Banana', ': A yellow fruit'].join('\n'));
    expect(tokens).toHaveLength(1);
    const list = tokens[0] as Extract<Token, { type: 'definition-list' }>;
    expect(list.type).toBe('definition-list');
    expect(list.items).toHaveLength(2);
  });
});

// ── Details / Summary ──────────────────────────────────────────────────

describe('details/summary blocks (parseMarkdown)', () => {
  it('should parse <details><summary>…</summary>…</details> as a details block', () => {
    const tokens = parseMarkdown(['<details>', '<summary>Click to expand</summary>', '', 'Hidden body.', '</details>'].join('\n'));
    expect(tokens).toHaveLength(1);
    const details = tokens[0] as Extract<Token, { type: 'details' }>;
    expect(details.type).toBe('details');
    const summaryText = (details.summary[0] as Extract<InlineToken, { type: 'text' }>).content;
    expect(summaryText).toBe('Click to expand');
    expect(details.content.length).toBeGreaterThan(0);
  });

  it('should fall back gracefully when </details> is missing', () => {
    const tokens = parseMarkdown(['<details>', '<summary>Open</summary>', 'no closer here'].join('\n'));
    // No details token expected — falls back to paragraph(s)/text.
    expect(tokens.find((t) => t.type === 'details')).toBeUndefined();
  });
});

// ── Default Emoji Set ───────────────────────────────────────────────────

describe('default emoji shortcode set', () => {
  it('should resolve common GitHub emoji shortcodes from the default set', () => {
    expect(getEmoji('heavy_check_mark')).toBeDefined();
    expect(getEmoji('rocket')).toBe('🚀');
    expect(getEmoji('warning')).toBeDefined();
    expect(getEmoji('not_a_real_emoji_xyz')).toBeUndefined();
  });

  it('should treat a default emoji shortcode as an emoji token mid-prose', () => {
    const tokens = parseInline('PR merged :tada: ship it');
    const emoji = tokens.find((t): t is Extract<InlineToken, { type: 'emoji' }> => t.type === 'emoji');
    expect(emoji).toBeDefined();
    expect(emoji!.name).toBe('tada');
  });

  it('exposes registerEmoji to add custom shortcodes', () => {
    expect(getEmoji('celestial_test')).toBeUndefined();
    registerEmoji('celestial_test', '🌌');
    expect(getEmoji('celestial_test')).toBe('🌌');
    const tokens = parseInline(':celestial_test:');
    expect(tokens).toHaveLength(1);
    const emoji = tokens[0] as Extract<InlineToken, { type: 'emoji' }>;
    expect(emoji.type).toBe('emoji');
    expect(emoji.unicode).toBe('🌌');
  });
});

// ── Wiki-links ───────────────────────────────────────────────────────────

describe('wiki-links (parseMarkdown / parseInline)', () => {
  it('should parse a block wiki-link on its own line', () => {
    const tokens = parseMarkdown('[[Page Title]]');
    expect(tokens).toHaveLength(1);
    const wiki = tokens[0] as Extract<Token, { type: 'wiki-link-block' }>;
    expect(wiki.type).toBe('wiki-link-block');
    expect(wiki.target).toBe('Page Title');
    expect(wiki.alias).toBeUndefined();
  });

  it('should parse a block wiki-link with alias', () => {
    const tokens = parseMarkdown('[[Target Page|Display Text]]');
    expect(tokens).toHaveLength(1);
    const wiki = tokens[0] as Extract<Token, { type: 'wiki-link-block' }>;
    expect(wiki.type).toBe('wiki-link-block');
    expect(wiki.target).toBe('Target Page');
    expect(wiki.alias).toBe('Display Text');
  });

  it('should parse an inline wiki-link', () => {
    const tokens = parseInline('See [[Some Page]] for more');
    const wiki = tokens.find((t): t is Extract<InlineToken, { type: 'wiki-link' }> => t.type === 'wiki-link');
    expect(wiki).toBeDefined();
    expect(wiki!.target).toBe('Some Page');
    expect(wiki!.alias).toBeUndefined();
  });

  it('should parse an inline wiki-link with alias', () => {
    const tokens = parseInline('See [[Some Page|display]] for more');
    const wiki = tokens.find((t): t is Extract<InlineToken, { type: 'wiki-link' }> => t.type === 'wiki-link');
    expect(wiki).toBeDefined();
    expect(wiki!.target).toBe('Some Page');
    expect(wiki!.alias).toBe('display');
  });
});

// ── Collapsed Admonitions ──────────────────────────────────────────────

describe('collapsed admonitions (parseMarkdown)', () => {
  it('should parse a collapsible admonition with + suffix', () => {
    const tokens = parseMarkdown('> [!note]+\n> Expanded by default');
    expect(tokens).toHaveLength(1);
    const admonition = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(admonition.type).toBe('admonition');
    expect(admonition.kind).toBe('note');
    expect(admonition.collapsible).toBe(true);
    expect(admonition.collapsed).toBe(false);
  });

  it('should parse a collapsed admonition with - suffix', () => {
    const tokens = parseMarkdown('> [!warning]-\n> Hidden by default');
    expect(tokens).toHaveLength(1);
    const admonition = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(admonition.type).toBe('admonition');
    expect(admonition.kind).toBe('warning');
    expect(admonition.collapsible).toBe(true);
    expect(admonition.collapsed).toBe(true);
  });

  it('should parse a non-collapsible admonition without suffix', () => {
    const tokens = parseMarkdown('> [!tip]\n> Always visible');
    expect(tokens).toHaveLength(1);
    const admonition = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(admonition.type).toBe('admonition');
    expect(admonition.collapsible).toBeUndefined();
    expect(admonition.collapsed).toBeUndefined();
  });

  it('should parse AI admonition kinds', () => {
    const tokens = parseMarkdown('> [!ai-thinking]\n> Processing...');
    expect(tokens).toHaveLength(1);
    const admonition = tokens[0] as Extract<Token, { type: 'admonition' }>;
    expect(admonition.kind).toBe('ai-thinking');
  });
});

describe('parser resource limits', () => {
  it('bounds recursive inline formatting and preserves the unparsed tail as text', () => {
    const source = `${'<sup>'.repeat(200)}tail${'</sup>'.repeat(200)}`;
    let branch = parseInline(source);
    let depth = 0;

    while (branch[0]?.type === 'sup') {
      depth++;
      branch = branch[0].content;
    }

    expect(depth).toBeLessThanOrEqual(64);
    expect(branch[0]).toMatchObject({ type: 'text' });
    expect((branch[0] as Extract<InlineToken, { type: 'text' }>).content).toContain('tail');
  });

  it('bounds nested block parsing without dropping the remaining content', () => {
    const tokens = parseMarkdown(`${'> '.repeat(200)}terminal content`);
    let branch = tokens;
    let depth = 0;

    while (branch[0]?.type === 'blockquote') {
      depth++;
      branch = branch[0].content;
    }

    expect(depth).toBeLessThanOrEqual(64);
    expect(branch[0]?.type).toBe('paragraph');
    const paragraph = branch[0] as Extract<Token, { type: 'paragraph' }>;
    expect(inlineToPlainText(paragraph.content)).toContain('terminal content');
  });

  it('coalesces long literal special-character runs', () => {
    const source = '$'.repeat(4096);
    expect(parseInline(source)).toEqual([{ type: 'text', content: source }]);
  });

  it('contains cycles in externally supplied token trees', () => {
    const inline = { type: 'bold', content: [] } as Extract<InlineToken, { type: 'bold' }>;
    inline.content.push(inline);
    expect(() => inlineToPlainText([inline])).not.toThrow();

    const block = { type: 'blockquote', content: [] } as Extract<Token, { type: 'blockquote' }>;
    block.content.push(block);
    expect(() => assignHeadingAnchors([block])).not.toThrow();
  });
});
