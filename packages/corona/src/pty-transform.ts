/**
 * Corona — PTY Color Transform
 *
 * Reusable color-transform primitives for PTY output. These transforms remap
 * hex colors emitted by terminal emulators (e.g., PtyScreenBuffer in lens)
 * to match a theme's visual intent.
 *
 * Three built-in variants:
 *  - **sepia**: warm paper tones (70% sepia matrix + 30% original)
 *  - **mono**: desaturated (85% luminance + 15% original)
 *  - **light**: inverted-luminance for readable text on light backgrounds
 *
 * Plus:
 *  - **identity**: no-op (returns undefined, signaling "no transform")
 *  - **custom**: bring-your-own function
 *
 * The ANSI 16 remapper (`createAnsi16Remap`) lets themes override the
 * standard terminal palette without touching the transform pipeline.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A function that transforms a hex color string (e.g. "#ff8040") into
 * another hex color string. Used by PTY rendering to remap terminal
 * output colors to match the current theme.
 */
export type PtyColorTransform = (hex: string) => string;

/** Built-in transform variant names, plus 'custom' for user-supplied functions. */
export type PtyTransformVariant = 'identity' | 'sepia' | 'mono' | 'light' | 'custom';

/**
 * Configuration for a PTY theme's color pipeline.
 *
 * - `variant` selects one of the built-in transforms (or 'custom')
 * - `ansi16` optionally overrides the standard 16-color ANSI palette
 * - `colorTransform` is required when variant is 'custom'
 */
export interface PtyThemeConfig {
  /** Which transform variant to apply to PTY output colors. */
  variant: PtyTransformVariant;
  /**
   * Optional 16-color palette override. When provided, the standard ANSI 16
   * colors (black, red, green, yellow, blue, magenta, cyan, white + bright
   * variants) are remapped to these hex values before the transform runs.
   */
  ansi16?: readonly string[];
  /**
   * Custom transform function. Required when `variant` is 'custom'.
   */
  colorTransform?: PtyColorTransform;
}

// ─── Low-level Color Utilities ──────────────────────────────────────────────

/**
 * Parse a hex color string to [r, g, b] tuple.
 * Supports 3-digit (#f80) and 6-digit (#ff8040) forms, with or without #.
 * Returns [0, 0, 0] for invalid input.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    return [0, 0, 0];
  }
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Convert [r, g, b] to a lowercase 6-digit hex string with #.
 * Values are clamped to 0-255 and rounded.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

// ─── Transform Functions ────────────────────────────────────────────────────

/**
 * Sepia transform: applies the classic sepia color matrix at 70% intensity,
 * blended with 30% of the original color. Produces warm paper tones.
 */
export function sepiaTransform(r: number, g: number, b: number): [number, number, number] {
  const tr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
  const tg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
  const tb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
  return [Math.round(r * 0.3 + tr * 0.7), Math.round(g * 0.3 + tg * 0.7), Math.round(b * 0.3 + tb * 0.7)];
}

/**
 * Mono transform: desaturates by blending 85% BT.601 luminance with 15%
 * of the original channel. Retains a subtle color hint.
 */
export function monoTransform(r: number, g: number, b: number): [number, number, number] {
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  return [Math.round(lum * 0.85 + r * 0.15), Math.round(lum * 0.85 + g * 0.15), Math.round(lum * 0.85 + b * 0.15)];
}

/**
 * Light-theme transform: inverts luminance so dark terminal colors become
 * legible on a light background, then desaturates slightly for a softer look.
 *
 * Three luminance bands:
 * - Near-black (lum < 30): scale to 25% — keeps dark for text on light bg
 * - Near-white (lum > 220): scale to 30% + offset — darkens to readable text
 * - Mid-range: desaturate 30%, compress to 60% brightness, cap at 200
 */
