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
  // Always clone. RegExp#lastIndex is mutable, so reusing a caller-owned
  // sticky expression lets tokenization leak state back into the grammar.
  return new RegExp(re.source, re.sticky ? re.flags : `${re.flags}y`);
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
const LINE_CACHE_LIMIT = 4_096;
const STATE_STACK_LIMIT = 256;

function getPrepared(grammar: LanguageGrammar): LanguageGrammar {
  let prepared = preparedCache.get(grammar);
  if (!prepared) {
    prepared = prepareGrammar(grammar);
    preparedCache.set(grammar, prepared);
  }
  return prepared;
}

function normalizeStack(state: TokenizerState, grammar: LanguageGrammar): string[] {
  const knownStates = new Set(grammar.states?.map((candidate) => candidate.name) ?? []);
  const stack = Array.isArray(state.stack) ? state.stack : [];
  return stack.filter((name): name is string => typeof name === 'string' && knownStates.has(name)).slice(-STATE_STACK_LIMIT);
}

function cloneTokens(tokens: readonly Token[]): Token[] {
  return tokens.map((token) => ({ ...token }));
}

function rememberLine(
  cache: Map<string, readonly [readonly Token[], TokenizerState]>,
  key: string,
  tokens: readonly Token[],
  state: TokenizerState,
): void {
  if (cache.size >= LINE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, [cloneTokens(tokens), { stack: [...state.stack] }]);
}

function appendRuleMatch(tokens: Token[], rule: TokenRule, match: RegExpExecArray): void {
  const fullText = match[0];
  const group = rule.group;
  if (group === undefined || group === 0 || !Number.isSafeInteger(group) || group < 0) {
    tokens.push({ category: rule.token, text: fullText });
    return;
  }

  const captured = match[group];
  if (!captured || captured === fullText) {
    tokens.push({ category: rule.token, text: fullText });
    return;
  }

  // JavaScript match arrays do not expose capture offsets unless the optional
  // `d` flag is used. Locate the capture conservatively and retain unmatched
  // prefix/suffix text so tokenization never drops source characters.
  const captureOffset = fullText.indexOf(captured);
  if (captureOffset < 0) {
    tokens.push({ category: rule.token, text: fullText });
    return;
  }
  if (captureOffset > 0) {
    tokens.push({ category: 'text', text: fullText.slice(0, captureOffset) });
  }
  tokens.push({ category: rule.token, text: captured });
  const suffixOffset = captureOffset + captured.length;
  if (suffixOffset < fullText.length) {
    tokens.push({ category: 'text', text: fullText.slice(suffixOffset) });
  }
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
  const initialStack = normalizeStack(state, g);
  // Use the exact input rather than a short hash. A collision here returns
  // syntactically valid but incorrect tokens, which is worse than a miss.
  const cacheKey = JSON.stringify([initialStack, line]);
  const cached = grammarCache.get(cacheKey);
  if (cached) {
    return [cloneTokens(cached[0]), { stack: [...cached[1].stack] }];
  }
  const tokens: Token[] = [];
  const stack = initialStack;
  const knownStates = new Set(g.states?.map((candidate) => candidate.name) ?? []);
  let pos = 0;

  const applyTransitions = (rule: TokenRule): void => {
    if (rule.push && knownStates.has(rule.push) && stack.length < STATE_STACK_LIMIT) stack.push(rule.push);
    if (rule.pop) stack.pop();
  };

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
        if (endMatch && endMatch[0].length > 0) {
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
            if (m && m[0].length > 0) {
              appendRuleMatch(tokens, rule, m);
              pos += m[0].length;
              applyTransitions(rule);
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
        if (beginMatch && beginMatch[0].length > 0) {
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
      if (m && m[0].length > 0) {
        appendRuleMatch(tokens, rule, m);
        pos += m[0].length;
        applyTransitions(rule);
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
  rememberLine(grammarCache, cacheKey, tokens, nextState);
  return [cloneTokens(tokens), { stack: [...nextState.stack] }];
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
