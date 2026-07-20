// ─── Machine Registry ───────────────────────────────────────────────────────
// Generic interface for managing stateful machine services.
// Phase implements this; nebula consumes it without importing phase types.

/**
 * A single managed machine service entry.
 * Phase's PhaseService adapts to this interface.
 */
export interface MachineRegistryEntry {
  start(): void;
  stop(): void;
  send(event: unknown): void;
  onTransition(listener: (state: unknown) => void): () => void;
  readonly running: boolean;
  /** The machine definition reference — used to detect machine replacement */
  readonly machineRef: unknown;
}

/**
 * Registry that holds running machine services by ID.
 * The Elm runtime uses this to start/stop machines as subscriptions
 * appear and disappear during reconciliation.
 */
export interface MachineRegistry {
  get(id: string): MachineRegistryEntry | undefined;
  register(id: string, entry: MachineRegistryEntry): void;
  unregister(id: string): void;
  has(id: string): boolean;
}

/** Create a new machine registry instance. */
export function createMachineRegistry(): MachineRegistry {
  const entries = new Map<string, MachineRegistryEntry>();

  return {
    get(id: string): MachineRegistryEntry | undefined {
      return entries.get(id);
    },

    register(id: string, entry: MachineRegistryEntry): void {
      entries.set(id, entry);
    },

    unregister(id: string): void {
      const entry = entries.get(id);
      if (entry) {
        if (entry.running) entry.stop();
        entries.delete(id);
      }
    },

    has(id: string): boolean {
      return entries.has(id);
    },
  };
}
