import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveQueue } from "../persistence.js";

const state = (income) => ({
  income, commitments: [], lifestyle: [], houses: [], spending: [],
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("rapid queued changes coalesce to the newest detached snapshot", async (t) => {
  const calls = [];
  const statuses = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => { calls.push(snapshot); },
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());
  queue.enqueue(state(100));
  const latest = state(200);
  queue.enqueue(latest);
  latest.income = 999;
  await queue.flush();
  assert.deepEqual(calls, [state(200)]);
  assert.deepEqual(statuses, ["saving", "saved"]);
});

test("enqueue immediately reports edits waiting to be saved", (t) => {
  const statuses = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async () => {},
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());
  queue.enqueue(state(100));
  assert.deepEqual(statuses, ["saving"]);
});

test("successive manual saves need no returned storage version", async (t) => {
  const calls = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => { calls.push(snapshot); },
  });
  t.after(() => queue.stop());
  queue.enqueue(state(100));
  await queue.flush();
  queue.enqueue(state(200));
  await queue.flush();
  assert.deepEqual(calls, [state(100), state(200)]);
});

test("import and later edits wait for an in-flight save in order", async (t) => {
  const calls = [];
  const statuses = [];
  const started = deferred();
  const release = deferred();
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => {
      calls.push(snapshot);
      if (calls.length === 1) {
        started.resolve();
        await release.promise;
      }
    },
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => { release.resolve(); queue.stop(); });
  queue.enqueue(state(100));
  const firstFlush = queue.flush();
  await started.promise;
  queue.enqueue(state(200));
  const importFlush = queue.flush();
  queue.enqueue(state(300));
  assert.deepEqual(calls, [state(100)]);
  release.resolve();
  await Promise.all([firstFlush, importFlush]);
  assert.deepEqual(calls, [state(100), state(300)]);
  assert.deepEqual(statuses, ["saving", "saved"]);
});

test("a failed save remains visibly unsaved without automatically retrying", async (t) => {
  const calls = [];
  const statuses = [];
  const failure = new Error("network unavailable");
  const queue = createSaveQueue({
    delay: 0,
    save: async (snapshot) => { calls.push(snapshot); throw failure; },
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());
  queue.enqueue(state(100));
  await assert.rejects(queue.flush(), failure);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, [state(100)]);
  assert.deepEqual(statuses, ["saving", "error"]);
});

test("explicit Retry resends retained unsaved data without a reset", async (t) => {
  const calls = [];
  const statuses = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => {
      calls.push(snapshot);
      if (calls.length === 1) throw new Error("offline");
    },
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());
  queue.enqueue(state(100));
  await assert.rejects(queue.flush(), /offline/);
  await queue.flush();
  assert.deepEqual(calls, [state(100), state(100)]);
  assert.deepEqual(statuses, ["saving", "error", "saving", "saved"]);
});

test("the next edit resumes saving the newest snapshot after failure", async (t) => {
  const calls = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => {
      calls.push(snapshot);
      if (calls.length === 1) throw new Error("offline");
    },
  });
  t.after(() => queue.stop());
  queue.enqueue(state(100));
  await assert.rejects(queue.flush(), /offline/);
  queue.enqueue(state(200));
  queue.enqueue(state(300));
  await queue.flush();
  assert.deepEqual(calls, [state(100), state(300)]);
});

test("import after a failed save replaces the retained snapshot", async (t) => {
  const calls = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => {
      calls.push(snapshot);
      if (calls.length === 1) throw new Error("offline");
    },
  });
  t.after(() => queue.stop());
  queue.enqueue(state(9000));
  await assert.rejects(queue.flush(), /offline/);
  queue.enqueue(state(1000));
  await queue.flush();
  assert.deepEqual(calls, [state(9000), state(1000)]);
});

test("an edit queued during a failing save still gets its scheduled attempt", { timeout: 2000 }, async (t) => {
  const calls = [];
  const started = deferred();
  const release = deferred();
  const saved = deferred();
  const queue = createSaveQueue({
    delay: 0,
    save: async (snapshot) => {
      calls.push(snapshot);
      if (calls.length === 1) {
        started.resolve();
        await release.promise;
        throw new Error("offline");
      }
    },
    onStatus: (status) => { if (status === "saved") saved.resolve(); },
  });
  t.after(() => { release.resolve(); queue.stop(); });
  queue.enqueue(state(100));
  const failing = assert.rejects(queue.flush(), /offline/);
  await started.promise;
  queue.enqueue(state(200));
  // Let the new edit's timer encounter the still-running write before it fails.
  await new Promise((resolve) => setTimeout(resolve, 20));
  release.resolve();
  await failing;
  await saved.promise;
  assert.deepEqual(calls, [state(100), state(200)]);
});

test("stopping during a write prevents pending writes and saved notifications", async () => {
  const calls = [];
  const statuses = [];
  const started = deferred();
  const release = deferred();
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (snapshot) => {
      calls.push(snapshot);
      started.resolve();
      await release.promise;
    },
    onStatus: (status) => statuses.push(status),
  });
  queue.enqueue(state(100));
  const writing = queue.flush();
  await started.promise;
  queue.enqueue(state(200));
  queue.stop();
  release.resolve();
  await writing;
  assert.deepEqual(calls, [state(100)]);
  assert.deepEqual(statuses, ["saving"]);
  assert.throws(() => queue.enqueue(state(300)), /stopped/);
});