export function lightTransform(r: number, g: number, b: number): [number, number, number] {
  const lum = r * 0.299 + g * 0.587 + b * 0.114;

  if (lum < 30) {
    // Near-black → keep dark for text
    return [Math.round(r * 0.25), Math.round(g * 0.25), Math.round(b * 0.25)];
  }
  if (lum > 220) {
    // Near-white → darken to readable text
    return [Math.round(r * 0.3 + 20), Math.round(g * 0.3 + 20), Math.round(b * 0.3 + 20)];
  }

  // Mid-range: compress into the 25-70% luminance band, desaturate 30%
  const avg = (r + g + b) / 3;
  const dr = r + (avg - r) * 0.3; // desaturate
  const dg = g + (avg - g) * 0.3;
  const db = b + (avg - b) * 0.3;

  // Darken by 40% to ensure readability on light bg
  const factor = 0.6;
  return [Math.round(Math.min(200, dr * factor)), Math.round(Math.min(200, dg * factor)), Math.round(Math.min(200, db * factor))];
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a `PtyColorTransform` for the given variant.
 *
 * - `'identity'` → returns `undefined` (no transform needed)
 * - `'sepia'` → sepia tone pipeline
 * - `'mono'` → desaturation pipeline
 * - `'light'` → luminance inversion pipeline
 * - `'custom'` → wraps the provided `customFn` (throws if missing)
 */
export function createPtyTransform(variant: PtyTransformVariant, customFn?: PtyColorTransform): PtyColorTransform | undefined {
  switch (variant) {
    case 'identity':
      return undefined;

    case 'sepia':
      return (hex: string) => {
        const [r, g, b] = hexToRgb(hex);
        const [sr, sg, sb] = sepiaTransform(r, g, b);
        return rgbToHex(sr, sg, sb);
      };

    case 'mono':
      return (hex: string) => {
        const [r, g, b] = hexToRgb(hex);
        const [mr, mg, mb] = monoTransform(r, g, b);
        return rgbToHex(mr, mg, mb);
      };

    case 'light':
      return (hex: string) => {
        const [r, g, b] = hexToRgb(hex);
        const [lr, lg, lb] = lightTransform(r, g, b);
        return rgbToHex(lr, lg, lb);
      };

    case 'custom':
      if (!customFn) {
        throw new Error('createPtyTransform("custom") requires a customFn argument');
      }
      return customFn;
  }
}

// ─── ANSI 16 Palette Remap ─────────────────────────────────────────────────

/**
 * Standard ANSI 16 colors in hex (same order as xterm defaults):
 *   0: black,  1: red,     2: green,   3: yellow,
 *   4: blue,   5: magenta, 6: cyan,    7: white,
 *   8: bright black (gray), 9: bright red, 10: bright green, 11: bright yellow,
 *  12: bright blue, 13: bright magenta, 14: bright cyan, 15: bright white
 */
const STANDARD_ANSI_16: readonly string[] = [
  '#000000',
  '#800000',
  '#008000',
  '#808000',
  '#000080',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#808080',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
];

/**
 * Create a function that remaps standard ANSI 16 colors to a custom palette.
 *
 * The returned function checks if an input hex matches any of the 16 standard
 * ANSI colors. If it does, the corresponding palette entry is returned.
 * Non-matching colors pass through unchanged.
 *
 * @param palette - Exactly 16 hex color strings in ANSI order
 * @throws If palette does not contain exactly 16 entries
 */
export function createAnsi16Remap(palette: readonly string[]): PtyColorTransform {
  if (palette.length !== 16) {
    throw new Error(`createAnsi16Remap requires exactly 16 colors, got ${palette.length}`);
  }

  // Build a lookup map: normalized standard hex → palette hex
  const map = new Map<string, string>();
  for (let i = 0; i < 16; i++) {
    map.set(STANDARD_ANSI_16[i]!, palette[i]!);
  }

  return (hex: string): string => {
    // Normalize to lowercase 6-digit hex
    const [r, g, b] = hexToRgb(hex);
    const normalized = rgbToHex(r, g, b);
    return map.get(normalized) ?? hex;
  };
}

/**
 * Compose a full PTY theme color pipeline from a `PtyThemeConfig`.
 *
 * ANSI-16 remapping runs first so standard terminal palette colors become
 * theme palette colors before variant-specific transforms such as `light` or
 * `mono` are applied. Returns `undefined` for the identity/no-palette case.
 */
export function createPtyThemeTransform(config: PtyThemeConfig): PtyColorTransform | undefined {
  const variantTransform = createPtyTransform(config.variant, config.colorTransform);
  const ansiRemap = config.ansi16 ? createAnsi16Remap(config.ansi16) : undefined;

  if (!variantTransform && !ansiRemap) {
    return undefined;
  }

  if (!variantTransform) {
    return ansiRemap;
  }

  if (!ansiRemap) {
    return variantTransform;
  }

  return (hex: string): string => variantTransform(ansiRemap(hex));
}
