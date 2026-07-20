import type { AtlasCapabilities, AtlasImageProtocol, AtlasSurface } from './types.js';

export function resolveSurfaceCapabilities(base: AtlasCapabilities, surface: AtlasSurface): AtlasCapabilities {
  switch (surface) {
    case 'portal':
      return {
        ...base,
        surface,
        colorLevel: 'truecolor',
        kittyKeyboard: false,
        bracketedPaste: false,
        focusEvents: false,
        mouseTracking: false,
        kittyGraphics: false,
        iterm2Images: false,
        iterm2ImagesMultipart: false,
        sixelGraphics: false,
        syncOutput: false,
        hyperlinks: true,
        unicodeLevel: 'full',
        performanceClass: 'standard',
        styledUnderlines: true,
        overline: true,
        cursorShapes: false,
      };
    case 'lens':
      return {
        ...base,
        surface,
        bracketedPaste: true,
        focusEvents: true,
        mouseTracking: true,
        hyperlinks: true,
      };
    case 'test':
      return {
        ...base,
        surface,
        colorLevel: base.colorLevel === 'none' ? 'truecolor' : base.colorLevel,
        kittyKeyboard: false,
        bracketedPaste: true,
        focusEvents: true,
        mouseTracking: true,
        hyperlinks: true,
        performanceClass: 'low',
      };
    case 'warp':
      return {
        ...base,
        surface,
        performanceClass: base.performanceClass === 'low' ? 'standard' : base.performanceClass,
      };
    case 'terminal':
    default:
      return {
        ...base,
        surface,
      };
  }
}

export function getPreferredImageProtocol(
  capabilities: Pick<AtlasCapabilities, 'kittyGraphics' | 'iterm2Images' | 'sixelGraphics' | 'colorLevel'> & Partial<Pick<AtlasCapabilities, 'unicodeLevel'>>,
): AtlasImageProtocol {
  if (capabilities.kittyGraphics) return 'kitty';
  if (capabilities.iterm2Images) return 'iterm2';
  if (capabilities.sixelGraphics) return 'sixel';
  // Sub-cell Unicode mosaics:
  //   Octant (2×4 with colour, Unicode 16+) > Sextant (2×3, Unicode 13+) >
  //   Half-block (1×2, universal) > Braille (mono fallback).
  // If the caller did not supply unicodeLevel, assume 'basic' — preserves
  // back-compat with the pre-sextant signature (sextant/octant never picked).
  if (capabilities.colorLevel === 'truecolor' && capabilities.unicodeLevel === 'unicode16') return 'octant';
  if (capabilities.colorLevel === 'truecolor' && capabilities.unicodeLevel === 'full') return 'sextant';
  if (capabilities.colorLevel === 'truecolor') return 'blocks';
  return 'braille';
}

export function shouldAnimate(capabilities: Pick<AtlasCapabilities, 'reducedMotion' | 'performanceClass'>): boolean {
  return !capabilities.reducedMotion && capabilities.performanceClass !== 'low';
}

/**
 * Convenience: `true` when the terminal is known to render the
 * Unicode 16 octant block (U+1CD00–U+1CDEF). Use to gate code paths
 * that prefer octant subcell graphics over sextant.
 *
 * Equivalent to `caps.unicodeLevel === 'unicode16'`; provided as a
 * named helper so callers don't have to know the literal level
 * string when they grow octant-aware features.
 */
export function hasUnicodeOctants(capabilities: Pick<AtlasCapabilities, 'unicodeLevel'>): boolean {
  return capabilities.unicodeLevel === 'unicode16';
}

/**
 * Convenience: `true` when the terminal is known to render the
 * Unicode 13 sextant block (U+1FB00–U+1FB3B) — the primary fallback
 * when `hasUnicodeOctants` is false.
 */
export function hasUnicodeSextants(capabilities: Pick<AtlasCapabilities, 'unicodeLevel'>): boolean {
  return capabilities.unicodeLevel === 'full' || capabilities.unicodeLevel === 'unicode16';
}

// ─────────────────────────────────────────────────────────────────────────────
// canEmit — capability-gated escape-emission helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names of protocol-specific escape sequences a TUI might write to the
 * terminal. Each maps to a capability in {@link AtlasCapabilities}; pass
 * one of these values to {@link canEmit} to check whether the current
 * terminal will actually parse the escape (vs. printing the bytes as
 * garbled text or silently consuming them).
 */
export type EmitProtocol =
  | 'kitty-graphics' // Kitty graphics APC \x1b_G…\x1b\\
  | 'iterm2-images' // iTerm2 OSC 1337 ; File = …
  | 'sixel' // DEC Sixel DCS \x1bP…q…\x1b\\
  | 'hyperlinks' // OSC 8 ; params ; URL ST text ST
  | 'sync-output' // DECSET 2026 (begin/end synchronized output)
  | 'kitty-keyboard' // Kitty Keyboard Protocol CSI > 1 u
  | 'bracketed-paste' // DECSET 2004
  | 'focus-events' // DECSET 1004
  | 'mouse-tracking' // SGR mouse / X10 mouse tracking
  | 'styled-underlines' // CSI 4 : N m (styled underline variants)
  | 'undercurl' // CSI 4 : 3 m (curly underline; subset of styled-underlines)
  | 'overline' // CSI 53 m
  | 'cursor-shapes'; // DECSCUSR

/**
 * Capability-gated escape emission check.
 *
 * Returns whether the current terminal (per `caps`) is known to parse the
 * named protocol's escape sequences. Emitting an escape this returns
 * `false` for risks leaking raw bytes as visible garbage on terminals
 * that don't recognise the sequence.
 *
 * The mapping is a single-entry lookup against `AtlasCapabilities`; no
 * heuristics, no probing — pass detected or pinned capabilities in.
 *
 * @example
 * ```ts
 * import { detectCapabilities, canEmit } from '@celestial/atlas';
 * const caps = detectCapabilities();
 * if (canEmit(caps, 'kitty-graphics')) {
 *   process.stdout.write(kittyEscape);
 * } else {
 *   process.stdout.write(fallbackRender);
 * }
 * ```
 */
export function canEmit(caps: AtlasCapabilities, protocol: EmitProtocol): boolean {
  switch (protocol) {
    case 'kitty-graphics':
      return caps.kittyGraphics;
    case 'iterm2-images':
      return caps.iterm2Images;
    case 'sixel':
      return caps.sixelGraphics;
    case 'hyperlinks':
      return caps.hyperlinks;
    case 'sync-output':
      return caps.syncOutput;
    case 'kitty-keyboard':
      return caps.kittyKeyboard;
    case 'bracketed-paste':
      return caps.bracketedPaste;
    case 'focus-events':
      return caps.focusEvents;
    case 'mouse-tracking':
      return caps.mouseTracking;
    case 'styled-underlines':
      return caps.styledUnderlines;
    case 'undercurl':
      // Curly underline is a sub-feature of styled-underlines.
      return caps.undercurl;
    case 'overline':
      return caps.overline;
    case 'cursor-shapes':
      return caps.cursorShapes;
  }
}
