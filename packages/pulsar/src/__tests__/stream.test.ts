import { describe, expect, it } from 'vitest';
import { createMarkdownStream } from '../stream.js';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('createMarkdownStream', () => {
  it('keeps headings pending until the line is terminated', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('# Hello');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('# Hello');
    expect(snapshot.rendered).toBe('');

    snapshot = stream.append('\n');
    expect(snapshot.committedSource).toBe('# Hello\n');
    expect(snapshot.pendingSource).toBe('');
    expect(stripAnsi(snapshot.rendered)).toContain('Hello');
  });

  it('does not render an open code fence until the closing fence arrives', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('```ts\nconst x = 1;\n');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('```ts\nconst x = 1;\n');
    expect(snapshot.rendered).toBe('');

    snapshot = stream.append('```\n');
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.type).toBe('code-block');
    expect(stripAnsi(snapshot.rendered)).toContain('const x = 1;');
  });

  it('waits for a paragraph terminator before committing a paragraph block', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('First line\nsecond line\n');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('First line\nsecond line\n');

    snapshot = stream.append('\n');
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.type).toBe('paragraph');
    expect(stripAnsi(snapshot.rendered)).toContain('First line second line');
  });

  it('resets its accumulated state', () => {
    const stream = createMarkdownStream();
    stream.append('# Hello\n');

    const snapshot = stream.reset();
    expect(snapshot.source).toBe('');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens).toEqual([]);
    expect(snapshot.rendered).toBe('');
  });

  it('flushes a complete final block even without a trailing newline', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('# Final title');
    expect(snapshot.rendered).toBe('');

    snapshot = stream.snapshot({ finalize: true });
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.type).toBe('heading');
    expect(stripAnsi(snapshot.rendered)).toContain('Final title');
  });

  it('treats indented fenced blocks as complete when finalized', () => {
    const stream = createMarkdownStream();

    stream.append('  ```ts\nconst x = 1;\n  ```');
    const snapshot = stream.snapshot({ finalize: true });

    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.type).toBe('code-block');
  });

  it('does not commit admonition content while blockquote lines continue', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('> [!NOTE]\n');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('> [!NOTE]\n');

    snapshot = stream.append('> Some content\n');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('> [!NOTE]\n> Some content\n');

    snapshot = stream.append('> More content\n');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('> [!NOTE]\n> Some content\n> More content\n');
  });

  it('commits admonition once a non-blockquote line and paragraph break appear', () => {
    const stream = createMarkdownStream();

    stream.append('> [!NOTE]\n> Some content\n');

    // Admonition is still unclosed — blank line alone doesn't close it
    // because empty lines don't count as non-blockquote content
    let snapshot = stream.append('\n');
    expect(snapshot.committedSource).toBe('');

    // A heading on its own line closes the admonition and is block-complete
    snapshot = stream.append('# Next\n');
    expect(snapshot.committedSource).toContain('> [!NOTE]');
    expect(snapshot.committedSource).toContain('> Some content');
  });

  it('finalize commits admonition even if still in blockquote lines', () => {
    const stream = createMarkdownStream();

    stream.append('> [!NOTE]\n> Some content\n> Still going');
    const snapshot = stream.snapshot({ finalize: true });

    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.committedSource).toBe('> [!NOTE]\n> Some content\n> Still going');
    expect(snapshot.tokens.length).toBeGreaterThan(0);
  });

  it('does not commit footnote definition while continuation lines are possible', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('[^1]: First line\n');
    // A single newline is not enough to prove that an indented continuation
    // will not follow, so the definition remains pending.
    const afterFirstLine = snapshot;
    expect(afterFirstLine.committedSource).toBe('');

    snapshot = stream.append('  continuation\n');
    // Now last line after split is '  continuation' -> indented continuation
    // hasUnclosedFootnote should detect this and prevent commit
    expect(snapshot.committedSource).toBe(afterFirstLine.committedSource);
    expect(snapshot.pendingSource).toContain('continuation');
  });

  it('commits footnote once non-indented content appears', () => {
    const stream = createMarkdownStream();

    stream.append('[^1]: First line\n  continuation\n');
    const snapshot = stream.append('\n');
    // Paragraph break triggers commit
    expect(snapshot.committedSource).toContain('[^1]: First line');
    expect(snapshot.committedSource).toContain('continuation');
    expect(snapshot.pendingSource).toBe('');
  });

  it('treats image line as block-complete and commits it', () => {
    const stream = createMarkdownStream();

    const snapshot = stream.append('![My Image](https://example.com/img.png)\n');
    expect(snapshot.committedSource).toBe('![My Image](https://example.com/img.png)\n');
    expect(snapshot.pendingSource).toBe('');
  });

  it('commits a footnote definition after a blank-line terminator', () => {
    const stream = createMarkdownStream();

    let snapshot = stream.append('[^1]: Definition text\n');
    expect(snapshot.committedSource).toBe('');
    snapshot = stream.append('\n');
    expect(snapshot.committedSource).toBe('[^1]: Definition text\n\n');
    expect(snapshot.pendingSource).toBe('');
  });

  it('keeps namespaced admonitions pending until their block closes', () => {
    const stream = createMarkdownStream();
    const pending = stream.append('> [!ROLE:permission]\n> Approval required\n');
    expect(pending.committedSource).toBe('');
    const closed = stream.append('\n# Next\n');
    expect(closed.committedSource).toContain('Approval required');
  });

  it('streams mixed content committing each block at the right boundary', () => {
    const stream = createMarkdownStream();

    // Heading commits immediately on newline (block-complete)
    let snapshot = stream.append('# Title\n');
    expect(snapshot.committedSource).toBe('# Title\n');
    expect(snapshot.pendingSource).toBe('');

    // Admonition stays pending while lines continue
    snapshot = stream.append('> [!WARNING]\n');
    expect(snapshot.pendingSource).toBe('> [!WARNING]\n');

    snapshot = stream.append('> Be careful\n');
    expect(snapshot.pendingSource).toContain('> Be careful');

    // A heading after the admonition closes it and triggers commit via paragraph break
    snapshot = stream.append('\n# Section\n');
    expect(snapshot.committedSource).toContain('> [!WARNING]');
    expect(snapshot.committedSource).toContain('> Be careful');

    // Finalize to flush the remaining heading
    snapshot = stream.snapshot({ finalize: true });
    expect(snapshot.pendingSource).toBe('');
    expect(stripAnsi(snapshot.rendered)).toContain('Be careful');

    // Start fresh for code block test
    stream.reset();

    // Code block stays pending until closing fence
    snapshot = stream.append('```js\nlet x = 1;\n');
    expect(snapshot.pendingSource).toBe('```js\nlet x = 1;\n');

    snapshot = stream.append('```\n');
    expect(snapshot.pendingSource).toBe('');
    expect(stripAnsi(snapshot.rendered)).toContain('let x = 1;');

    // Paragraph stays pending until terminated
    snapshot = stream.append('Some paragraph text\n');
    expect(snapshot.pendingSource).toBe('Some paragraph text\n');

    snapshot = stream.append('\n');
    expect(snapshot.pendingSource).toBe('');
    expect(stripAnsi(snapshot.rendered)).toContain('Some paragraph text');
  });

  it('does not block commits when an indented line follows a closed footnote definition', () => {
    const stream = createMarkdownStream();

    // Footnote def is closed by the blank paragraph break.
    stream.append('[^1]: Definition\n\n');
    // A subsequent paragraph that happens to start with two leading spaces
    // (e.g. preformatted user prose) must not be misread as an unclosed
    // footnote continuation.
    const snapshot = stream.append('Regular paragraph\n  pasted indented line');
    expect(snapshot.committedSource).toContain('[^1]: Definition');
    // The new paragraph stays pending only because it has no terminator yet,
    // not because a stale footnote is blocking commits.
    expect(snapshot.committedSource).toBe('[^1]: Definition\n\n');
  });

  it('finalize with unclosed admonition commits everything', () => {
    const stream = createMarkdownStream();

    stream.append('# Heading\n');
    stream.append('> [!TIP]\n> Helpful tip\n> Another line\n');

    // Admonition is still open — heading was committed but admonition is pending
    let snapshot = stream.snapshot();
    expect(snapshot.pendingSource).toContain('> [!TIP]');

    // Finalize forces everything to commit
    snapshot = stream.snapshot({ finalize: true });
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.committedSource).toBe('# Heading\n> [!TIP]\n> Helpful tip\n> Another line\n');
    expect(stripAnsi(snapshot.rendered)).toContain('Heading');
    expect(stripAnsi(snapshot.rendered)).toContain('Helpful tip');
  });

  it('finalize commits an unclosed code fence as the final block', () => {
    const stream = createMarkdownStream();
    stream.append('```ts\nconst finalValue = 1;');
    const snapshot = stream.snapshot({ finalize: true });
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens[0]?.type).toBe('code-block');
    expect(stripAnsi(snapshot.rendered)).toContain('finalValue');
  });

  it('tracks fence markers split across append chunks', () => {
    const stream = createMarkdownStream({ streaming: { partialHighlight: true } });
    stream.append('``');
    const open = stream.append('`ts\nconst value = 1;\n');
    expect(open.committedSource).toBe('');
    expect(open.pendingSource).toContain('```ts');

    stream.append('`');
    const closed = stream.append('``\n');
    expect(closed.pendingSource).toBe('');
    expect(closed.tokens[0]?.type).toBe('code-block');
  });

  it('rejects non-string runtime chunks', () => {
    const stream = createMarkdownStream();
    expect(() => stream.append(42 as never)).toThrow(/must be strings/);
  });
});

