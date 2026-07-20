/**
 * Spectrum Document Tokenization
 *
 * Higher-level document helpers built on the line tokenizer. Adds
 * line checkpoints, incremental retokenization, bracket matching,
 * and folding range detection.
 */

import { getLanguageGrammar } from './grammars.js';
import { initialState, tokenizeLine } from './tokenizer.js';
import type {
  BracketMatch,
  FoldingRange,
  LanguageGrammar,
  LineChange,
  LinePosition,
  Token,
  TokenCategory,
  TokenizedDocument,
  TokenizedLine,
  TokenizerState,
} from './types.js';

function stateSignature(state: TokenizerState): string {
  return JSON.stringify(state.stack);
}

function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function tokenizeDocumentLine(lineText: string, grammar: LanguageGrammar, stateBefore: TokenizerState): TokenizedLine {
  const [tokens, stateAfter] = tokenizeLine(lineText, grammar, stateBefore);
  return {
    text: lineText,
    tokens,
    hash: hashText(lineText),
    stateBefore,
    stateAfter,
    stateBeforeSignature: stateSignature(stateBefore),
    stateAfterSignature: stateSignature(stateAfter),
  };
}

function buildDocument(source: string, language: string, grammar: LanguageGrammar): TokenizedDocument {
  const lineTexts = source.split('\n');
  const lines: TokenizedLine[] = [];
  let state = initialState();

  for (const lineText of lineTexts) {
    const line = tokenizeDocumentLine(lineText, grammar, state);
    lines.push(line);
    state = line.stateAfter;
  }

  return {
    source,
    language,
    lines,
  };
}

function sameTokens(left: readonly Token[], right: readonly Token[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i]!.category !== right[i]!.category || left[i]!.text !== right[i]!.text) {
      return false;
    }
  }
  return true;
}

function canReuseLine(previous: TokenizedLine, next: TokenizedLine): boolean {
  return (
    previous.text === next.text &&
    previous.hash === next.hash &&
    previous.stateBeforeSignature === next.stateBeforeSignature &&
    previous.stateAfterSignature === next.stateAfterSignature &&
    sameTokens(previous.tokens, next.tokens)
  );
}

interface NormalizedLineChange {
  readonly startLine: number;
  readonly deleteCount: number;
  readonly insertLines: readonly string[];
}

function normalizeLineChange(previous: TokenizedDocument, change: LineChange): NormalizedLineChange {
  const previousLines = previous.source.split('\n');
  const rawStart = Number.isFinite(change.startLine) ? Math.floor(change.startLine) : 0;
  const startLine = Math.max(0, Math.min(rawStart, previousLines.length, previous.lines.length));
  const rawDelete = Number.isFinite(change.deleteCount) ? Math.floor(change.deleteCount) : 0;
  const deleteCount = Math.max(0, Math.min(rawDelete, previousLines.length - startLine));
  if (!Array.isArray(change.insertLines) || change.insertLines.some((line) => typeof line !== 'string' || /[\r\n]/.test(line))) {
    throw new TypeError('retokenizeDocument: insertLines must contain newline-free strings');
  }
  return { startLine, deleteCount, insertLines: [...change.insertLines] };
}

function applyLineChange(previous: TokenizedDocument, change: NormalizedLineChange): string[] {
  const previousLines = previous.source.split('\n');
  const { startLine, deleteCount } = change;
  return [...previousLines.slice(0, startLine), ...change.insertLines, ...previousLines.slice(startLine + deleteCount)];
}

function resolveLines(documentOrLines: TokenizedDocument | readonly TokenizedLine[]): readonly TokenizedLine[] {
  return isTokenizedLineArray(documentOrLines) ? documentOrLines : documentOrLines.lines;
}

function isTokenizedLineArray(value: TokenizedDocument | readonly TokenizedLine[]): value is readonly TokenizedLine[] {
  return Array.isArray(value);
}

interface BracketEntry {
  readonly bracket: string;
  readonly position: LinePosition;
}

function isBracketCategory(category: TokenCategory): boolean {
  return category !== 'comment' && category !== 'string';
}

/**
 * Determine whether a `<` at a given position is likely an angle bracket
 * (generic/type parameter) rather than a comparison operator.
 *
 * Heuristic: the `<` must be *immediately adjacent* (no whitespace gap) to
 * a preceding identifier-like token or closing bracket. This distinguishes
 * `Array<T>` (generic) from `a < b` (comparison, has surrounding spaces).
 */
