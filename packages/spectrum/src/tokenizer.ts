/**
 * Spectrum Tokenizer
 *
 * State-machine tokenizer with regex-based rules.
 * Supports multi-line constructs via persistent state between lines.
 */

import type { LanguageGrammar, StateRule, Token, TokenizerState, TokenRule } from './types.js';

// ── State Helpers ───────────────────────────────────────────────────────

/** Initial tokenizer state (root level, no active states) */
export function initialState(): TokenizerState {
  return { stack: [] };
}

// ── Rule Preparation ────────────────────────────────────────────────────

/**
 * Ensure a regex has the sticky flag set.
 * We need sticky (y) for efficient left-anchored matching at a specific position.
 */
function ensureSticky(re: RegExp): RegExp {
  if (re.sticky) return re;
  return new RegExp(re.source, re.flags + 'y');
}

/** Pre-process all rules in a grammar to ensure sticky flags */
function prepareGrammar(grammar: LanguageGrammar): LanguageGrammar {
  const rules = grammar.rules.map((r) => ({
    ...r,
    pattern: ensureSticky(r.pattern),
  }));

  const states = grammar.states?.map((s) => ({
    ...s,
    begin: ensureSticky(s.begin),
    end: ensureSticky(s.end),
    contentRules: s.contentRules?.map((r) => ({
      ...r,
      pattern: ensureSticky(r.pattern),
    })),
  }));

  return { ...grammar, rules, states };
}

// Prepared grammar cache — avoids re-processing sticky flags every call
const preparedCache = new WeakMap<LanguageGrammar, LanguageGrammar>();
const lineCache = new WeakMap<LanguageGrammar, Map<string, readonly [readonly Token[], TokenizerState]>>();

function getPrepared(grammar: LanguageGrammar): LanguageGrammar {
  let prepared = preparedCache.get(grammar);
  if (!prepared) {
    prepared = prepareGrammar(grammar);
    preparedCache.set(grammar, prepared);
  }
  return prepared;
}

function stateSignature(state: TokenizerState): string {
  return state.stack.join('\u001f');
}

function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// ── Core Tokenizer ──────────────────────────────────────────────────────

/**
 * Find the active state rule by name from the grammar's states array.
 */
function findState(grammar: LanguageGrammar, name: string): StateRule | undefined {
  return grammar.states?.find((s) => s.name === name);
}

/**
 * Try to match a token rule at position `pos` in `line`.
 * Returns the match or null.
 */
function tryRule(rule: TokenRule, line: string, pos: number): RegExpExecArray | null {
  rule.pattern.lastIndex = pos;
  return rule.pattern.exec(line);
}

/**
 * Tokenize a single line of source code.
 *
 * @param line - The source line (no trailing newline)
 * @param grammar - The language grammar
 * @param state - Current tokenizer state (for multi-line constructs)
 * @returns Tuple of [tokens, nextState]
 */
export function tokenizeLine(line: string, grammar: LanguageGrammar, state: TokenizerState): [Token[], TokenizerState] {
  const g = getPrepared(grammar);
  let grammarCache = lineCache.get(g);
  if (!grammarCache) {
    grammarCache = new Map();
    lineCache.set(g, grammarCache);
  }
  const cacheKey = `${stateSignature(state)}\u0000${line.length}\u0000${hashText(line)}`;
  const cached = grammarCache.get(cacheKey);
  if (cached) {
    return [cached[0] as Token[], cached[1]];
  }
  const tokens: Token[] = [];
  const stack = [...state.stack]; // mutable copy
  let pos = 0;

  while (pos < line.length) {
    const activeStateName = stack[stack.length - 1];
    let matched = false;

    // ── Inside a state ──────────────────────────────────────────────
    if (activeStateName) {
      const stateRule = findState(g, activeStateName);
      if (stateRule) {
        // Try end delimiter first
        stateRule.end.lastIndex = pos;
        const endMatch = stateRule.end.exec(line);
        if (endMatch) {
          tokens.push({ category: stateRule.token, text: endMatch[0] });
          pos += endMatch[0].length;
          stack.pop();
          matched = true;
          continue;
        }

        // Try content rules
        if (stateRule.contentRules) {
          for (const rule of stateRule.contentRules) {
            const m = tryRule(rule, line, pos);
            if (m) {
              const text = rule.group !== undefined ? (m[rule.group] ?? m[0]) : m[0];
              tokens.push({ category: rule.token, text });
              pos += m[0].length;
              if (rule.push) stack.push(rule.push);
              if (rule.pop) stack.pop();
              matched = true;
              break;
            }
          }
          if (matched) continue;
        }

        // No content rule matched — consume one char as contentToken
        tokens.push({
          category: stateRule.contentToken ?? stateRule.token,
          text: line[pos]!,
        });
        pos++;
        continue;
      }
    }

    // ── Root-level rules ────────────────────────────────────────────

    // Check if any state begin matches (before root rules, so states
    // like block comments take priority)
    if (g.states) {
      for (const stateRule of g.states) {
        stateRule.begin.lastIndex = pos;
        const beginMatch = stateRule.begin.exec(line);
        if (beginMatch) {
          tokens.push({ category: stateRule.token, text: beginMatch[0] });
          pos += beginMatch[0].length;
          stack.push(stateRule.name);
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // Try root rules in order
    for (const rule of g.rules) {
      const m = tryRule(rule, line, pos);
      if (m) {
        const text = rule.group !== undefined ? (m[rule.group] ?? m[0]) : m[0];
        tokens.push({ category: rule.token, text });
        // Guard against zero-length matches causing infinite loops
        if (m[0].length === 0) {
          tokens.push({ category: 'text', text: line[pos]! });
          pos++;
        } else {
          pos += m[0].length;
        }
        if (rule.push) stack.push(rule.push);
        if (rule.pop) stack.pop();
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Fallback: consume one character as text
    tokens.push({ category: 'text', text: line[pos]! });
    pos++;
  }

  const nextState = { stack };
  grammarCache.set(cacheKey, [tokens, nextState]);
  return [tokens, nextState];
}

/**
 * Tokenize an entire source string (possibly multi-line).
 * Returns flat array of tokens (newlines are NOT included as tokens).
 * Each line's tokens are separated by state continuity.
 */
export function tokenize(source: string, grammar: LanguageGrammar): Token[] {
  const lines = source.split('\n');
  const allTokens: Token[] = [];
  let state = initialState();

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      // We don't emit newline tokens — the caller handles line joining
    }
    const [lineTokens, nextState] = tokenizeLine(lines[i]!, grammar, state);
    allTokens.push(...lineTokens);
    state = nextState;
  }

  return allTokens;
}
