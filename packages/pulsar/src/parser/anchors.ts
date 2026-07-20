/**
 * Heading slug generation and post-parse anchor assignment.
 *
 * Slug rules follow the GitHub-flavored convention used by gh-slugger:
 *   - lowercase
 *   - strip combining marks (NFKD-normalise then drop U+0300–U+036F)
 *   - drop punctuation (everything outside `[a-z0-9 -]`)
 *   - collapse whitespace runs to a single `-`
 *   - empty → `section`
 *   - collisions get `-2`, `-3`, … appended
 *
 * The {@link Slugger} class is stateful; reuse one per document so
 * disambiguation across multiple headings is consistent.
 */

import type { InlineToken, Token } from '../types.js';

export function slugify(input: string): string {
  const normalised = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return normalised || 'section';
}

export class Slugger {
  private counts = new Map<string, number>();

  next(text: string): string {
    const base = slugify(text);
    const used = this.counts.get(base) ?? 0;
    this.counts.set(base, used + 1);
    return used === 0 ? base : `${base}-${used + 1}`;
  }

  reset(): void {
    this.counts.clear();
  }
}

/**
 * Render an inline-token list to plain text for slug derivation. Strips
 * formatting, keeps link text and emoji codepoints, drops footnote refs
 * (they would dirty the slug with bracket digits) and collapses
 * hard-breaks to a single space.
 */
export function inlineToPlainText(tokens: InlineToken[]): string {
  let out = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        out += token.content;
        break;
      case 'bold':
      case 'italic':
      case 'strikethrough':
      case 'mark':
      case 'sup':
      case 'sub':
        out += inlineToPlainText(token.content);
        break;
      case 'code':
        out += token.content;
        break;
      case 'link':
        out += token.text;
        break;
      case 'footnote-ref':
        // Skip — footnote-ref labels would pollute slugs.
        break;
      case 'emoji':
        out += token.unicode;
        break;
      case 'math-inline':
        out += token.content;
        break;
      case 'hard-break':
        out += ' ';
        break;
    }
  }
  return out;
}

/**
 * Walk a token tree and assign `id` slugs to every heading. Recurses
 * into blockquote, list children, admonition and footnote-def bodies so
 * headings inside those constructs also get anchors.
 */
export function assignHeadingAnchors(tokens: Token[], slugger: Slugger = new Slugger()): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const plain = inlineToPlainText(token.content);
        token.id = slugger.next(plain);
        break;
      }
      case 'blockquote':
      case 'admonition':
      case 'footnote-def':
      case 'details':
        assignHeadingAnchors(token.content, slugger);
        break;
      case 'list':
        for (const item of token.items) {
          if (item.children) assignHeadingAnchors(item.children, slugger);
        }
        break;
      default:
        break;
    }
  }
}
