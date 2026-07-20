/**
 * Semantic Zoom (B3)
 *
 * Renders markdown at three zoom levels:
 *   - 'outline'   → headings only
 *   - 'summary'   → headings + first paragraph after each heading
 *   - 'full'      → everything (default)
 *
 * Usage:
 *   const vnode = markdownView(source, 'outline', opts);
 */

import { parseMarkdown } from './parser/index.js';
import type { InlineToken, RenderOptions, Token } from './types.js';
import { markdown } from './vnode.js';

export type ViewMode = 'outline' | 'summary' | 'full';

/**
 * Render markdown as a VNode tree filtered by semantic zoom level.
 *
 * @param input   Markdown source
 * @param mode    'outline' | 'summary' | 'full'
 * @param options Standard RenderOptions
 */
export function markdownView(input: string, mode: ViewMode, options?: RenderOptions): ReturnType<typeof markdown> {
  if ((mode !== 'outline' && mode !== 'summary') || !input.trim()) {
    return markdown(input, options);
  }

  const tokens = parseMarkdown(input);
  const filtered = filterTokensForView(tokens, mode);

  // Reconstruct a minimal markdown string from the filtered tokens so we
  // can reuse the existing renderer pipeline. This is simpler than
  // duplicating the VNode conversion logic for each token type.
  const reconstructed = filtered.map((token) => tokenToSource(token)).join('\n\n');
  return markdown(reconstructed, options);
}

function filterTokensForView(tokens: readonly Token[], mode: ViewMode): Token[] {
  if (mode === 'outline') {
    return tokens.filter((t) => t.type === 'heading');
  }

  // summary: headings + first paragraph after each heading
  const out: Token[] = [];
  let lastWasHeading = false;
  for (const token of tokens) {
    if (token.type === 'heading') {
      out.push(token);
      lastWasHeading = true;
    } else if (lastWasHeading && token.type === 'paragraph') {
      out.push(token);
      lastWasHeading = false;
    } else {
      lastWasHeading = false;
    }
  }
  return out;
}

/** Best-effort source reconstruction for a single token. */
function tokenToSource(token: Token): string {
  switch (token.type) {
    case 'heading':
      return `${'#'.repeat(token.level)} ${inlineToPlain(token.content)}`;
    case 'paragraph':
      return inlineToPlain(token.content);
    case 'code-block':
      return '```' + (token.language || '') + '\n' + token.content + '\n```';
    case 'blockquote':
      return token.content.map((t) => '> ' + tokenToSource(t)).join('\n');
    case 'list':
      return token.items
        .map((item, i) => {
          const bullet = token.ordered ? `${i + 1}.` : '-';
          const text = inlineToPlain(item.content);
          return `${bullet} ${text}`;
        })
        .join('\n');
    case 'hr':
      return '---';
    case 'table': {
      const headers = token.headers.map((h) => inlineToPlain(h)).join(' | ');
      const sep = token.headers.map(() => '---').join(' | ');
      const rows = token.rows.map((r) => r.map((c) => inlineToPlain(c)).join(' | ')).join('\n');
      return `| ${headers} |\n| ${sep} |\n${rows}`;
    }
    case 'admonition': {
      const title = token.title ? ` ${token.title}` : '';
      const body = token.content.map((t) => tokenToSource(t)).join('\n\n');
      return `> [!${token.kind}]${title}\n${body}`;
    }
    case 'footnote-def':
      return `[^${token.label}]: ${token.content.map((t) => tokenToSource(t)).join('\n\n')}`;
    case 'image':
      return `![${token.alt}](${token.url})`;
    case 'definition-list':
      return token.items
        .map((item) => {
          const term = inlineToPlain(item.term);
          const defs = item.descriptions.map((d) => `: ${inlineToPlain(d)}`).join('\n');
          return `${term}\n${defs}`;
        })
        .join('\n\n');
    case 'math-block':
      return `$$\n${token.content}\n$$`;
    case 'details':
      return `<details>\n<summary>${inlineToPlain(token.summary)}</summary>\n${token.content.map((t) => tokenToSource(t)).join('\n\n')}\n</details>`;
    case 'frontmatter':
      return '';
    case 'wiki-link-block':
      return `[[${token.target}${token.alias ? `|${token.alias}` : ''}]]`;
    case 'live-exec':
      return '```' + token.language + '\n' + token.source + '\n```';
  }
}

function inlineToPlain(tokens: InlineToken[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'text':
          return t.content;
        case 'bold':
        case 'italic':
        case 'strikethrough':
        case 'mark':
        case 'sup':
        case 'sub':
          return inlineToPlain(t.content);
        case 'code':
          return t.content;
        case 'link':
          return t.text;
        case 'footnote-ref':
          return `[^${t.label}]`;
        case 'emoji':
          return t.unicode;
        case 'math-inline':
          return t.content;
        case 'wiki-link':
          return t.alias ?? t.target;
        case 'image-inline':
          return t.alt;
        case 'hard-break':
          return '\n';
      }
    })
    .join('');
}
