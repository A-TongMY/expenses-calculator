import { exportBackup, readBackup } from "./backup.js";

export const STORAGE_KEY = "expenses-calculator";

export class StorageError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

export class AuthRequiredError extends StorageError {
  constructor() {
    super("Sign in with the allowed GitHub account to access your data.", 401);
    this.name = "AuthRequiredError";
  }
}

export class StorageConflictError extends StorageError {
  constructor() {
    super("The remote state changed before this write completed.", 409);
    this.name = "StorageConflictError";
  }
}

const parseResponseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const validatedBackup = (value) => {
  try {
    const { state, notice } = readBackup(typeof value === "string" ? value : exportBackup(value));
    return { state, backup: exportBackup(state), notice };
  } catch {
    throw new StorageError("The expense data is not a valid backup.");
  }
};

export function createStorageClient({ fetchImpl = fetch, storage } = {}) {
  const getStorage = () => {
    if (storage !== undefined) return storage;
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  };

  const requestState = async (options) => {
    try {
      return await fetchImpl("/api/state", {
        ...options,
        credentials: "same-origin",
        headers: { accept: "application/json", ...options.headers },
      });
    } catch {
      throw new StorageError("The remote expense service could not be reached.");
    }
  };

  const writeBackup = async (backup, writeCondition) => {
    const response = await requestState({
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(writeCondition?.onlyIfNew
          ? { "If-None-Match": "*" }
          : {}),
      },
      body: JSON.stringify({ backup, ...(writeCondition ? { writeCondition } : {}) }),
    });
    if (response.status === 401) throw new AuthRequiredError();
    if (response.status === 409) throw new StorageConflictError();
    if (response.status !== 200) {
      throw new StorageError("The remote expense data could not be saved.", response.status);
    }
    const body = await parseResponseJson(response);
    if (body?.ok !== true) {
      throw new StorageError("The remote service returned an invalid save acknowledgement.");
    }
  };

  return {
    async loadState() {
      const response = await requestState({ method: "GET" });
      const body = await parseResponseJson(response);
      if (response.status === 401) throw new AuthRequiredError();
      if (response.status === 404 && body?.error === "state_not_found") {
        return { status: "empty" };
      }
      if (response.status !== 200) {
        throw new StorageError("The remote expense data could not be loaded.", response.status);
      }
      if (!body || typeof body.backup !== "string") {
        throw new StorageError("The remote service returned an invalid state response.");
      }
      const { state, notice } = validatedBackup(body.backup);
      if (body.notice != null && typeof body.notice !== "string") {
        throw new StorageError("The remote service returned an invalid upgrade notice.");
      }
      const upgradeNotice = body.notice ?? notice;
      return { status: "loaded", state, ...(upgradeNotice ? { notice: upgradeNotice } : {}) };
    },

    async saveState(state) {
      const { backup } = validatedBackup(state);
      await writeBackup(backup);
    },

    loadLegacyState() {
      let saved;
      try {
        const browserStorage = getStorage();
        if (!browserStorage) throw new Error("Browser storage is unavailable.");
        saved = browserStorage.getItem(STORAGE_KEY);
      } catch {
        return {
          status: "unavailable",
          notice: "This browser's saved data could not be checked. It has not been changed.",
        };
      }
      if (saved === null) return { status: "absent" };
      if (typeof saved !== "string") {
        return {
          status: "invalid",
          notice: "The saved data in this browser could not be read as an expense backup.",
        };
      }
      try {
        const { state, notice } = readBackup(saved);
        return { status: "available", backup: saved, state, ...(notice ? { notice } : {}) };
      } catch {
        return {
          status: "invalid",
          notice: "The saved data in this browser is not a valid expense backup. The original was kept.",
        };
      }
    },

    async migrateLegacyState(backup) {
      const validated = validatedBackup(backup);
      await writeBackup(validated.backup, { onlyIfNew: true });
      return {
        status: "migrated",
        state: validated.state,
        ...(validated.notice ? { notice: validated.notice } : {}),
      };
    },
  };
}
