/**
 * CSS export — emit a corona theme as CSS custom property declarations.
 *
 * Pure function. No DOM dependency. Returns a string the caller can inject via
 * a `<style>` tag, append to a stylesheet, write to a file, etc.
 *
 * Property-name scheme: dotted theme paths are joined with `-` after the
 * prefix. So `colors.tones.accent` -> `--celestial-color-tones-accent`. This
 * keeps every theme token unambiguously addressable. Output is alphabetically
 * sorted by property name for determinism.
 */

import { colorToHex, isColorLike } from './color.js';
import { type DomainTokenContract, resolveDomainTokens } from './domain-tokens.js';
import type { SemanticTheme } from './theme.js';

export interface CssVarOptions {
  /** Variable prefix. Default `--celestial`. */
  prefix?: string;
  /** Domain token contracts to also emit, prefixed by their `name`. */
  domains?: ReadonlyArray<{ name: string; contract: DomainTokenContract<unknown> }>;
  /** When true, emits one declaration per line with 2-space indent. Default false. */
  pretty?: boolean;
  /** `'declarations'` (default) or `'rule'` (wraps output in `:root { ... }`). */
  format?: 'declarations' | 'rule';
}

/**
 * Recursively walk the theme's `colors` tree and emit `prefix-color-<path>: <hex>`
 * declarations. Non-Color leaves (numbers, strings, etc.) are skipped. Object
 * branches recurse with their key appended to the path.
 */
function walkColors(node: unknown, path: string[], prefix: string, out: Map<string, string>): void {
  if (isColorLike(node)) {
    const name = `${prefix}-color-${path.join('-')}`;
    out.set(name, colorToHex(node));
    return;
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkColors(value, [...path, kebab(key)], prefix, out);
    }
  }
}

/** camelCase -> kebab-case (best effort; ASCII only). */
function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Emit a corona theme as CSS custom property declarations.
 *
 * @example
 *   themeToCssVars(defaultTheme)
 *   // "--celestial-color-text: #dbe4ff; --celestial-color-bg: #0a0f14; ..."
 *
 *   themeToCssVars(defaultTheme, { format: 'rule', pretty: true })
 *   // ":root {\n  --celestial-color-text: #dbe4ff;\n  ...\n}"
 *
 *   themeToCssVars(theme, {
 *     domains: [{ name: 'phase', contract: phaseTokens }],
 *   })
 *   // "...; --celestial-phase-idle: #6b7280; ..."
 */
export function themeToCssVars(theme: SemanticTheme, opts: CssVarOptions = {}): string {
  const prefix = opts.prefix ?? '--celestial';
  const pretty = opts.pretty ?? false;
  const format = opts.format ?? 'declarations';

  const decls = new Map<string, string>();

  // Walk the theme's colors tree.
  walkColors(theme.colors, [], prefix, decls);

  // Emit domain tokens as `prefix-<name>-<key>: <hex>` for any Color values.
  if (opts.domains) {
    for (const domain of opts.domains) {
      const resolved = resolveDomainTokens(domain.contract, theme) as Record<string, unknown>;
      for (const [key, value] of Object.entries(resolved)) {
        if (isColorLike(value)) {
          decls.set(`${prefix}-${kebab(domain.name)}-${kebab(key)}`, colorToHex(value));
        }
      }
    }
  }

  // Sort alphabetically for deterministic output.
  const sortedKeys = [...decls.keys()].sort();
  const sep = pretty ? '\n' : ' ';
  const indent = pretty && format === 'rule' ? '  ' : '';
  const body = sortedKeys.map((k) => `${indent}${k}: ${decls.get(k)};`).join(sep);

  if (format === 'rule') {
    return pretty ? `:root {\n${body}\n}` : `:root { ${body} }`;
  }
  return body;
}
