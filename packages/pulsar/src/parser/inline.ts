/**
 * Pulsar Inline Parser
 *
 * Parses inline markdown constructs (bold, italic, code, links, footnote
 * refs, emoji shortcodes, strikethrough, hard-breaks). Reference-link
 * resolution is supplied by the block dispatcher via an optional refs map.
 */

import type { InlineToken } from '../types.js';
import { sanitizeTerminalText } from '../internal/sanitize.js';
import { DEFAULT_EMOJI_MAP } from './emoji-data.js';
import type { LinkRef } from './refs.js';

// ── Emoji Shortcode Registry ────────────────────────────────────────────

/**
 * Mutable registry of user-registered emoji shortcodes. The inline parser
 * consults this map first, then falls back to {@link DEFAULT_EMOJI_MAP} for
 * the comprehensive default set. Re-registering a name overrides the default.
 */
const EMOJI_MAP = new Map<string, string>();

/**
 * Register a custom emoji shortcode. Names should match `[A-Za-z0-9_+-]+`
 * (the inline parser's shortcode regex); other names will simply never match.
 * Re-registering a name overwrites the previous mapping.
 */
export function registerEmoji(name: string, unicode: string): void {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_+-]{1,128}$/.test(name)) {
    throw new TypeError('Emoji shortcode names must match [A-Za-z0-9_+-]{1,128}');
  }
  if (typeof unicode !== 'string' || unicode.length === 0 || unicode.length > 256) {
    throw new TypeError('Emoji shortcode values must contain 1 to 256 characters');
  }
  EMOJI_MAP.set(name, sanitizeTerminalText(unicode));
}

/**
 * Look up the unicode character(s) registered for an emoji shortcode, or
 * `undefined` if the name is not registered. User-registered overrides take
 * precedence over the default GitHub-flavored set.
 */
export function getEmoji(name: string): string | undefined {
  if (typeof name !== 'string') return undefined;
  return EMOJI_MAP.get(name) ?? DEFAULT_EMOJI_MAP[name];
}

// ── Inline Parser ───────────────────────────────────────────────────────

const MAX_INLINE_NESTING = 64;

/**
 * Parse inline markdown tokens from a string.
 *
 * Accepts an optional reference-link map (keyed by lowercased label). The
 * public signature is additive; existing single-argument callers are
 * unaffected.
 */
export function parseInline(input: string, refs?: Map<string, LinkRef>): InlineToken[] {
  return parseInlineInternal(sanitizeTerminalText(input), refs, 0);
}

