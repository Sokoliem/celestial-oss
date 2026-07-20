/**
 * Message Priority Classification
 *
 * Classifies arbitrary messages into rendering priority tiers based on
 * structural heuristics. Used by the opt-in scheduler integration to
 * decide whether a new message should interrupt an in-progress render.
 *
 * Priority tiers:
 *  - user-blocking: key, mouse, paste, resize — must render ASAP for responsiveness
 *  - normal: timer, animation — visible but tolerates one dropped frame
 *  - background: agent, stream, fetch — data arriving, render when convenient
 */

import type { Priority } from './scheduler.js';

// ─── Render Cause ──────────────────────────────────────────────────────────

/**
 * Structured description of why a render occurred and how it was processed.
 * Extends the basic RenderTraceSpan with scheduler-specific metadata.
 */
export interface RenderCause {
  /** The discriminant/type of the message that triggered the render. */
  readonly msgType: string;
  /** Priority classification of the triggering message. */
  readonly priority: Priority;
  /** Whether the render yielded control at least once between phases. */
  readonly yielded: boolean;
  /** How many times the render yielded between phases. */
  readonly yieldCount: number;
  /** Whether the render was interrupted (abandoned) by a higher-priority message. */
  readonly interrupted: boolean;
  /** Total wall-clock time of the render in milliseconds. */
  readonly totalMs: number;
  /** Per-phase timing breakdown. */
  readonly phases: ReadonlyArray<{ readonly name: string; readonly ms: number }>;
}

// ─── Mutable builder for constructing RenderCause during a render pass ─────

export interface RenderCauseBuilder {
  /** Record the start of a named phase. */
  beginPhase(name: string): void;
  /** Record the end of the current phase. */
  endPhase(): void;
  /** Record that the render yielded between phases. */
  recordYield(): void;
  /** Record that the render was interrupted. */
  recordInterrupt(): void;
  /** Finalize and return the immutable RenderCause. */
  finalize(): RenderCause;
}

export function createRenderCauseBuilder(msgType: string, priority: Priority): RenderCauseBuilder {
  const startTime = performance.now();
  const phases: Array<{ name: string; ms: number }> = [];
  let currentPhaseStart = 0;
  let currentPhaseName: string | null = null;
  let yieldCount = 0;
  let interrupted = false;

  return {
    beginPhase(name: string): void {
      currentPhaseName = name;
      currentPhaseStart = performance.now();
    },

    endPhase(): void {
      if (currentPhaseName !== null) {
        phases.push({ name: currentPhaseName, ms: performance.now() - currentPhaseStart });
        currentPhaseName = null;
      }
    },

    recordYield(): void {
      yieldCount++;
    },

    recordInterrupt(): void {
      interrupted = true;
    },

    finalize(): RenderCause {
      // Close any open phase
      if (currentPhaseName !== null) {
        phases.push({ name: currentPhaseName, ms: performance.now() - currentPhaseStart });
        currentPhaseName = null;
      }
      return {
        msgType,
        priority,
        yielded: yieldCount > 0,
        yieldCount,
        interrupted,
        totalMs: performance.now() - startTime,
        phases: [...phases],
      };
    },
  };
}

// ─── Message classification ────────────────────────────────────────────────

/**
 * Well-known message type patterns and their priority mappings.
 *
 * The classifier inspects the message structurally:
 * 1. If the message has a `type` string field, match against known patterns.
 * 2. Otherwise fall back to 'normal'.
 *
 * This is intentionally heuristic — apps can override by providing a custom
 * classifier via AppOptions.classifyMessage.
 */

const USER_BLOCKING_PATTERNS = [
  'key',
  'Key',
  'mouse',
  'Mouse',
  'click',
  'Click',
  'paste',
  'Paste',
  'resize',
  'Resize',
  'focus',
  'Focus',
  'scroll',
  'Scroll',
  'input',
  'Input',
  'hover',
  'Hover',
  'drag',
  'Drag',
  'drop',
  'Drop',
  'wheel',
  'Wheel',
  'touch',
  'Touch',
  'pointer',
  'Pointer',
];

const BACKGROUND_PATTERNS = [
  'agent',
  'Agent',
  'stream',
  'Stream',
  'fetch',
  'Fetch',
  'load',
  'Load',
  'ws',
  'Ws',
  'websocket',
  'WebSocket',
  'sse',
  'SSE',
  'data',
  'Data',
  'chunk',
  'Chunk',
  'response',
  'Response',
];

/**
 * Classify a message into a rendering priority tier.
 *
 * Inspects the message for a `type` string field (the standard discriminant
 * in Elm Architecture messages) and pattern-matches against known prefixes.
 *
 * Priority order: user-blocking > normal > background
 */
export function classifyMessagePriority(msg: unknown): Priority {
  const msgType = extractMsgType(msg);
  if (msgType === null) return 'normal';

  for (const pattern of USER_BLOCKING_PATTERNS) {
    if (msgType.includes(pattern)) return 'user-blocking';
  }

  for (const pattern of BACKGROUND_PATTERNS) {
    if (msgType.includes(pattern)) return 'background';
  }

  return 'normal';
}

/**
 * Extract the message type string from an unknown message value.
 * Supports the common Elm-style discriminated union shape: { type: string }.
 */
export function extractMsgType(msg: unknown): string | null {
  if (msg === null || msg === undefined) return null;
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'object') {
    const obj = msg as Record<string, unknown>;
    if (typeof obj.type === 'string') return obj.type;
    // Some frameworks use 'kind' instead of 'type'
    if (typeof obj.kind === 'string') return obj.kind;
    // Support tagged union via 'tag'
    if (typeof obj.tag === 'string') return obj.tag;
  }
  return null;
}
