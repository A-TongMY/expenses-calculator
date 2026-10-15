const STATE_KEY = "state";

export class StateConflictError extends Error {
  constructor() {
    super("The stored state changed before the write completed.");
    this.name = "StateConflictError";
  }
}

export function createBlobStateStore(store) {
  return {
    async read() {
      const result = await store.getWithMetadata(STATE_KEY, { type: "text" });
      if (result === null) return null;
      if (typeof result.data !== "string" || typeof result.etag !== "string") {
        throw new Error("The stored state metadata is unavailable.");
      }
      return { backup: result.data, etag: result.etag };
    },

    async write(backup, { etag, onlyIfNew } = {}) {
      let conditions;
      if (onlyIfNew === undefined && etag === undefined) {
        conditions = {};
      } else if (onlyIfNew === true && etag === undefined) {
        conditions = { onlyIfNew: true };
      } else if (onlyIfNew !== true && typeof etag === "string" && etag) {
        conditions = { onlyIfMatch: etag };
      } else {
        throw new TypeError("The state write condition is invalid.");
      }

      const result = await store.set(STATE_KEY, backup, conditions);
      if (result.modified === false) throw new StateConflictError();
      if (typeof result.etag !== "string" || !result.etag) {
        throw new Error("The state write did not return an ETag.");
      }
      return { etag: result.etag };
    },
  };
}
