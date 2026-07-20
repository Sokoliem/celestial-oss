import { defineDomainTokens, resolveFamilyGlyph } from '@celestial/corona';

export const markdownGlyphTokens = defineDomainTokens({
  name: 'pulsar-markdown',
  values: [
    'note',
    'tip',
    'important',
    'warning',
    'caution',
    'ai-thinking',
    'tool-call',
    'citation',
    'image',
    'active-rail',
    'admonition-rail',
    'code-top-left',
    'code-bottom-left',
    'rule',
  ] as const,
  glyphs: {
    note: { level1: 'i', level2: 'ℹ', level3: 'ℹ' },
    tip: { level1: '*', level2: '💡', level3: '💡' },
    important: { level1: '!', level2: '❗', level3: '❗' },
    warning: { level1: '!', level2: '⚠', level3: '⚠' },
    caution: { level1: '!', level2: '🔥', level3: '🔥' },
    'ai-thinking': { level1: '*', level2: '◈', level3: '◈' },
    'tool-call': { level1: '#', level2: '⚙', level3: '⚙' },
    citation: { level1: '*', level2: '◆', level3: '◆' },
    image: { level1: '[img]', level2: '🖼', level3: '🖼' },
    'active-rail': { level1: '|', level2: '▎', level3: '▎' },
    'admonition-rail': { level1: '|', level2: '▌', level3: '▌' },
    'code-top-left': { level1: '+', level2: '┌', level3: '┌' },
    'code-bottom-left': { level1: '+', level2: '└', level3: '└' },
    rule: { level1: '-', level2: '─', level3: '─' },
  },
});

export type MarkdownGlyphName = (typeof markdownGlyphTokens.values)[number];

/** Resolve Pulsar's semantic glyph vocabulary with an explicit fallback level. */
export function markdownGlyph(name: MarkdownGlyphName, level: 1 | 2 | 3 = 2): string {
  return resolveFamilyGlyph(markdownGlyphTokens, name, level);
}
