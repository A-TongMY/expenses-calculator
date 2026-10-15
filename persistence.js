export function createSaveQueue({ save, onStatus = () => {}, delay = 300 }) {
  let pending = null;
  let timer = null;
  let inFlight = null;
  let stopped = false;
  let savingAnnounced = false;

  const notify = (status) => onStatus(status);
  const announceSaving = () => {
    if (savingAnnounced) return;
    savingAnnounced = true;
    notify("saving");
  };
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
    if (stopped) return;
    if (inFlight) {
      await inFlight;
      if (pending !== null) return flush();
      return;
    }
    if (pending === null) return;

    const snapshot = pending;
    pending = null;
    announceSaving();
    const operation = Promise.resolve()
      .then(() => save(snapshot))
      .then(() => {
        if (pending === null) {
          savingAnnounced = false;
          if (!stopped) notify("saved");
        }
      })
      .catch((error) => {
        savingAnnounced = false;
        if (!stopped) {
          const hasNewerEdit = pending !== null;
          pending ??= snapshot;
          notify("error");
          if (hasNewerEdit) schedule();
        }
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = operation;
    await operation;
    if (pending !== null && !stopped) return flush();
  };

  return {
    enqueue(state) {
      if (stopped) throw new Error("The save queue is stopped.");
      pending = structuredClone(state);
      announceSaving();
      schedule();
    },

    flush,

    stop() {
      cancelTimer();
      pending = null;
      stopped = true;
      savingAnnounced = false;
    },
  };
}
