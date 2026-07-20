/**
 * Embedded Language Regions
 *
 * Tokenize a document where contiguous line ranges should be parsed
 * with a grammar different from the outer language — e.g. fenced code
 * blocks inside Markdown, `<script>`/`<style>` tags inside HTML, or
 * GraphQL/SQL inside JS template literals (when the host can compute
 * line-aligned region boundaries).
 *
 * v1 scope: line-aligned regions only. Mid-line embeddings can be
 * approximated by emitting per-line regions; a future iteration will
 * accept column-bounded regions and splice tokens within a line.
 *
 * Algorithm:
 *   1. Split the source into segments — alternating outer/embedded
 *      based on the regions array (sorted, non-overlapping).
 *   2. Tokenize each segment with its grammar, threading tokenizer
 *      state across consecutive *outer* segments only. Embedded
 *      segments use a fresh `initialState()` because the outer
 *      grammar's state machine doesn't apply inside them.
 *   3. Stitch the per-segment line records into a single
 *      `TokenizedDocument` keyed by the outer language.
 *
 * The resulting document shares the same shape as `tokenizeDocument`,
 * so all downstream APIs (highlight, bracket matching, folding,
 * bracket colors) work without modification.
 */

import { getLanguageGrammar } from './grammars.js';
import { initialState, tokenizeLine } from './tokenizer.js';
import type { LanguageGrammar, Token, TokenizedDocument, TokenizedLine, TokenizerState } from './types.js';

// ── Public types ────────────────────────────────────────────────────────

export interface EmbeddedRegion {
  /** 0-based starting source line (inclusive). */
  readonly startLine: number;
  /** 0-based ending source line (inclusive). */
  readonly endLine: number;
  /** Language identifier for the embedded grammar. */
  readonly lang: string;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Tokenize a document with optional line-aligned embedded regions.
 * Returns `null` if the outer language is unknown; embedded regions
 * with unknown languages are silently rendered with the outer grammar
 * as a graceful fallback (so a typo in the fence info-string never
 * blocks the rest of the document from highlighting).
 */
export function tokenizeDocumentEmbedded(source: string, outerLang: string, regions: readonly EmbeddedRegion[]): TokenizedDocument | null {
  const outerGrammar = getLanguageGrammar(outerLang);
  if (!outerGrammar) return null;

  const lines = source.split('\n');
  const sorted = sortAndValidate(regions, lines.length);

  // Build a per-line grammar map: for each source line, which grammar
  // should tokenize it. Default = outer.
  const grammarPerLine: LanguageGrammar[] = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) grammarPerLine[i] = outerGrammar;
  for (const region of sorted) {
    const grammar = getLanguageGrammar(region.lang) ?? outerGrammar;
    for (let i = region.startLine; i <= region.endLine; i++) {
      grammarPerLine[i] = grammar;
    }
  }

  const tokenized: TokenizedLine[] = [];
  // Outer-language state threads across outer lines, paused while
  // we're inside an embedded region.
  let outerState = initialState();
  // Embedded-language state threads across consecutive embedded lines
  // of the same grammar; resets at every transition.
  let embeddedState = initialState();
  let embeddedGrammar: LanguageGrammar | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!;
    const grammar = grammarPerLine[i]!;
    const isOuter = grammar === outerGrammar;

    if (isOuter) {
      embeddedState = initialState();
      embeddedGrammar = null;
      tokenized.push(buildLine(lineText, grammar, outerState));
      outerState = tokenized[tokenized.length - 1]!.stateAfter;
    } else {
      // Reset embedded state when the embedded grammar changes (e.g.
      // back-to-back regions with different langs).
      if (embeddedGrammar !== grammar) {
        embeddedGrammar = grammar;
        embeddedState = initialState();
      }
      tokenized.push(buildLine(lineText, grammar, embeddedState));
      embeddedState = tokenized[tokenized.length - 1]!.stateAfter;
    }
  }

  return { source, language: outerLang, lines: tokenized };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildLine(lineText: string, grammar: LanguageGrammar, stateBefore: TokenizerState): TokenizedLine {
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

function stateSignature(state: TokenizerState): string {
  return JSON.stringify(state.stack);
}

function hashText(text: string): string {
  // Same djb2 used in document.ts so reused-line detection works.
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Validate and normalise the regions array: sort by `startLine`,
 * verify line indices are in range and that regions don't overlap.
 * Throws on invalid input — embedded regions are typically
 * machine-generated by the host (e.g. pulsar's fence walker), so a
 * loud failure during development is more useful than silent fallback.
 */
function sortAndValidate(regions: readonly EmbeddedRegion[], totalLines: number): EmbeddedRegion[] {
  if (regions.length > 100_000) {
    throw new Error('tokenizeDocumentEmbedded: region count exceeds 100000');
  }

  const normalized = regions.map((region) => {
    if (!Number.isSafeInteger(region.startLine) || !Number.isSafeInteger(region.endLine)) {
      throw new Error('tokenizeDocumentEmbedded: region line indices must be safe integers');
    }
    if (typeof region.lang !== 'string' || region.lang.trim().length === 0) {
      throw new Error('tokenizeDocumentEmbedded: region language must be a non-empty string');
    }
    return { startLine: region.startLine, endLine: region.endLine, lang: region.lang };
  });
  const sorted = normalized.sort((a, b) => a.startLine - b.startLine);
  let prevEnd = -1;
  for (const region of sorted) {
    if (region.startLine < 0 || region.endLine >= totalLines) {
      throw new Error(`tokenizeDocumentEmbedded: region [${region.startLine}..${region.endLine}] is out of bounds for ${totalLines} lines`);
    }
    if (region.endLine < region.startLine) {
      throw new Error(`tokenizeDocumentEmbedded: region endLine ${region.endLine} < startLine ${region.startLine}`);
    }
    if (region.startLine <= prevEnd) {
      throw new Error(`tokenizeDocumentEmbedded: regions overlap at line ${region.startLine}`);
    }
    prevEnd = region.endLine;
  }
  return sorted;
}

// Re-export Token to keep the API coherent for consumers who want to
// build their own renderers off the result.
export type { Token };
