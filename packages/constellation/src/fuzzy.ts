export interface FuzzyMatch {
  text: string;
  score: number;
  matchedIndices: number[];
}

/**
 * Check if a character is at a word boundary in the text.
 * Word boundaries occur after space, hyphen, underscore, or at camelCase transitions.
 */
function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text.charAt(index - 1);
  const curr = text.charAt(index);
  // After delimiter
  if (prev === ' ' || prev === '-' || prev === '_') return true;
  // camelCase transition: lowercase followed by uppercase
  if (prev >= 'a' && prev <= 'z' && curr >= 'A' && curr <= 'Z') return true;
  return false;
}

/** Score a query against text. Returns 0 for no match, higher is better. */
export function fuzzyScore(query: string, text: string): number {
  if (query.length === 0) return 0;

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact match
  if (query === text) return 1000 + 10; // exact case bonus
  if (queryLower === textLower) return 1000;

  // Prefix match
  if (textLower.startsWith(queryLower)) {
    let score = 500 + (query.length / text.length) * 100;
    // Case bonus: check if original case matches
    if (text.startsWith(query)) score += 10;
    return score;
  }

  // Contiguous substring match
  const substringIndex = textLower.indexOf(queryLower);
  if (substringIndex !== -1) {
    // Position bonus: earlier matches score higher
    const positionBonus = Math.max(0, 50 - substringIndex * 5);
    let score = 200 + positionBonus;
    // Case bonus
    if (text.indexOf(query) !== -1) score += 10;
    return score;
  }

  // Character-order match: all query chars appear in order in text
  const matchedIndices: number[] = [];
  let textIdx = 0;
  for (let qi = 0; qi < queryLower.length; qi++) {
    let found = false;
    while (textIdx < textLower.length) {
      if (textLower[textIdx] === queryLower[qi]) {
        matchedIndices.push(textIdx);
        textIdx++;
        found = true;
        break;
      }
      textIdx++;
    }
    if (!found) return 0; // No match
  }

  let score = 50;

  // Consecutive bonus: reward adjacent matched characters
  let consecutiveCount = 0;
  for (let i = 1; i < matchedIndices.length; i++) {
    const curr = matchedIndices[i];
    const prev = matchedIndices[i - 1];
    if (curr !== undefined && prev !== undefined && curr === prev + 1) {
      consecutiveCount++;
    }
  }
  score += consecutiveCount * 15;

  // Word-start bonus: +30 per match at a word boundary
  for (const idx of matchedIndices) {
    if (isWordStart(text, idx)) {
      score += 30;
    }
  }

  // Case bonus: check each matched character
  let caseMatches = 0;
  let qIdx = 0;
  for (const idx of matchedIndices) {
    if (text[idx] === query[qIdx]) {
      caseMatches++;
    }
    qIdx++;
  }
  if (caseMatches === query.length) score += 10;

  return score;
}

/** Match query against text. Returns null if no match. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  if (query.length === 0) {
    return { text, score: 0, matchedIndices: [] };
  }

  const score = fuzzyScore(query, text);
  if (score === 0) return null;

  // Rebuild matched indices for the result
  const matchedIndices = buildMatchedIndices(query, text);
  return { text, score, matchedIndices };
}

/**
 * Build the array of matched character indices in text for the given query.
 * Prefers word-start positions and consecutive runs.
 */
function buildMatchedIndices(query: string, text: string): number[] {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact or prefix or substring match: indices are contiguous
  if (queryLower === textLower) {
    return Array.from({ length: query.length }, (_, i) => i);
  }
  if (textLower.startsWith(queryLower)) {
    return Array.from({ length: query.length }, (_, i) => i);
  }
  const substringIndex = textLower.indexOf(queryLower);
  if (substringIndex !== -1) {
    return Array.from({ length: query.length }, (_, i) => substringIndex + i);
  }

  // Character-order match: greedy forward scan
  const indices: number[] = [];
  let textIdx = 0;
  for (let qi = 0; qi < queryLower.length; qi++) {
    while (textIdx < textLower.length) {
      if (textLower[textIdx] === queryLower[qi]) {
        indices.push(textIdx);
        textIdx++;
        break;
      }
      textIdx++;
    }
  }
  return indices;
}

/** Filter and rank items by fuzzy match against a text accessor. */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): Array<FuzzyMatch & { item: T }> {
  const results: Array<FuzzyMatch & { item: T }> = [];

  for (const item of items) {
    const text = getText(item);
    const match = fuzzyMatch(query, text);
    if (match !== null) {
      results.push({ ...match, item });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}
