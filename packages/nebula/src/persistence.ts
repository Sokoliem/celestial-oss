// Persistent state: save/restore model state across sessions

/**
 * Storage is caller-owned: these helpers convert a model to and from a string,
 * and never touch the filesystem. That keeps the runtime platform-neutral —
 * the same serializers work against a file, a keychain, or browser storage.
 *
 * (A `storagePath` field used to be declared here and was read by nothing,
 * implying a capability this module does not have.)
 */
export interface PersistenceConfig<Model> {
  key: string;
  version: number;
  select?: (model: Model) => unknown;
  merge?: (persisted: unknown, fresh: Model) => Model;
  migrations?: Record<number, (old: unknown) => unknown>;
}

export interface PersistedData {
  version: number;
  data: unknown;
  savedAt: number;
}

/**
 * Serialize a model for storage. Produces a JSON string containing the
 * version, selected data, and a timestamp.
 *
 * If config.select is provided, only the selected subset of the model is
 * persisted. Otherwise the entire model is stored.
 */
export function serializeForStorage<Model>(config: PersistenceConfig<Model>, model: Model): string {
  const data = config.select ? config.select(model) : model;
  const persisted: PersistedData = {
    version: config.version,
    data,
    savedAt: Date.now(),
  };
  return JSON.stringify(persisted);
}

/**
 * Deserialize a raw JSON string back into a model. Applies migrations if
 * the persisted version differs from the current config version.
 *
 * If config.merge is provided, the persisted data is merged into the
 * freshModel. Otherwise the persisted data is returned directly as the model.
 *
 * Returns freshModel on parse failure.
 */
export function deserializeFromStorage<Model>(config: PersistenceConfig<Model>, raw: string, freshModel: Model): Model {
  let persisted: PersistedData;
  try {
    persisted = JSON.parse(raw) as PersistedData;
  } catch (error) {
    // Resilient but not silent. Returning freshModel alone made a corrupt or
    // truncated save indistinguishable from "nothing was ever saved", so a user
    // whose state was discarded had no way to tell. The version-skew branch
    // below already reports; this one now matches it.
    if (typeof process !== 'undefined' && process.stderr) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[nebula] persistence: could not parse stored data for key "${config.key}" (${detail}). Returning fresh model.\n`);
    }
    return freshModel;
  }

  let data = persisted.data;

  // If persisted data is from a NEWER version than the current app, it may
  // contain incompatible fields or missing expected fields. Return freshModel
  // instead of silently passing through potentially incompatible data.
  if (persisted.version > config.version) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(
        `[nebula] persistence: persisted version (${persisted.version}) is newer than ` +
          `config version (${config.version}). Returning fresh model to avoid incompatible data.\n`,
      );
    }
    return freshModel;
  }

  // Apply forward migrations if versions differ
  if (persisted.version !== config.version && config.migrations) {
    data = migrateData(data, persisted.version, config.version, config.migrations);
  }

  if (config.merge) {
    return config.merge(data, freshModel);
  }

  return data as Model;
}

/**
 * Apply migrations sequentially from fromVersion+1 to toVersion.
 * Missing migrations for intermediate versions are skipped.
 * Returns data unchanged if fromVersion >= toVersion.
 */
export function migrateData(data: unknown, fromVersion: number, toVersion: number, migrations: Record<number, (old: unknown) => unknown>): unknown {
  let current = data;

  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const migration = migrations[v];
    if (migration) {
      current = migration(current);
    }
  }

  return current;
}