// ── Partial Highlight During Stream ───────────────────────────────────────

describe('createMarkdownStream partialHighlight', () => {
  it('renders partial code block when fence is open and partialHighlight is enabled', () => {
    const stream = createMarkdownStream({ streaming: { partialHighlight: true } });

    const snapshot = stream.append('```ts\nconst x = 1;\n');
    expect(snapshot.committedSource).toBe('');
    expect(snapshot.pendingSource).toBe('```ts\nconst x = 1;\n');
    expect(snapshot.rendered).not.toBe('');
    expect(stripAnsi(snapshot.rendered)).toContain('const x = 1;');
  });

  it('clears partial render when fence closes', () => {
    const stream = createMarkdownStream({ streaming: { partialHighlight: true } });

    stream.append('```ts\nconst x = 1;\n');
    const snapshot = stream.append('```\n');
    expect(snapshot.pendingSource).toBe('');
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.type).toBe('code-block');
    expect(stripAnsi(snapshot.rendered)).toContain('const x = 1;');
  });

  it('does not render partial block when partialHighlight is disabled', () => {
    const stream = createMarkdownStream();

    const snapshot = stream.append('```ts\nconst x = 1;\n');
    expect(snapshot.rendered).toBe('');
  });

  it('highlights multiple lines incrementally', () => {
    const stream = createMarkdownStream({ streaming: { partialHighlight: true } });

    const snapshot = stream.append('```js\nconst a = 1;\nconst b = 2;\n');
    const rendered = stripAnsi(snapshot.rendered);
    expect(rendered).toContain('const a = 1;');
    expect(rendered).toContain('const b = 2;');
  });

  it('parses punctuation-bearing fence languages and metadata while open', () => {
    const stream = createMarkdownStream({ streaming: { partialHighlight: true } });
    const snapshot = stream.append('```c++ wrap\nstd::vector<int> values;\n');
    expect(stripAnsi(snapshot.rendered)).toContain('std::vector');
    expect(stripAnsi(snapshot.rendered)).toContain('c++');
  });
});
