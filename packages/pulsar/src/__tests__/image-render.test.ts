/**
 * Image render tests (A1)
 */

import { describe, expect, it } from 'vitest';
import { bestImageProtocol, renderImage, renderImageAsync } from '../image-render.js';
import { defaultTheme } from '../theme.js';
import { visualWidth } from '../renderer/width.js';

function ctx(overrides?: Partial<Parameters<typeof renderImage>[1]>) {
  return {
    theme: defaultTheme(),
    options: {},
    width: 80,
    ...overrides,
  };
}

describe('renderImage', () => {
  it('returns placeholder when imageDisplay is omitted', () => {
    const out = renderImage({ alt: 'cat', url: 'cat.png' }, ctx());
    expect(out).toContain('cat');
    expect(out).toContain('cat.png');
  });

  it('returns placeholder when imageDisplay is placeholder', () => {
    const out = renderImage({ alt: 'cat', url: 'cat.png' }, ctx({ options: { imageDisplay: 'placeholder' } }));
    expect(out).toContain('cat');
  });

  it('returns placeholder when capabilities.imageProtocol is none', () => {
    const out = renderImage(
      { alt: 'cat', url: 'cat.png' },
      ctx({
        options: {
          imageDisplay: 'auto',
          capabilities: {
            imageProtocol: 'none',
            hyperlinks: false,
            trueColor: false,
            reducedMotion: false,
            screenReader: false,
          },
        },
      }),
    );
    expect(out).toContain('cat');
  });

  it('returns placeholder when no buffer is provided', () => {
    const out = renderImage(
      { alt: 'cat', url: 'cat.png' },
      ctx({
        options: {
          imageDisplay: 'auto',
          capabilities: {
            imageProtocol: 'kitty',
            hyperlinks: false,
            trueColor: true,
            reducedMotion: false,
            screenReader: false,
          },
        },
      }),
    );
    expect(out).toContain('cat');
  });

  it('wraps long placeholder words to the available cell width', () => {
    const out = renderImage({ alt: 'averyveryverylongdescription', url: 'https://example.test/averyveryverylongpath' }, ctx({ width: 12 }));
    expect(out.split('\n').every((line) => visualWidth(line) <= 12)).toBe(true);
  });
});

describe('renderImageAsync', () => {
  it('keeps binary data on the safe placeholder path in the public preview', async () => {
    const out = await renderImageAsync(
      { alt: 'cat', url: 'cat.png' },
      ctx({
        options: {
          imageDisplay: 'auto',
          capabilities: {
            imageProtocol: 'kitty',
            hyperlinks: false,
            trueColor: true,
            reducedMotion: false,
            screenReader: false,
          },
        },
      }),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // fake PNG header
    );
    expect(out).toContain('cat');
  });
});

describe('bestImageProtocol', () => {
  it('returns the best protocol from capabilities', () => {
    expect(
      bestImageProtocol({
        imageProtocol: 'sixel',
        hyperlinks: false,
        trueColor: true,
        reducedMotion: false,
        screenReader: false,
      }),
    ).toBe('sixel');
  });

  it('returns none as fallback', () => {
    expect(
      bestImageProtocol({
        imageProtocol: 'none',
        hyperlinks: false,
        trueColor: false,
        reducedMotion: false,
        screenReader: false,
      }),
    ).toBe('none');
  });
});
