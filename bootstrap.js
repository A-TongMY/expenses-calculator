import { StorageConflictError, StorageError } from "./storage.js";

const blankState = () => ({
  income: 0,
  commitments: [],
  lifestyle: [],
  checkIns: [],
  houses: [],
});

const initialized = (state, etag, migrated, notice) => ({
  state,
  etag,
  migrated,
  notice,
});

export async function initializeState({ storage, confirmMigration = async () => false }) {
  const remote = await storage.loadState();
  if (remote.status === "loaded") {
    if (
      !remote.state ||
      typeof remote.state !== "object" ||
      typeof remote.etag !== "string" ||
      !remote.etag
    ) {
      throw new StorageError("The remote service returned an invalid loaded state.");
    }
    return initialized(remote.state, remote.etag, false, null);
  }
  if (remote.status !== "empty") {
    throw new StorageError("The remote service returned an invalid state result.");
  }

  const legacy = storage.loadLegacyState();
  if (!legacy || !["available", "absent", "invalid", "unavailable"].includes(legacy.status)) {
    throw new StorageError("The browser returned an invalid legacy state result.");
  }
  if (legacy.status === "available") {
    if (
      typeof legacy.backup !== "string" ||
      !legacy.state ||
      typeof legacy.state !== "object"
    ) {
      throw new StorageError("The browser returned an invalid legacy backup.");
    }
  }
  if (legacy.status === "available" && (await confirmMigration(legacy))) {
    try {
      const migration = await storage.migrateLegacyState(legacy.backup);
      if (
        !migration ||
        !migration.state ||
        typeof migration.state !== "object" ||
        typeof migration.etag !== "string" ||
        !migration.etag
      ) {
        throw new StorageError("The migration did not return a valid remote state.");
      }
      return initialized(migration.state, migration.etag, true, legacy.notice ?? null);
    } catch (error) {
      if (!(error instanceof StorageConflictError)) throw error;
      const winner = await storage.loadState();
      if (
        winner.status !== "loaded" ||
        !winner.state ||
        typeof winner.state !== "object" ||
        typeof winner.etag !== "string" ||
        !winner.etag
      ) {
        throw new StorageError("The state created by another device could not be loaded.");
      }
      return initialized(
        winner.state,
        winner.etag,
        false,
        "Another device initialized the remote account first. Its state has been loaded.",
      );
    }
  }

  return initialized(blankState(), null, false, legacy.notice ?? null);
}
