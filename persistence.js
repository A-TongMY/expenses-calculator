import { StorageConflictError } from "./storage.js";

export function createSaveQueue({ save, onStatus = () => {}, etag = null, delay = 300 }) {
  let currentEtag = etag;
  let pending = null;
  let timer = null;
  let inFlight = null;
  let pausedError = null;
  let stopped = false;

  const notify = (status) => onStatus(status);
  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      // flush reports failures through onStatus and keeps the latest snapshot for recovery.
      void flush().catch(() => {});
    }, delay);
  };

  const flush = async () => {
    cancelTimer();
    if (stopped) return currentEtag;
    if (pausedError) throw pausedError;
    if (inFlight) {
      await inFlight;
      if (pending !== null) return flush();
      return currentEtag;
    }
    if (pending === null) return currentEtag;

    const snapshot = pending;
    pending = null;
    notify("saving");
    const operation = Promise.resolve()
      .then(() => save(snapshot, currentEtag))
      .then((nextEtag) => {
        if (typeof nextEtag !== "string" || !nextEtag) {
          throw new TypeError("A successful save must return an ETag.");
        }
        currentEtag = nextEtag;
        if (!stopped) notify("saved");
        return currentEtag;
      })
      .catch((error) => {
        pending ??= snapshot;
        pausedError = error;
        if (!stopped) {
          notify(error instanceof StorageConflictError ? "conflict" : "error");
        }
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = operation;
    const result = await operation;
    if (pending !== null && !stopped) return flush();
    return result;
  };

  return {
    enqueue(state) {
      if (stopped) throw new Error("The save queue is stopped.");
      pending = structuredClone(state);
      if (!pausedError) schedule();
    },

    flush,

    reset(remoteEtag) {
      if (inFlight) throw new Error("The save queue cannot reset during a write.");
      cancelTimer();
      pending = null;
      pausedError = null;
      stopped = false;
      currentEtag = remoteEtag;
    },

    stop() {
      cancelTimer();
      pending = null;
      stopped = true;
    },
  };
}
