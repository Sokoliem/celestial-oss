/**
 * Reference-link definitions for `[label]: url "title"` style markdown links.
 *
 * Used by both the inline parser (to resolve `[text][ref]`) and the block
 * dispatcher (to extract definitions in a first pass).
 */

export interface LinkRef {
  url: string;
  title?: string;
}

/**
 * First-pass scan: extract `[label]: url "title"` definitions (max 3 spaces
 * of leading indentation, only outside fenced code blocks) and return both
 * the ref map and the remaining source with definition lines stripped. The
 * stripping keeps empty lines in place so the block parser still sees the
 * same paragraph boundaries.
 */
export function extractLinkRefs(input: string): { source: string; refs: Map<string, LinkRef> } {
  const refs = new Map<string, LinkRef>();
  const lines = input.split('\n');
  let inFence = false;
  const kept: string[] = [];

  // Exclude `[^label]:` via the `(?!\^)` guard — that's a footnote definition,
  // parsed later in the block loop, not a reference link.
  const refRe = /^ {0,3}\[(?!\^)([^\]]+)\]:\s+(\S+)(?:\s+"([^"]*)")?\s*$/;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }
    if (inFence) {
      kept.push(line);
      continue;
    }
    const m = line.match(refRe);
    if (m) {
      const label = m[1]!.toLowerCase();
      if (!refs.has(label)) {
        refs.set(label, { url: m[2]!, ...(m[3] !== undefined && { title: m[3] }) });
      }
      kept.push('');
      continue;
    }
    kept.push(line);
  }
  return { source: kept.join('\n'), refs };
}
