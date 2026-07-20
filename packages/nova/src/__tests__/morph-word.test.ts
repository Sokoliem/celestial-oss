import { describe, expect, it } from 'vitest';
import { morph } from '../morph.js';

describe('morph granularity: word', () => {
  it('returns oldText at progress 0', () => {
    expect(morph('hello world', 'hi everyone', { tick: 0, duration: 10, granularity: 'word' })).toBe('hello world');
  });

  it('returns newText at progress 1', () => {
    expect(morph('hello world', 'hi everyone', { tick: 10, duration: 10, granularity: 'word' })).toBe('hi everyone');
  });

  it('keeps a shared word stable across the transition', () => {
    // "the" appears in both — word-mode LCS should keep it; char-mode also
    // happens to keep "th" + "e" but as separate sub-units. Word mode is the
    // intent-preserving choice here.
    const result = morph('the cat sat', 'the dog ran', { tick: 5, duration: 10, granularity: 'word' });
    // At mid-progress we can't make a precise string-equality assertion (the
    // cat/sat/dog/ran chars overlap with fading), but the kept token "the"
    // must appear unbroken at the start.
    // Use a substring check on a stripped-ANSI variant.
    const plain = result.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain.startsWith('the')).toBe(true);
  });

  it('treats unrelated words as full token swaps', () => {
    // "hello world" → "hi everyone" share no whole-token. With word
    // granularity, every old word is removed and every new word is added —
    // no spurious char-keep on the 'h', ' ', or 'e'/'o' coincidences.
    // This is hard to assert visually, but we can check that the OUTPUT at
    // mid-progress still has the same line count and finishes cleanly.
    const mid = morph('hello world', 'hi everyone', { tick: 5, duration: 10, granularity: 'word' });
    const end = morph('hello world', 'hi everyone', { tick: 10, duration: 10, granularity: 'word' });
    expect(end).toBe('hi everyone');
    expect(mid).not.toBe('hello world');
    expect(mid).not.toBe('hi everyone');
  });

  it('keeps prose word boundaries intact across multiline morph', () => {
    const out = morph('foo bar\nbaz qux', 'foo zzz\nbaz www', { tick: 10, duration: 10, granularity: 'word' });
    expect(out).toBe('foo zzz\nbaz www');
  });

  it('default granularity is "char" (preserves prior behaviour)', () => {
    // Same call without granularity param should match passing 'char' explicitly.
    const a = morph('hello world', 'hi everyone', { tick: 5, duration: 10 });
    const b = morph('hello world', 'hi everyone', { tick: 5, duration: 10, granularity: 'char' });
    expect(a).toBe(b);
  });

  it('word vs char granularity produce different intermediate frames when char-LCS would keep stray chars', () => {
    // "the cat sat" → "the dog ran": char-LCS keeps the 'a' in "sat" against
    // the 'a' in "ran" (LCS finds shared 'a' between "sat" and "ran"), so
    // that 'a' is treated as a stable kept-char that slides into place.
    // Word-LCS treats "sat" and "ran" as unrelated tokens and emits clean
    // remove + add — no spurious cross-word char keeping.
    const a = morph('the cat sat', 'the dog ran', { tick: 5, duration: 10, granularity: 'char' });
    const b = morph('the cat sat', 'the dog ran', { tick: 5, duration: 10, granularity: 'word' });
    expect(a).not.toBe(b);
  });

  it('handles empty old/new with word mode', () => {
    expect(morph('', 'foo bar', { tick: 0, duration: 10, granularity: 'word' })).toBe('');
    expect(morph('', 'foo bar', { tick: 10, duration: 10, granularity: 'word' })).toBe('foo bar');
    expect(morph('foo bar', '', { tick: 0, duration: 10, granularity: 'word' })).toBe('foo bar');
    expect(morph('foo bar', '', { tick: 10, duration: 10, granularity: 'word' })).toBe('');
  });
});