function parseInlineInternal(input: string, refs: Map<string, LinkRef> | undefined, depth: number): InlineToken[] {
  if (input.length === 0) return [];
  if (depth >= MAX_INLINE_NESTING) return [{ type: 'text', content: input }];

  const tokens: InlineToken[] = [];
  let remaining = input;
  // Char immediately preceding `remaining` in the original input, used to
  // honor CommonMark's intra-word rule for `_` emphasis (no underscore
  // italic when the open `_` is preceded by a word character).
  let prevChar: string | undefined;

  const advance = (n: number): void => {
    if (n <= 0) return;
    prevChar = remaining[n - 1];
    remaining = remaining.slice(n);
  };

  const pushText = (content: string): void => {
    if (content.length === 0) return;
    const previous = tokens[tokens.length - 1];
    if (previous?.type === 'text') {
      previous.content += content;
    } else {
      tokens.push({ type: 'text', content });
    }
  };

  while (remaining.length > 0) {
    // Auto-link: <https://example.com> / <mailto:foo@bar>. Tried before the
    // generic plain-text consumption path so the angle brackets don't survive
    // as literal characters. Emits a `link` token with text === url so the
    // existing renderer (and OSC 8 hyperlink wrapping) handles it uniformly.
    const autoLinkMatch = remaining.match(/^<((?:https?|mailto):[^\s>]+)>/);
    if (autoLinkMatch) {
      const url = autoLinkMatch[1]!;
      tokens.push({ type: 'link', text: url, url });
      advance(autoLinkMatch[0].length);
      continue;
    }

    // Inline `<sup>` / `<sub>` HTML tags. Pulsar does not parse arbitrary
    // HTML, but these two are common in technical writing (formulae,
    // chemistry) so we lift them into typed tokens. Closing tag must match.
    const supMatch = remaining.match(/^<sup>([\s\S]+?)<\/sup>/);
    if (supMatch) {
      tokens.push({ type: 'sup', content: parseInlineInternal(supMatch[1]!, refs, depth + 1) });
      advance(supMatch[0].length);
      continue;
    }
    const subMatch = remaining.match(/^<sub>([\s\S]+?)<\/sub>/);
    if (subMatch) {
      tokens.push({ type: 'sub', content: parseInlineInternal(subMatch[1]!, refs, depth + 1) });
      advance(subMatch[0].length);
      continue;
    }
    // Strip `<span style="…">` / `<div align="…">` wrapper tags — TUI is
    // not the place for HTML/CSS pass-through, but dropping them lets the
    // inner content show through. We only match wrappers that carry
    // attributes; bare `<span>` / `<div>` is left as literal text so prose
    // like "Use <div> as a wrapper" round-trips unchanged.
    const wrapperOpenMatch = remaining.match(/^<(span|div)\s[^>]*>/i);
    if (wrapperOpenMatch) {
      advance(wrapperOpenMatch[0].length);
      continue;
    }
    // Closing wrappers are always swallowed (an attribute-bearing opener
    // somewhere upstream consumed our cue), but only when the immediate
    // context suggests structured HTML — i.e., we already saw an opener in
    // this run. Without a state machine to track that cleanly, we accept
    // the simple heuristic: match `</span>` / `</div>` unconditionally.
    // Bare `</span>` mid-prose without a matching open is rare enough in
    // practice that swallowing it is acceptable; the alternative (rendering
    // it as literal source) is worse.
    const wrapperCloseMatch = remaining.match(/^<\/(span|div)>/i);
    if (wrapperCloseMatch) {
      advance(wrapperCloseMatch[0].length);
      continue;
    }

    // Highlight / mark: ==text==
    const markMatch = remaining.match(/^==(.+?)==/);
    if (markMatch) {
      tokens.push({ type: 'mark', content: parseInlineInternal(markMatch[1]!, refs, depth + 1) });
      advance(markMatch[0].length);
      continue;
    }

    // Inline math: $expression$. Skip when followed by another `$` (block
    // math) — the block parser handles `$$ ... $$`. Also require a non-space
    // immediately after the opener to avoid matching prose like "she paid $5".
    if (remaining.startsWith('$') && !remaining.startsWith('$$')) {
      const mathMatch = remaining.match(/^\$([^\s$][^$]*?)\$(?!\$)/);
      if (mathMatch) {
        tokens.push({ type: 'math-inline', content: mathMatch[1]! });
        advance(mathMatch[0].length);
        continue;
      }
    }

    // Footnote reference: [^label]
    const footnoteRefMatch = remaining.match(/^\[\^([^\]]+)\]/);
    if (footnoteRefMatch) {
      tokens.push({
        type: 'footnote-ref',
        label: footnoteRefMatch[1]!,
      });
      advance(footnoteRefMatch[0].length);
      continue;
    }

    // Emoji shortcode: :name:
    const emojiMatch = remaining.match(/^:([a-zA-Z0-9_+-]+):/);
    if (emojiMatch) {
      const name = emojiMatch[1]!;
      const unicode = getEmoji(name);
      if (unicode) {
        tokens.push({
          type: 'emoji',
          name,
          unicode,
        });
        advance(emojiMatch[0].length);
        continue;
      }
      // Not a known emoji — fall through to text
    }

    // Inline image: ![alt](url)
    const inlineImageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)/);
    if (inlineImageMatch) {
      tokens.push({
        type: 'image-inline',
        alt: inlineImageMatch[1] || 'image',
        url: inlineImageMatch[2]!,
        title: inlineImageMatch[3],
      });
      advance(inlineImageMatch[0].length);
      continue;
    }

    // Wiki-link: [[Target]] or [[Target|alias]]
    const wikiLinkMatch = remaining.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (wikiLinkMatch) {
      tokens.push({
        type: 'wiki-link',
        target: wikiLinkMatch[1]!.trim(),
        alias: wikiLinkMatch[2]?.trim(),
      });
      advance(wikiLinkMatch[0].length);
      continue;
    }

    // Combined bold + italic: ***text*** or ___text___. Tried before plain
    // bold so the outer `***` doesn't get consumed as `**` + leftover `*`.
    // Emits bold-wrapping-italic so existing renderers/themes pick up both
    // styles without a new token type.
    const tripleMatch = remaining.match(/^(\*\*\*|___)(.+?)\1/);
    if (tripleMatch) {
      tokens.push({
        type: 'bold',
        content: [{ type: 'italic', content: parseInlineInternal(tripleMatch[2]!, refs, depth + 1) }],
      });
      advance(tripleMatch[0].length);
      continue;
    }

    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      tokens.push({
        type: 'bold',
        content: parseInlineInternal(boldMatch[2]!, refs, depth + 1),
      });
      advance(boldMatch[0].length);
      continue;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      tokens.push({
        type: 'strikethrough',
        content: parseInlineInternal(strikeMatch[1]!, refs, depth + 1),
      });
      advance(strikeMatch[0].length);
      continue;
    }

    // Italic with `*` keeps the permissive CommonMark rules.
    if (remaining.startsWith('*')) {
      const asteriskMatch = remaining.match(/^\*(.+?)\*/);
      if (asteriskMatch) {
        tokens.push({ type: 'italic', content: parseInlineInternal(asteriskMatch[1]!, refs, depth + 1) });
        advance(asteriskMatch[0].length);
        continue;
      }
    }

    // Italic with `_` is blocked intra-word: the opening `_` must not sit
    // inside a word (prevChar is not a word char) AND the closing `_` must
    // not be directly followed by a word char. Keeps `_snake_case_var_` from
    // fragmenting and leaves `foo_bar_baz` as plain text.
    if (remaining.startsWith('_')) {
      const prevIsWord = prevChar !== undefined && /\w/.test(prevChar);
      if (!prevIsWord) {
        const underscoreMatch = remaining.match(/^_([^_\n]+?)_(?!\w)/);
        if (underscoreMatch) {
          tokens.push({ type: 'italic', content: parseInlineInternal(underscoreMatch[1]!, refs, depth + 1) });
          advance(underscoreMatch[0].length);
          continue;
        }
      }
      // No safe italic span — fall through to plain text, consuming the `_`.
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push({
        type: 'code',
        content: codeMatch[1]!,
      });
      advance(codeMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      tokens.push({
        type: 'link',
        text: linkMatch[1]!,
        url: linkMatch[2]!,
      });
      advance(linkMatch[0].length);
      continue;
    }

    // Reference-style links. Try full `[text][ref]` first, then collapsed
    // `[text][]`, then the shortcut form `[ref]` (only if the label resolves).
    // On any miss, fall through to the plain-text path so unrelated `[...]`
    // stays literal.
    if (refs && refs.size > 0 && remaining.startsWith('[')) {
      const fullMatch = remaining.match(/^\[([^\]]+)\]\[([^\]]*)\]/);
      if (fullMatch) {
        const label = (fullMatch[2] || fullMatch[1]!).toLowerCase();
        const ref = refs.get(label);
        if (ref) {
          tokens.push({ type: 'link', text: fullMatch[1]!, url: ref.url });
          advance(fullMatch[0].length);
          continue;
        }
      }
      const shortcutMatch = remaining.match(/^\[([^\]]+)\]/);
      if (shortcutMatch) {
        const label = shortcutMatch[1]!.toLowerCase();
        const ref = refs.get(label);
        if (ref) {
          tokens.push({ type: 'link', text: shortcutMatch[1]!, url: ref.url });
          advance(shortcutMatch[0].length);
          continue;
        }
      }
    }

    // Plain text: consume characters until next potential inline token
    // Plain-text consumption stops at any character that *might* open a new
    // inline token in a future iteration. `<` is included so auto-links and
    // sup/sub HTML tags don't get swallowed mid-paragraph; `=` is included so
    // `==highlight==` is detected even after non-special prose; `$` is
    // included for inline math.
    const nextSpecial = remaining.slice(1).search(/[*_`~[!:<=$]/);
    if (nextSpecial === -1) {
      pushText(remaining);
      prevChar = remaining[remaining.length - 1];
      remaining = '';
      break;
    } else {
      const segment = remaining.slice(0, nextSpecial + 1);
      pushText(segment);
      advance(nextSpecial + 1);
    }
  }

  return tokens;
}
