export interface TerminalInputStream extends NodeJS.ReadableStream {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  readonly readableFlowing?: boolean | null;
  setRawMode?: (mode: boolean) => void;
  resume(): this;
  pause(): this;
}

export interface TerminalLease {
  readonly released: boolean;
  release(): void;
}

interface LeaseState {
  count: number;
  originalRaw: boolean | undefined;
  originallyFlowing: boolean | null | undefined;
}

const leases = new WeakMap<object, LeaseState>();

/**
 * Acquire shared ownership of terminal raw/input state. The first owner records
 * the original state and the last owner restores it; intermediate releases are
 * deliberately side-effect free.
 */
export function acquireTerminalLease(stdin: TerminalInputStream): TerminalLease {
  let state = leases.get(stdin as object);
  if (!state) {
    state = {
      count: 0,
      originalRaw: stdin.isRaw,
      originallyFlowing: stdin.readableFlowing,
    };
    leases.set(stdin as object, state);
  }

  if (state.count === 0) {
    stdin.setRawMode?.(true);
    stdin.resume();
  }
  state.count++;
  let released = false;

  return {
    get released() {
      return released;
    },
    release(): void {
      if (released) return;
      released = true;
      const current = leases.get(stdin as object);
      if (!current) return;
      current.count = Math.max(0, current.count - 1);
      if (current.count > 0) return;

      try {
        if (current.originalRaw !== undefined) stdin.setRawMode?.(current.originalRaw);
      } finally {
        if (current.originallyFlowing !== true) stdin.pause();
        leases.delete(stdin as object);
      }
    },
  };
}
