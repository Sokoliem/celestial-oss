/**
 * Ghost Pool — manages enter/exit animations for elements.
 *
 * When an element leaves the layout tree, a "ghost" keeps it rendered
 * for the duration of an exit animation. The PresenceTracker detects
 * which layout IDs appeared or disappeared between frames.
 */

import type { LayoutRect, VNode } from './vdom.js';

// --- Public types ---

export type AnimationType = 'fadeIn' | 'fadeOut' | 'slideIn' | 'slideOut';

export interface LifecycleConfig {
  enter?: {
    type: AnimationType;
    duration: number;
    delay?: number;
    easing?: (t: number) => number;
  };
  exit?: {
    type: AnimationType;
    duration: number;
    easing?: (t: number) => number;
  };
}

export interface GhostEntry {
  readonly id: string;
  readonly node: VNode;
  readonly rect: LayoutRect;
  readonly config: LifecycleConfig;
  readonly startTime: number;
  readonly duration: number;
}

// --- GhostPool ---

export interface GhostPool {
  /** Register an element for exit animation */
  beginExit(id: string, node: VNode, rect: LayoutRect, now: number, config: LifecycleConfig): void;
  /** Get all currently-exiting ghosts with their current progress (0..1) */
  getGhosts(now: number): Array<GhostEntry & { progress: number }>;
  /** Get IDs of ghosts whose animations have completed */
  getCompleted(now: number): string[];
  /** Remove completed ghosts */
  reap(now: number): void;
  /** Whether any ghosts are active */
  hasGhosts(): boolean;
  /** Reset all ghosts */
  reset(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createGhostPool(): GhostPool {
  const ghosts = new Map<string, GhostEntry>();

  function computeProgress(entry: GhostEntry, now: number): number {
    if (entry.duration <= 0) return 1;
    const raw = clamp((now - entry.startTime) / entry.duration, 0, 1);
    const easing = entry.config.exit?.easing;
    return easing ? easing(raw) : raw;
  }

  return {
    beginExit(id, node, rect, now, config) {
      const duration = config.exit?.duration ?? 0;
      ghosts.set(id, { id, node, rect, config, startTime: now, duration });
    },

    getGhosts(now) {
      const result: Array<GhostEntry & { progress: number }> = [];
      for (const entry of ghosts.values()) {
        result.push({ ...entry, progress: computeProgress(entry, now) });
      }
      return result;
    },

    getCompleted(now) {
      const completed: string[] = [];
      for (const entry of ghosts.values()) {
        if (entry.duration <= 0 || clamp((now - entry.startTime) / entry.duration, 0, 1) >= 1) {
          completed.push(entry.id);
        }
      }
      return completed;
    },

    reap(now) {
      const toDelete: string[] = [];
      for (const entry of ghosts.values()) {
        if (entry.duration <= 0 || clamp((now - entry.startTime) / entry.duration, 0, 1) >= 1) {
          toDelete.push(entry.id);
        }
      }
      for (const id of toDelete) {
        ghosts.delete(id);
      }
    },

    hasGhosts() {
      return ghosts.size > 0;
    },

    reset() {
      ghosts.clear();
    },
  };
}

// --- PresenceTracker ---

export interface PresenceTracker {
  /** Feed current frame's IDs, get back which entered and exited */
  update(currentIds: Set<string>): { entered: string[]; exited: string[] };
  /** Get the previous frame's ID set */
  getPreviousIds(): Set<string>;
  /** Reset tracker */
  reset(): void;
}

export function createPresenceTracker(): PresenceTracker {
  let previousIds: Set<string> = new Set();

  return {
    update(currentIds) {
      const entered: string[] = [];
      const exited: string[] = [];

      for (const id of currentIds) {
        if (!previousIds.has(id)) {
          entered.push(id);
        }
      }

      for (const id of previousIds) {
        if (!currentIds.has(id)) {
          exited.push(id);
        }
      }

      previousIds = new Set(currentIds);
      return { entered, exited };
    },

    getPreviousIds() {
      return new Set(previousIds);
    },

    reset() {
      previousIds = new Set();
    },
  };
}