function isLikelyAngleBracket(line: TokenizedLine, charColumn: number): boolean {
  if (charColumn === 0) return false;
  let col = 0;
  let prevCategory: TokenCategory | null = null;
  let prevText = '';
  let prevEnd = 0;
  for (const token of line.tokens) {
    const end = col + token.text.length;
    if (end <= charColumn) {
      prevCategory = token.category;
      prevText = token.text;
      prevEnd = end;
    }
    col = end;
  }
  if (!prevCategory) return false;
  // Must be immediately adjacent — no whitespace between the previous token and `<`
  if (prevEnd !== charColumn) return false;
  // Previous token must be an identifier-like token or closing bracket
  if (prevCategory === 'type' || prevCategory === 'function') return true;
  if (prevText.endsWith(')') || prevText.endsWith(']') || prevText.endsWith('>')) return true;
  return false;
}

function collectBracketEntries(lines: readonly TokenizedLine[]): BracketEntry[] {
  const entries: BracketEntry[] = [];
  let angleBracketDepth = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    let column = 0;
    for (const token of line.tokens) {
      for (let i = 0; i < token.text.length; i++) {
        const char = token.text[i]!;
        if (isBracketCategory(token.category) && '()[]{}'.includes(char)) {
          entries.push({
            bracket: char,
            position: { line: lineIndex, column: column + i },
          });
        } else if (isBracketCategory(token.category) && (char === '<' || char === '>')) {
          const charCol = column + i;
          if (char === '<' && isLikelyAngleBracket(line, charCol)) {
            entries.push({
              bracket: char,
              position: { line: lineIndex, column: charCol },
            });
            angleBracketDepth++;
          } else if (char === '>' && angleBracketDepth > 0) {
            // Only treat > as a closing angle bracket when there's a pending <
            entries.push({
              bracket: char,
              position: { line: lineIndex, column: charCol },
            });
            angleBracketDepth--;
          }
        }
      }
      column += token.text.length;
    }
  }

  return entries;
}

function findBracketAtPosition(entries: readonly BracketEntry[], position: LinePosition): number {
  return entries.findIndex((entry) => entry.position.line === position.line && entry.position.column === position.column);
}

function indentationWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (char === ' ') {
      width += 1;
    } else if (char === '\t') {
      width += 2;
    } else {
      break;
    }
  }
  return width;
}

