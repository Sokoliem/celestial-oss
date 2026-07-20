/**
 * Nebula Concurrent Rendering Scheduler
 *
 * Priority-based work scheduling for interruptible rendering.
 * Yields to the event loop between chunks to keep the app responsive.
 */

export type Priority = 'user-blocking' | 'normal' | 'background';

const PRIORITY_ORDER: Record<Priority, number> = {
  'user-blocking': 0,
  normal: 1,
  background: 2,
};

export interface SchedulerOptions {
  /** Maximum time slice before yielding (ms). Default: 8ms (half of 16ms frame). */
  frameDeadlineMs?: number;
  /** Minimum entry count to enable chunking. Below this, render is synchronous. Default: 500. */
  chunkThreshold?: number;
}

export interface Scheduler {
  /** Returns true if the current time slice has been exhausted and work should yield. */
  shouldYield(): boolean;
  /** Schedule work at a given priority. Higher priority runs first. */
  scheduleWork(priority: Priority, work: () => void): void;
  /** Cancel all pending work. */
  cancelAll(): void;
  /** Mark the start of a new time slice. */
  resetDeadline(): void;
  /** Current generation counter. Incremented on interruption. */
  readonly generation: number;
  /** Increment generation to signal interruption. */
  interrupt(): void;
}

interface WorkItem {
  priority: Priority;
  work: () => void;
}

export function createScheduler(opts?: SchedulerOptions): Scheduler {
  const frameDeadlineMs = opts?.frameDeadlineMs ?? 8;
  let deadlineStart = performance.now();
  let generation = 0;
  const queue: WorkItem[] = [];
  let scheduled = false;

  function shouldYield(): boolean {
    return performance.now() - deadlineStart >= frameDeadlineMs;
  }

  function flush(): void {
    scheduled = false;
    // Sort by priority (lower number = higher priority)
    queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    while (queue.length > 0) {
      const item = queue.shift()!;
      item.work();
    }
  }

  function scheduleWork(priority: Priority, work: () => void): void {
    queue.push({ priority, work });
    if (!scheduled) {
      scheduled = true;
      // Use setImmediate if available (Node.js), otherwise setTimeout(0)
      if (typeof setImmediate !== 'undefined') {
        setImmediate(flush);
      } else {
        setTimeout(flush, 0);
      }
    }
  }

  function cancelAll(): void {
    queue.length = 0;
  }

  function resetDeadline(): void {
    deadlineStart = performance.now();
  }

  function interrupt(): void {
    generation++;
  }

  return {
    shouldYield,
    scheduleWork,
    cancelAll,
    resetDeadline,
    get generation() {
      return generation;
    },
    interrupt,
  };
}

/** Classify a message source into a rendering priority. */
export function classifyPriority(
  source: 'key' | 'mouse' | 'focus' | 'paste' | 'timer' | 'animationFrame' | 'resize' | 'agent' | 'fetch' | 'stream' | 'phase' | 'custom',
): Priority {
  switch (source) {
    case 'key':
    case 'mouse':
    case 'focus':
    case 'paste':
    case 'resize':
      return 'user-blocking';
    case 'timer':
    case 'animationFrame':
      return 'normal';
    case 'agent':
    case 'fetch':
    case 'stream':
    case 'phase':
    case 'custom':
      return 'background';
  }
}
