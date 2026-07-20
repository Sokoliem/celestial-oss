/**
 * @celestial/rosetta — ICU MessageFormat subset for message formatting.
 *
 * Supports:
 * - Simple substitution: "Hello {name}" -> "Hello World"
 * - Plural:  "{count, plural, one {# item} other {# items}}"
 * - Select:  "{gender, select, male {He} female {She} other {They}}"
 * - Nested:  "{count, plural, one {# {type}} other {# {type}s}}"
 * - Escape:  "'{literal}'" — single quotes escape special syntax
 */

import type { MessageCatalog, MessageKey, MessagePluralForm } from './types.js';

// ── Plural category resolution ──────────────────────────────────────────

/**
 * Resolve a CLDR plural category for a given number.
 * Uses Intl.PluralRules when available, otherwise falls back to
 * a simple English-centric rule.
 */
function getPluralCategory(count: number, locale?: string): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' {
  try {
    const rules = new Intl.PluralRules(locale ?? 'en');
    return rules.select(count) as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
  } catch {
    // Fallback for environments without Intl.PluralRules
    if (count === 0) return 'zero';
    if (count === 1) return 'one';
    if (count === 2) return 'two';
    return 'other';
  }
}

// ── Parser ──────────────────────────────────────────────────────────────

interface Token {
  type: 'text' | 'open' | 'close' | 'comma' | 'hash';
  value: string;
}

function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let textBuf = '';
  let braceDepth = 0;

  const flush = () => {
    if (textBuf) {
      tokens.push({ type: 'text', value: textBuf });
      textBuf = '';
    }
  };

  while (i < template.length) {
    const ch = template[i]!;

    // Escape: single quotes
    if (ch === "'") {
      i++;
      if (i < template.length && template[i] === "'") {
        // Doubled single quote → literal single quote
        textBuf += "'";
        i++;
      } else {
        // Quoted literal: collect until closing single quote
        while (i < template.length && template[i] !== "'") {
          textBuf += template[i];
          i++;
        }
        if (i < template.length) i++; // skip closing quote
      }
      continue;
    }

    if (ch === '{') {
      flush();
      tokens.push({ type: 'open', value: '{' });
      braceDepth++;
      i++;
      continue;
    }

    if (ch === '}') {
      flush();
      tokens.push({ type: 'close', value: '}' });
      braceDepth = Math.max(0, braceDepth - 1);
      i++;
      continue;
    }

    // Comma and hash are only special inside braces (ICU format syntax)
    if (ch === ',' && braceDepth > 0) {
      flush();
      tokens.push({ type: 'comma', value: ',' });
      i++;
      continue;
    }

    if (ch === '#' && braceDepth > 0) {
      flush();
      tokens.push({ type: 'hash', value: '#' });
      i++;
      continue;
    }

    textBuf += ch;
    i++;
  }

  flush();
  return tokens;
}

// ── AST ─────────────────────────────────────────────────────────────────

type ASTNode =
  | { kind: 'text'; value: string }
  | { kind: 'arg'; name: string }
  | { kind: 'hash' }
  | { kind: 'plural'; name: string; options: Map<string, ASTNode[]> }
  | { kind: 'select'; name: string; options: Map<string, ASTNode[]> };

