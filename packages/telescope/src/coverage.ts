/**
 * Enhanced message coverage analysis.
 *
 * Analyzes dispatched messages against a set of defined message types
 * to compute coverage metrics — useful for ensuring test suites exercise
 * all application message paths.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface MessageCoverageReport {
  /** Total number of messages dispatched. */
  totalDispatched: number;
  /** Number of unique message types seen. */
  uniqueTypes: number;
  /** Per-type statistics: count, first/last timestamp. */
  byType: Map<string, { count: number; firstSeen: number; lastSeen: number }>;
  /** Defined message types that were never dispatched. */
  uncovered: string[];
  /** Coverage ratio: 0–1 (covered / total defined). */
  coverage: number;
}

// ── Implementation ─────────────────────────────────────────────────────

/**
 * Analyze message coverage for a set of dispatched events.
 *
 * @param dispatched - Array of dispatched messages with `type` and optional `timestamp`.
 * @param definedMsgTypes - Array of all known/defined message type strings.
 * @returns A `MessageCoverageReport` summarizing the coverage.
 */
export function analyzeMessageCoverage(dispatched: Array<{ type: string; timestamp?: number }>, definedMsgTypes: string[]): MessageCoverageReport {
  const byType = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();

  for (let i = 0; i < dispatched.length; i++) {
    const msg = dispatched[i]!;
    const ts = Number.isFinite(msg.timestamp) ? msg.timestamp! : i;
    const existing = byType.get(msg.type);

    if (existing) {
      existing.count += 1;
      existing.lastSeen = ts;
    } else {
      byType.set(msg.type, { count: 1, firstSeen: ts, lastSeen: ts });
    }
  }

  const definedSet = new Set(definedMsgTypes);
  const uncovered = [...definedSet].filter((type) => !byType.has(type));
  const coveredCount = [...definedSet].filter((t) => byType.has(t)).length;
  const coverage = definedSet.size === 0 ? 1 : coveredCount / definedSet.size;

  return {
    totalDispatched: dispatched.length,
    uniqueTypes: byType.size,
    byType,
    uncovered,
    coverage,
  };
}