function uniqueRanges(ranges: readonly FoldingRange[]): FoldingRange[] {
  const seen = new Set<string>();
  const unique: FoldingRange[] = [];

  for (const range of ranges) {
    if (range.endLine <= range.startLine) continue;
    const key = `${range.kind}:${range.startLine}:${range.endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(range);
  }

  unique.sort((left, right) => {
    if (left.startLine !== right.startLine) return left.startLine - right.startLine;
    if (left.endLine !== right.endLine) return left.endLine - right.endLine;
    return left.kind.localeCompare(right.kind);
  });

  return unique;
}

/**
 * Tokenize a full document into line records with tokenizer state
 * checkpoints before and after each line.
 */
export function tokenizeDocument(source: string, language: string): TokenizedDocument | null {
  const grammar = getLanguageGrammar(language);
  if (!grammar) return null;
  return buildDocument(source, grammar.name, grammar);
}

/**
 * Incrementally re-tokenize a changed document, preserving unaffected
 * line objects once state and content converge with the previous version.
 */
export function retokenizeDocument(previous: TokenizedDocument, change: LineChange): TokenizedDocument {
  const grammar = getLanguageGrammar(previous.language);
  if (!grammar) return previous;

  const normalized = normalizeLineChange(previous, change);
  const { startLine } = normalized;
  const nextLineTexts = applyLineChange(previous, normalized);
  const delta = normalized.deleteCount - normalized.insertLines.length;
  const nextLines: TokenizedLine[] = previous.lines.slice(0, startLine);
  let state = startLine > 0 ? previous.lines[startLine - 1]!.stateAfter : initialState();

  for (let nextIndex = startLine; nextIndex < nextLineTexts.length; nextIndex++) {
    const line = tokenizeDocumentLine(nextLineTexts[nextIndex]!, grammar, state);
    const previousIndex = nextIndex + delta;
    const reusable = previousIndex >= 0 && previousIndex < previous.lines.length && canReuseLine(previous.lines[previousIndex]!, line);

    if (reusable) {
      nextLines.push(previous.lines[previousIndex]!);
      nextLines.push(...previous.lines.slice(previousIndex + 1));
      return {
        source: nextLineTexts.join('\n'),
        language: previous.language,
        lines: nextLines,
      };
    }

    nextLines.push(line);
    state = line.stateAfter;
  }

  return {
    source: nextLineTexts.join('\n'),
    language: previous.language,
    lines: nextLines,
  };
}

/**
 * Find the matching bracket pair at a given 0-based line/column position.
 * Brackets inside strings and comments are ignored.
 */
export function findMatchingBracket(documentOrLines: TokenizedDocument | readonly TokenizedLine[], position: LinePosition): BracketMatch | null {
  const lines = resolveLines(documentOrLines);
  const entries = collectBracketEntries(lines);
  const entryIndex = findBracketAtPosition(entries, position);
  if (entryIndex === -1) return null;

  const entry = entries[entryIndex]!;
  const openToClose: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const closeToOpen: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

  if (entry.bracket in openToClose) {
    const closeBracket = openToClose[entry.bracket]!;
    let depth = 0;
    for (let i = entryIndex + 1; i < entries.length; i++) {
      const current = entries[i]!;
      if (current.bracket === entry.bracket) depth += 1;
      if (current.bracket === closeBracket) {
        if (depth === 0) {
          return {
            bracket: entry.bracket as '(' | '[' | '{' | '<',
            open: entry.position,
            close: current.position,
          };
        }
        depth -= 1;
      }
    }
    return null;
  }

  const openBracket = closeToOpen[entry.bracket];
  if (!openBracket) return null;

  let depth = 0;
  for (let i = entryIndex - 1; i >= 0; i--) {
    const current = entries[i]!;
    if (current.bracket === entry.bracket) depth += 1;
    if (current.bracket === openBracket) {
      if (depth === 0) {
        return {
          bracket: openBracket as '(' | '[' | '{' | '<',
          open: current.position,
          close: entry.position,
        };
      }
      depth -= 1;
    }
  }

  return null;
}

/**
 * Detect folding ranges from both bracket pairs and indentation changes.
 */
export function getFoldingRanges(documentOrLines: TokenizedDocument | readonly TokenizedLine[]): FoldingRange[] {
  const lines = resolveLines(documentOrLines);
  const ranges: FoldingRange[] = [];
  const entries = collectBracketEntries(lines);
  const bracketStack: Array<{ bracket: string; line: number }> = [];
  const openToClose: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const closeToOpen: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

  for (const entry of entries) {
    if (entry.bracket in openToClose) {
      bracketStack.push({ bracket: entry.bracket, line: entry.position.line });
      continue;
    }

    const expectedOpen = closeToOpen[entry.bracket];
    while (bracketStack.length > 0) {
      const candidate = bracketStack.pop()!;
      if (candidate.bracket === expectedOpen) {
        if (entry.position.line > candidate.line) {
          ranges.push({
            kind: 'bracket',
            startLine: candidate.line,
            endLine: entry.position.line,
          });
        }
        break;
      }
    }
  }

  const indentStack: Array<{ indent: number; startLine: number }> = [];
  let lastContentLine = -1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const text = lines[lineIndex]!.text;
    const trimmed = text.trim();
    if (trimmed.length === 0) continue;

    const indent = indentationWidth(text);

    while (indentStack.length > 0 && indent < indentStack[indentStack.length - 1]!.indent) {
      const current = indentStack.pop()!;
      if (lastContentLine > current.startLine) {
        ranges.push({
          kind: 'indent',
          startLine: current.startLine,
          endLine: lastContentLine,
        });
      }
    }

    let nextIndent: number | null = null;
    for (let nextLine = lineIndex + 1; nextLine < lines.length; nextLine++) {
      const nextText = lines[nextLine]!.text.trim();
      if (nextText.length === 0) continue;
      nextIndent = indentationWidth(lines[nextLine]!.text);
      break;
    }

    if (nextIndent !== null && nextIndent > indent) {
      indentStack.push({ indent: nextIndent, startLine: lineIndex });
    }

    lastContentLine = lineIndex;
  }

  while (indentStack.length > 0) {
    const current = indentStack.pop()!;
    if (lastContentLine > current.startLine) {
      ranges.push({
        kind: 'indent',
        startLine: current.startLine,
        endLine: lastContentLine,
      });
    }
  }

  return uniqueRanges(ranges);
}