function parse(tokens: Token[]): ASTNode[] {
  let pos = 0;

  function parseNodes(stopAtClose: boolean): ASTNode[] {
    const nodes: ASTNode[] = [];

    while (pos < tokens.length) {
      const tok = tokens[pos]!;

      if (tok.type === 'close') {
        if (stopAtClose) break;
        pos++;
        continue;
      }

      if (tok.type === 'text') {
        nodes.push({ kind: 'text', value: tok.value });
        pos++;
        continue;
      }

      if (tok.type === 'hash') {
        nodes.push({ kind: 'hash' });
        pos++;
        continue;
      }

      if (tok.type === 'open') {
        pos++; // skip '{'
        // Collect argument name
        let name = '';
        while (pos < tokens.length && tokens[pos]!.type === 'text') {
          name += tokens[pos]!.value;
          pos++;
        }
        name = name.trim();

        // Check if this is a simple arg or plural/select
        if (pos < tokens.length && tokens[pos]!.type === 'comma') {
          pos++; // skip ','
          // Get the type: plural or select
          let typeStr = '';
          while (pos < tokens.length && tokens[pos]!.type === 'text') {
            typeStr += tokens[pos]!.value;
            pos++;
          }
          typeStr = typeStr.trim();

          if (pos < tokens.length && tokens[pos]!.type === 'comma') {
            pos++; // skip ','

            // Parse options
            const options = new Map<string, ASTNode[]>();
            while (pos < tokens.length && tokens[pos]!.type !== 'close') {
              // Skip whitespace text
              if (tokens[pos]!.type === 'text') {
                const trimmed = tokens[pos]!.value.trim();
                pos++;
                if (!trimmed) continue;

                // This should be the option key
                const key = trimmed;

                // Expect '{'
                if (pos < tokens.length && tokens[pos]!.type === 'open') {
                  pos++; // skip '{'
                  const optionNodes = parseNodes(true);
                  pos++; // skip '}'
                  options.set(key, optionNodes);
                }
              } else {
                pos++;
              }
            }

            if (typeStr === 'plural') {
              nodes.push({ kind: 'plural', name, options });
            } else {
              nodes.push({ kind: 'select', name, options });
            }
          }
        } else {
          // Simple argument
          nodes.push({ kind: 'arg', name });
        }

        // Skip closing '}'
        if (pos < tokens.length && tokens[pos]!.type === 'close') {
          pos++;
        }
        continue;
      }

      // Skip commas in this context
      pos++;
    }

    return nodes;
  }

  return parseNodes(false);
}

// ── Formatter ───────────────────────────────────────────────────────────

function formatNodes(nodes: ASTNode[], values: Record<string, unknown>, locale?: string, pluralValue?: number): string {
  let result = '';

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        result += node.value;
        break;

      case 'arg':
        result += String(values[node.name] ?? `{${node.name}}`);
        break;

      case 'hash':
        result += pluralValue !== undefined ? String(pluralValue) : '#';
        break;

      case 'plural': {
        const count = Number(values[node.name]);
        const category = getPluralCategory(count, locale);

        // Try exact match first (e.g., "=0", "=1")
        const exactKey = `=${count}`;
        const match = node.options.get(exactKey) ?? node.options.get(category) ?? node.options.get('other') ?? [];

        result += formatNodes(match, values, locale, count);
        break;
      }

      case 'select': {
        const selectVal = String(values[node.name]);
        const match = node.options.get(selectVal) ?? node.options.get('other') ?? [];

        result += formatNodes(match, values, locale);
        break;
      }
    }
  }

  return result;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Format a message template with the given values using an ICU
 * MessageFormat subset.
 *
 * @param template  - The ICU message template string
 * @param values    - Key-value pairs for substitution
 * @param locale    - Optional locale for plural rules (default: 'en')
 * @returns The formatted string
 */
export function formatMessage(template: string, values: Record<string, unknown>, locale?: string): string {
  const tokens = tokenize(template);
  const ast = parse(tokens);
  return formatNodes(ast, values, locale);
}

/**
 * Look up a message from a catalog and format it.
 *
 * @param catalog - The message catalog to look up from
 * @param key     - The message key
 * @param values  - Substitution values
 * @param locale  - Optional locale for plural rules
 * @returns The formatted string, or the key itself if not found
 */
export function translateMessage<TCatalog extends MessageCatalog>(
  catalog: TCatalog,
  key: MessageKey<TCatalog>,
  values?: Record<string, unknown>,
  locale?: string,
): string {
  const entry = catalog[key];
  if (entry === undefined) return key;

  if (typeof entry === 'string') {
    return values ? formatMessage(entry, values, locale) : entry;
  }

  // Plural form — requires a 'count' value
  const count = Number(values?.count ?? 0);
  const category = getPluralCategory(count, locale);
  const form = entry as MessagePluralForm;
  const template = form[category] ?? form.other;
  return values ? formatMessage(template, values, locale) : template;
}
